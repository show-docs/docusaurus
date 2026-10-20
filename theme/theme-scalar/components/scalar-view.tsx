import {
  apiFrameByNamespace,
  apiFrameMessages,
  createRouteReporter,
  specUrlFromSearch,
  useInnerFrameSync,
  type ApiFrameEntryInternal,
} from '@show-docs/docusaurus-theme-iframe/lib/index.ts';

import type { ReactNode } from 'react';

import useIsBrowser from '@docusaurus/useIsBrowser';

import { applyScalarColorMode } from './scalar-color-mode.ts';
// 外层版式（`.scalar-frame` 定高与容器让位）归本包声明，规则留在 `scalar-frame.css`；
// 外层套壳收拢到 theme-iframe 后，这一句 import 就是它进全站 bundle 的唯一通道（收拢前由
// 已删的 `scalar-frame.tsx` 带进来）。谁编译：两份都由站点编译，并进同一份产物。
import './scalar-frame.css';

import { ScalarUI } from './scalar-ui.tsx';

// 外层套壳（判键、那个 `<iframe>`、送 `route`/`mode` 的那一侧）住在 theme-iframe：
// 形状取自注册表里本包那一条，见包的 `docs/iframe-protocol.md`。
const SCALAR_NAMESPACE = '@show-docs/docusaurus-theme-scalar';

const entry = apiFrameByNamespace(SCALAR_NAMESPACE);
if (entry === undefined || entry.kind !== 'internal') {
  throw new Error(`注册表里缺 ${SCALAR_NAMESPACE}`);
}
// 守卫处把形状收窄成一份别名：函数作用域里再看 `entry` 就不会带着 `undefined` 与
// `external` 那两种可能了。
const scalarEntry: ApiFrameEntryInternal = entry;

/** 框内 → 外层那一条：报的是这一份文档地址里 `#` 那一段。模块级造一份，每次渲染不换引用。 */
const reportRouteToParent = createRouteReporter(
  apiFrameMessages(SCALAR_NAMESPACE),
);

/**
框内那一页的正文：按地址里的 `src` 取文档、渲染 Scalar，并把外层送过来的两件事落到自己身上。

- **加载**：spec 地址从这一份文档自己的查询参数里取（外层 iframe 的 `src` 由 theme-iframe
  那个通用框按注册表拼），命中不了就什么都不渲染。
- **路由**：这一份文档里只有 Scalar 一个消费者，`#` 段归它用。两个方向各走一条路，
  因为它们要绕过的坑不一样：
  - 外层 → 框内：改 `location.hash`（共享层那一步）。这一步触发 `hashchange`，
    而 Scalar 只听 `popstate`，所以那一格由 `scalar-ui.tsx` 转过去。整页加载一条深链时
    那一段也是这么进来的：框里起来先向外层要一次。
  - 框内 → 外层：**听 Scalar 自己报**（配置里的 `onSidebarClick`）。框里点一条接口走的是
    `history.pushState`，它**不触发** `hashchange`，监听那个事件收不到 —— 与
    `theme-redoc` / `theme-stoplight` 实测到的同一格。
- **亮暗模式**：外层把它当前那一格送进来，这里落到 Scalar 自己那两个 `<body>` 类名上
  （`scalar-color-mode.ts`）。

收到、报出、以及那句「起来了，把你要的那两格给我」都住在共享层（`useInnerFrameSync`）；
本层给的只有那个类名落地的方式。
*/
export function ScalarView(): ReactNode {
  const isBrowser = useIsBrowser();

  useInnerFrameSync({
    messages: apiFrameMessages(SCALAR_NAMESPACE),
    onMode: applyScalarColorMode,
  });

  if (!isBrowser) {
    return null;
  }

  const url = specUrlFromSearch(
    window.location.search,
    window.location.origin,
    scalarEntry.specParam,
  );

  // `/scalar-view` 是条公开地址，别人直接打开它、`src` 那一段缺着或写成非 http(s) 的，
  // 这一格就什么都不渲染（Scalar 拿到空地址会把它自己那份「未找到」摆在正文区，那个观感
  // 反而更像坏了）。
  return url ? (
    <ScalarUI onRouteChange={reportRouteToParent} url={url} />
  ) : null;
}
