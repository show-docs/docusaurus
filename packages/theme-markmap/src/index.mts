import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-component-page/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本包的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-markmap';

/**
本层的入口：`getThemePath()` 挂本包那一层（里面只有 `MarkmapPage` 与它依赖的导图组件），
`loadContent()` 交出**一份组件与一条规则**（`markmap` 那一把键、`@theme/MarkmapPage`），
判表与挂载都在 `@show-docs/docusaurus-theme-component-page` 里。于是本层只有一个前提：
那一层（连同它背后的解析器插件）；缺了它们，页面看着正常但导图不出现。

`markmap` 那把键的判法是 `options`：写 `true` 或一个选项对象都算命中 —— 后者既是开关，
也是交给导图组件的那份选项；写 `false` / 空值不算。命中后整页交给 `@theme/MarkmapPage`
（`render` 缺省即 `page`：视图摆在正文上方，不另起一份文档）。

组件写的是 `@theme/MarkmapPage` 而不是硬路径：站点在 `src/theme/MarkmapPage` 放一份就覆写掉它，
与站点自己那一列同一条口径。
*/
export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 交出的那一页要由 component-page 判表才挂得上来；解析器插件缺了则是本包那几份
      // 未编译的 `.tsx` / `.ts` 没人认领。都在这里点名，而不是让 webpack 在某个页面文件上抛、
      // 或让那一页安静地不出现。
      assertThemePrerequisites(context, {
        namespace: NAMESPACE,
        componentPage: true,
      });

      return {
        componentPage: {
          components: [{ id: 'markmap', component: '@theme/MarkmapPage' }],
          rules: [{ key: 'markmap', match: 'options', component: 'markmap' }],
        },
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
  };
}
