import { createApiFrameTheme } from '@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts';

import type { LoadContext, Plugin } from '@docusaurus/types';

// 本层的包名，同时是注册表与三条 postMessage 的命名空间。
const REDOC_NAMESPACE = '@show-docs/docusaurus-theme-redoc';

/**
Redoc 这一层的入口：外层套壳（`DocItem` 判 `redoc:`、那个 `<iframe>`、两条消息循环）
都在 `@show-docs/docusaurus-theme-iframe`（注册表里那条 `internal` 条目），本包只交出三样 ——
这条入口、框内那条 `theme/RedocPage` 页面、`components/` 里 Redoc 自己的渲染接线。

路由名、参数名、类名、消息命名空间都取自 theme-iframe 的注册表（配置期与浏览器期同一份
源码），不再有「编译边界两侧各写一份常量」这件事。
*/
export default function theme(context: LoadContext): Plugin {
  return createApiFrameTheme(context, {
    namespace: REDOC_NAMESPACE,
    // 入口产物（dist/）的位置：工厂按它算层目录，并在当场校验那格存在。
    selfEntryUrl: import.meta.url,
    configureWebpack(_config, isServer) {
      // `redoc` 发的是打好的 ESM 包（`bundles/redoc.js`），外面那一层 webpack 仍然要按
      // 静态分析去解析它里面的每一条 `require`。它有一支 Node 分支长这样：
      //
      //   typeof module !== 'undefined' ? new (require('worker_threads').Worker)(...) : import('worker_threads')
      //
      // 浏览器里那个条件为假、跑不到，但**解析这一步照样红**（`Module not found: worker_threads`）。
      // 服务端有真的 Node 模块，不用管；浏览器这一格给 `false`（空模块），比补 polyfill 诚实：
      // 那支 Worker 是给「离线把文档再算一遍」用的，本仓这条路径不碰它。
      //
      // 照 `plugin-prev-layer-resolver` 的口径**只返回自己新增的那一格**（返回整个 config 会被
      // webpack-merge 把数组 concat 翻倍，理由记在它的维护者文档
      // `packages/plugin-prev-layer-resolver/docs/internals.md`）。
      return isServer
        ? {}
        : { resolve: { fallback: { worker_threads: false } } };
    },
  });
}
