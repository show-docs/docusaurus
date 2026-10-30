import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { isolateRendererCss } from '@show-docs/docusaurus-theme-component-page/lib/isolate-renderer-css.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-component-page/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本层的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-scalar';

/**
Scalar 那份静态样式表：框内那一页才需要它（`components/scalar-ui.css` 自己那几条也一样），
所以它应该只出现在框内那份文档里，而不是每个页面都 `<link>` 同一份 220 KB —— 做法与另两条 API 层
同一份（`@show-docs/docusaurus-theme-component-page/lib/isolate-renderer-css.ts`，为什么非在构建期
动手记在那份文件头）。`file` 认的是那份文件**真实落到的路径**：`@scalar/api-reference/style.css`
是 `exports` 里的一条映射，解析后落在 `dist/style.css`（实测 webpack 的 `resource` 就是它）——
认包根那条路径会一条都匹配不上，样式表照旧并进全站那一份。`probe` 是拿它去试官方那条 `.css`
规则的假路径。
*/
const SCALAR_CSS = {
  file: /[\\/]@scalar[\\/]api-reference[\\/](?:dist[\\/])?style\.css$/i,
  probe: '/a/node_modules/@scalar/api-reference/dist/style.css',
};

/** 要按住的动态 `import` 出在 `@scalar/api-reference` 里的那个具体文件（判据不是全局消息匹配）。 */
const SCALAR_PLUGIN_URLS_MODULE =
  /@scalar[\\/]api-reference[\\/].*[\\/]load-plugins-from-urls\.js/;

/**
Scalar 这一层的入口：本包交出**一份组件与一条规则**（`scalar:` 那一把键、框内渲染
`@theme/ScalarView`），外层那一格框、那条握手循环与框内那份文档都在
`@show-docs/docusaurus-theme-component-page` 里 —— 本包因此不依赖 `theme-iframe`，
卸载它这一层照常可用。

命中的页由 component-page 那份 `DocItem` 判表后换成一个同源框，框里按登记名 `scalar` 取
`@theme/ScalarView`；`oas3:` / `aas3:` 那两把键怎么挑、亮暗怎么落到 Scalar 身上，都归
`theme/ScalarView` 与 `components/` 里那两份，机制层不认识这些业务键。

本包的 webpack 差异只有两格：把 Scalar 那份静态样式表摘出全站 css（见上面 `SCALAR_CSS` 那段，
实测记在 `docs/internals.md` 的「样式」一节），以及按住它那条动态 `import` 的构建告警
（客户端与服务端两遍各报一次，理由与实测同在一节）。
*/
export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 交出的那一页要由 component-page 判表才挂得上来；解析器插件缺了则是本包那几份
      // 未编译的 `.tsx` / `.ts` 没人认领。两样都在这里点名，而不是让 webpack 在某个页面文件
      // 上抛、或让那一页安静地不出现。
      assertThemePrerequisites(context, {
        namespace: NAMESPACE,
        componentPage: true,
      });

      return {
        componentPage: {
          components: [{ id: 'scalar', component: '@theme/ScalarView' }],
          rules: [
            {
              key: 'scalar',
              match: 'boolean',
              component: 'scalar',
              render: 'iframe',
            },
          ],
        },
      } satisfies ComponentPageContent;
    },
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus 项目
    // 会用自己的 babel 编译它们。这里只编译 `src/` 那一份（入口）。
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
    configureWebpack(config) {
      // 改的是传进来的 config 本身，不走返回值（官方拼接走 webpack-merge，返回整体会把数组
      // concat 翻倍）。样式表的边界客户端与服务端都要改。
      isolateRendererCss(config, {
        file: SCALAR_CSS.file,
        probe: SCALAR_CSS.probe,
      });

      // `ignoreWarnings` 在两侧构建都要（那条告警 client/server 各报一次），所以不分 isServer。
      return {
        ignoreWarnings: [{ module: SCALAR_PLUGIN_URLS_MODULE }],
      };
    },
  };
}
