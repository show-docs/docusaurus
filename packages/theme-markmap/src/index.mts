import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { needsSiteJsRule } from '@show-docs/docusaurus-theme-iframe/lib/api-frame-source-js-rule.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-iframe/lib/prerequisites.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 包根：那条 `.tsx?` 规则的认领范围。 */
const packageRoot = resolve(thisDir, '..');

export default function theme(context: LoadContext): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-markmap',
    loadContent() {
      // 本层的 `ViewLayerDocItem` 住在 theme-iframe 未编译的 `lib/` 里：那个插件不注册，
      // 它的 babel 规则就不在，站点会在 `view-layer-shell.tsx` 上撞 `Module parse failed`。
      assertThemePrerequisites(context, {
        namespace: '@show-docs/docusaurus-theme-markmap',
        iframe: true,
      });
    },
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
              // 官方那条 babel 规则排除整个 node_modules、只放行 `docusaurus*.js`，本包装进真项目
              // 之后那些未编译的 `.tsx` 会报 `Module parse failed`。补一条覆盖包根的规则接上这一格，
              // 但只在官方不认的地方认领 —— 工作区里它们是链到 `node_modules` 之外的，官方本来就在编，
              // 再命中就是白跑一遍 babel。判据见 theme-iframe 的 `lib/api-frame-source-js-rule.ts`。
              test: /\.tsx?$/,
              include: (file: string) => needsSiteJsRule(packageRoot, file),
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
