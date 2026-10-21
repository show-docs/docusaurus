import { createApiFrameTheme } from '@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts';

import type { LoadContext, Plugin } from '@docusaurus/types';

/** 本层的包名，同时是注册表与三条 postMessage 的命名空间。 */
const SCALAR_NAMESPACE = '@show-docs/docusaurus-theme-scalar';

/** 要按住的动态 `import` 出在 `@scalar/api-reference` 里的那个具体文件（判据不是全局消息匹配）。 */
const SCALAR_PLUGIN_URLS_MODULE =
  /@scalar[\\/]api-reference[\\/].*[\\/]load-plugins-from-urls\.js/;

/**
Scalar 这一层的入口：外层套壳（`DocItem` 判 `scalar:`、那个 `<iframe>`、两条消息循环）
都在 `@show-docs/docusaurus-theme-iframe`（注册表里那条 `internal` 条目），本包只交出三样 ——
这条入口、框内那条 `theme/ScalarPage` 页面、`components/` 里 Scalar 自己的渲染接线。

路由名、参数名、类名、消息命名空间都取自 theme-iframe 的注册表（配置期与浏览器期同一份
源码），不再有「编译边界两侧各写一份常量」这件事。

本包唯一的 webpack 差异是按住 Scalar 那条动态 `import` 的构建告警（客户端与服务端两遍
各报一次，理由与实测记在包 `docs/internals.md` 的「随这一层多出来的构建告警」一节）；样式表不需要
构建期动手，见 `docs/internals.md` 的「样式」一节。
*/
export default function theme(context: LoadContext): Plugin {
  return createApiFrameTheme(context, {
    namespace: SCALAR_NAMESPACE,
    // 入口产物（dist/）的位置：工厂按它算层目录，并在当场校验那格存在。
    selfEntryUrl: import.meta.url,
    configureWebpack() {
      // 照 `theme-redoc` / `theme-stoplight` 的口径**只返回自己新增的那一格**：官方拼接走
      // webpack-merge，改完整个 config 再返回去会把数组 concat 翻倍。
      // `ignoreWarnings` 在两侧构建都要（那条告警 client/server 各报一次），所以不分 isServer。
      return {
        ignoreWarnings: [{ module: SCALAR_PLUGIN_URLS_MODULE }],
      };
    },
  });
}
