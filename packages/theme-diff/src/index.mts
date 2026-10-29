import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-iframe/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(context: LoadContext): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-diff',
    loadContent() {
      // 本层的 `ViewLayerDocItem` 住在 theme-iframe 未编译的 `lib/` 里：那个包没装，
      // 站点就会在 `view-layer-shell.tsx` 上撞 `Module not found`。
      assertThemePrerequisites(context, {
        namespace: '@show-docs/docusaurus-theme-diff',
        iframe: true,
      });
    },
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 剩下的东西（入口、loader、类型）。
    //
    // 「谁来编」归 `@show-docs/docusaurus-plugin-prev-layer-resolver`（它按 `@show-docs`
    // 这个 scope 认领 `node_modules` 里的 TS 源码），本包不自己补 babel 规则。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 样式表不是模块，`tsc` 不会把它搬进 `dist/`：官方样式按包名解析，作为 client module
    // 交给站点的样式表（效果等同源码里那句 `import '….css'`）。
    getClientModules() {
      return [
        require.resolve('@git-diff-view/react/styles/diff-view-pure.css'),
      ];
    },
    configureWebpack() {
      return {
        module: {
          rules: [
            {
              // md 由官方 mdx-loader 编译，这里只能在其产物后追加导出
              enforce: 'post',
              test: /\.md$/,
              // Webpack 按**文件路径**取 loader，不走模块解析，所以这里写的必须是产物名
              // （`.mjs`），不是源码名 —— 上面的 `thisDir` 就是 `dist/`。
              loader: resolve(thisDir, './loader/md-diff-loader.mjs'),
            },
          ],
        },
      };
    },
  };
}
