import type { ReactNode } from 'react';

import { StoplightView } from '../../components/stoplight-view.tsx';

// 本包那条插件路由（`src/index.mts` 里 `addRoute` 注册的 `@theme/StoplightPage`）落到的组件。
//
// 它不是文档页：frontmatter、面包屑、正文、目录、翻页都没有，整份文档就是给 iframe 装的那一格
// —— Elements 的运行时代码、它那份全局样式表、它的 localStorage 与它自己的路由，全关在这份
// 文档里，站点的文档页一行都碰不到。口径与兄弟层 `theme/RedocPage` 一致，
// 见包 README 的「渲染放在独立页面，文档页只嵌它」一节。
//
// 这一页不套 `@theme/Layout/Provider`：它底下那六个 provider 里本层唯一想要的是
// `ColorModeProvider`（维护 `<html data-theme>` 并监听 `storage` 事件），而现在亮暗由外层随
// 那条 postMessage 通道送进来（`components/stoplight-frame.tsx` 送出、
// `components/stoplight-view.tsx` 收到后写自己 `<html>` 上那条同名属性），这一层就不需要了。
// 留下的那五个（公告栏、滚动控制、版本文档、插件类名、导航栏）与这一页无关，
// 它们各自都要读站点配置，拉进来只是白费。
export default function StoplightPage(): ReactNode {
  return <StoplightView />;
}
