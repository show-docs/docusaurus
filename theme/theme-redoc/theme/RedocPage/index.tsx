import type { ReactNode } from 'react';

import { RedocView } from '../../components/redoc-view.tsx';

// 本包那条插件路由（`src/index.mts` 里 `addRoute` 注册的 `@theme/RedocPage`）落到的组件。
//
// 它不是文档页：frontmatter、面包屑、正文、目录、翻页都没有，整份文档就是给 iframe 装的那一格
// —— Redoc 的运行时代码、它往 `<head>` 插的那张样式表、它的 localStorage 与它自己的路由，
// 全关在这份文档里，站点的文档页一行都碰不到。口径见包 README 的「渲染放在独立页面」一节。
//
// 这一页不套 `@theme/Layout/Provider`。改造过程中它一度是必需的，为的是它底下那六个 provider
// 里的 `ColorModeProvider`：那个 provider 维护 `<html data-theme>` 并监听 `storage` 事件，
// 外层点一下亮暗开关，框内这一份靠同源 localStorage 跟着翻。现在亮暗由外层随那条
// postMessage 通道送进来（theme-iframe 的 `components/api-frame.tsx` 送出、`components/redoc-view.tsx`
// 收到后写自己 `<html>` 上的属性），这一层就不需要了。留下的那五个（公告栏、滚动控制、
// 版本文档、插件类名、导航栏）与这一页无关，它们各自都要读站点配置，拉进来只是白费。
export default function RedocPage(): ReactNode {
  return <RedocView />;
}
