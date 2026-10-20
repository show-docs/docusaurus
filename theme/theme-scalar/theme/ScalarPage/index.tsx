import type { ReactNode } from 'react';

import { ScalarView } from '../../components/scalar-view.tsx';

// 本包那条插件路由（`src/index.mts` 里 `addRoute` 注册的 `@theme/ScalarPage`）落到的组件。
//
// 它不是文档页：frontmatter、面包屑、正文、目录、翻页都没有，整份文档就是给 iframe 装的那一格
// —— Scalar 的运行时代码、它那份样式表、它的 localStorage 与它自己的路由，全关在这份文档里，
// 站点的文档页一行都碰不到。口径见包 README 的「渲染放在独立页面」一节。
//
// 这一页不套 `@theme/Layout/Provider`：留下的那六个 provider（公告栏、滚动控制、亮暗、
// 版本文档、插件类名、导航栏）与这一页无关，它们各自都要读站点配置，拉进来只是白费。
// 亮暗由外层随那条 postMessage 通道送进来（theme-iframe 的 `components/api-frame.tsx` 送出、
// `components/scalar-view.tsx` 收到后落到 Scalar 自己那两个类名上）。
export default function ScalarPage(): ReactNode {
  return <ScalarView />;
}
