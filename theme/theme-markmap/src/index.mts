import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-markmap',
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 剩下的东西（入口、loader、类型）。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 样式表不是模块，`tsc` 不会把它搬进 `dist/`：官方样式按包名解析，本仓那份留在包根
    // `styles/`，两者都作为 client module 交给站点的样式表（效果等同源码里那句 `import '….css'`）。
    getClientModules() {
      return [
        require.resolve('markmap-toolbar/dist/style.css'),
        resolve(thisDir, '../styles/markmap.css'),
      ];
    },
    configureWebpack(_config, isServer, utils) {
      return {
        module: {
          rules: [
            {
              // 官方那条 babel 规则排除整个 node_modules、只放行 `docusaurus*.js`，本包从
              // npm 安装后的 `.tsx` 会报 `Module parse failed`。补一条只覆盖本包的规则
              // （理由与代价见 theme-iframe 的 `lib/api-frame-theme.mts` 里同一条）。
              test: /\.tsx?$/,
              include: [resolve(thisDir, '..')],
              use: [utils.getJSLoader({ isServer })],
            },
            {
              // md 由官方 mdx-loader 编译，这里只能在其产物后追加导出
              enforce: 'post',
              test: /\.md$/,
              // Webpack 按**文件路径**取 loader，不走模块解析，所以这里写的必须是产物名
              // （`.mjs`），不是源码名 —— 上面的 `thisDir` 就是 `dist/`。
              loader: resolve(thisDir, './loader/md-markmap-loader.mjs'),
            },
          ],
        },
      };
    },
  };
}
