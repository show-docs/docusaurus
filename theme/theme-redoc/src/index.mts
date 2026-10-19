import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoadContext, Plugin, RouteConfig } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/**
Redoc 那一页挂在哪一条路径上。

这个名字在 `components/redoc-frame-sync.ts` 里还有一份：那一份拼 iframe 的地址，
这一份注册路由。两边站在编译边界的两侧（`src/` 经 tsc 进 `dist/`，`components/` 是源码、
由用本包的站点编译），共享不了，改要一起改。`baseUrl` 不在这里出现两次：
这一格从 context 取，那一份从 `useDocusaurusContext()` 取，都是站点配置里的同一个值。
*/
const REDOC_VIEW_ROUTE = 'redoc-view';

export default function theme(context: LoadContext): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-redoc',
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。本包要编译的只有这一份入口（它跑在构建配置期）。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
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
      // 和 `plugin-prev-layer-resolver` / theme-stoplight 一样**只返回自己新增的那一格**：
      // 官方 `applyConfigureWebpack` 用 webpack-merge 拼接，改完整个 config 再返回去，
      // 数组会被 concat 一遍（`rules` 翻倍 → 每个 css 文件被 css-loader 处理两次）。
      return isServer
        ? {}
        : { resolve: { fallback: { worker_threads: false } } };
    },
    contentLoaded({ actions }) {
      // 给 Redoc 用的那一个**独立页面**：它不是文档页，没有 frontmatter 可判，所以走官方
      // 那条插件路由 API（和 `theme-search-algolia` 注册搜索页同一形状）。命中 `redoc:` 的
      // 文档页把这个地址嵌进 iframe，Redoc 的运行时（styled-components 往 `<head>` 插的那张表、
      // `localStorage`、它自己的路由）就整个关在框里那份文档内，站点的文档页一行都碰不到 ——
      // 口径与取舍见包 README 的「渲染放在独立页面，文档页只嵌它」一节。
      //
      // `component` 写别名而不是绝对路径：`theme/` 由 `getThemePath()` 挂进 `@theme/*`，
      // 打包器按这个别名找得到，站点那边的 swizzle 也还能覆写它。
      actions.addRoute({
        path: `${context.siteConfig.baseUrl.replace(/\/$/, '')}/${REDOC_VIEW_ROUTE}`,
        component: '@theme/RedocPage',
        exact: true,
      } satisfies RouteConfig);
    },
  };
}
