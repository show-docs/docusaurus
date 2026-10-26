import { createApiFrameTheme } from '@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts';
import { isolateRendererCss } from '@show-docs/docusaurus-theme-iframe/lib/isolate-renderer-css.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

/** 本层的包名，同时是注册表与三条 postMessage 的命名空间。 */
const SCALAR_NAMESPACE = '@show-docs/docusaurus-theme-scalar';

/**
Scalar 那份静态样式表：框内那一页才需要它（`components/scalar-ui.css` 自己那几条也一样），
所以它应该只出现在框内那份文档里，而不是每个页面都 `<link>` 同一份 220 KB —— 做法与另两条 API 层
同一份（`@show-docs/docusaurus-theme-iframe/lib/isolate-renderer-css.ts`，为什么非在构建期动手记在那份文件头）。
`file` 认的是那份文件**真实落到的路径**：`@scalar/api-reference/style.css` 是 `exports` 里的一条
映射，解析后落在 `dist/style.css`（实测 webpack 的 `resource` 就是它）—— 认包根那条路径会一条
都匹配不上，样式表照旧并进全站那一份。`probe` 是拿它去试官方那条 `.css` 规则的假路径。
*/
const SCALAR_CSS = {
  file: /[\\/]@scalar[\\/]api-reference[\\/](?:dist[\\/])?style\.css$/i,
  probe: '/a/node_modules/@scalar/api-reference/dist/style.css',
};

/** 要按住的动态 `import` 出在 `@scalar/api-reference` 里的那个具体文件（判据不是全局消息匹配）。 */
const SCALAR_PLUGIN_URLS_MODULE =
  /@scalar[\\/]api-reference[\\/].*[\\/]load-plugins-from-urls\.js/;

/**
Scalar 这一层的入口：外层套壳（`DocItem` 判 `scalar:`、那个 `<iframe>`、两条消息循环）
都在 `@show-docs/docusaurus-theme-iframe`（注册表里那条 `internal` 条目），本包只交出三样 ——
这条入口、框内那条 `theme/ScalarPage` 页面、`components/` 里 Scalar 自己的渲染接线。

路由名、参数名、类名、消息命名空间都取自 theme-iframe 的注册表（配置期与浏览器期同一份
源码），不再有「编译边界两侧各写一份常量」这件事。

本包的 webpack 差异只有两格：把 Scalar 那份静态样式表摘出全站 css（见上面 `SCALAR_CSS`
那段，实测记在 `docs/internals.md` 的「样式」一节），以及按住它那条动态 `import` 的构建告警
（客户端与服务端两遍各报一次，理由与实测同在一节）。
*/
export default function theme(context: LoadContext): Plugin {
  return createApiFrameTheme(context, {
    namespace: SCALAR_NAMESPACE,
    // 入口产物（dist/）的位置：工厂按它算层目录，并在当场校验那格存在。
    selfEntryUrl: import.meta.url,
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
  });
}
