import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoadContext, Plugin, RouteConfig } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/**
Scalar 那一页挂在哪一条路径上。

这个名字在 `components/scalar-frame-sync.ts` 里还有一份：那一份拼 iframe 的地址，
这一份注册路由。两边站在编译边界的两侧（`src/` 经 tsc 进 `dist/`，`components/` 是源码、
由用本包的站点编译），共享不了，改要一起改。`baseUrl` 不在这里出现两次：
这一格从 context 取，那一份从 `useDocusaurusContext()` 取，都是站点配置里的同一个值。
*/
const SCALAR_VIEW_ROUTE = 'scalar-view';

export default function theme(context: LoadContext): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-scalar',
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。本包要编译的只有这一份入口（它跑在构建配置期）。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    contentLoaded({ actions }) {
      // 给 Scalar 用的那一个**独立页面**：它不是文档页，没有 frontmatter 可判，所以走官方
      // 那条插件路由 API（和 `theme-search-algolia` 注册搜索页同一形状）。命中 `scalar:` 的
      // 文档页把这个地址嵌进 iframe，Scalar 的运行时（它自己的路由、它写的 localStorage、
      // 它落在 `<body>` 上的那两个类名）就整个关在框里那份文档内，站点的文档页一行都碰不到 ——
      // 口径与取舍见包 README 的「渲染放在独立页面，文档页只嵌它」一节，也见 theme-redoc
      // 与 theme-stoplight 的同一节（这三层是同一个形状）。
      //
      // `component` 写别名而不是绝对路径：`theme/` 由 `getThemePath()` 挂进 `@theme/*`，
      // 打包器按这个别名找得到，站点那边的 swizzle 也还能覆写它。
      actions.addRoute({
        path: `${context.siteConfig.baseUrl.replace(/\/$/, '')}/${SCALAR_VIEW_ROUTE}`,
        component: '@theme/ScalarPage',
        exact: true,
      } satisfies RouteConfig);
    },
  };
}
