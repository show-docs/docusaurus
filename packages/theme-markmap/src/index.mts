import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-iframe/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { MARKMAP_COMPONENT_PAGES } from './component-pages.mts';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本包的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-markmap';

/**
本层的入口：`getThemePath()` 挂本包那一层（里面只有 `MarkmapPage` 与它依赖的导图组件），
`loadContent()` 把 `markmap` 那一把键交给 `@show-docs/docusaurus-theme-component-page` ——
命中的页由它那份 `DocItem` 判清单后整页换成 `@theme/MarkmapPage`。于是本层的前提有两个：
共享外壳所在的 `theme-iframe`，与判清单的 `component-page`；缺了它们，页面看着正常但导图不出现。
*/
export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 共享外壳的 `ViewLayerDocItem` 住在 theme-iframe 未编译的 `lib/` 里：那个包没装，
      // 站点就会在 `view-layer-shell.tsx` 上撞 `Module not found`。component-page 缺了则是
      // 另一头的症状：那一页永远不会被交给 `@theme/MarkmapPage`。
      assertThemePrerequisites(context, {
        namespace: NAMESPACE,
        iframe: true,
        componentPage: true,
      });

      return {
        componentPages: MARKMAP_COMPONENT_PAGES,
      } satisfies ComponentPageContent;
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
    // 样式表不是模块，`tsc` 不会把它搬进 `dist/`：官方样式按包名解析，本仓那份留在包根
    // `styles/`，两者都作为 client module 交给站点的样式表（效果等同源码里那句 `import '….css'`）。
    getClientModules() {
      return [
        require.resolve('markmap-toolbar/dist/style.css'),
        resolve(thisDir, '../styles/markmap.css'),
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
              loader: resolve(thisDir, './loader/md-markmap-loader.mjs'),
            },
          ],
        },
      };
    },
    // `markmap` 那一把键的条目写在 `./component-pages.mts`，由上面的 `loadContent()` 交回。
  };
}
