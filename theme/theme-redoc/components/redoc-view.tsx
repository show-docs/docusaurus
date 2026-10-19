import {
  createRouteReporter,
  useInnerFrameSync,
} from '@show-docs/theme-frame-kit';

import type { ReactNode } from 'react';

import useIsBrowser from '@docusaurus/useIsBrowser';

import { COLOR_MODE_ATTRIBUTE } from './redoc-color-mode.ts';
import {
  redocFrameMessages,
  redocSpecUrlFromSearch,
} from './redoc-frame-sync.ts';
import { RedocUI } from './redoc-ui.tsx';

/** 框内 → 外层那一条：报的是这一份文档地址里 `#` 那一段。模块级造一份，每次渲染不换引用。 */
const reportRouteToParent = createRouteReporter(redocFrameMessages);

/**
框内那一页的正文：按地址里的 `src` 取文档、渲染 Redoc，并把外层送过来的两件事落到自己身上。

- **加载**：spec 地址从这一份文档自己的查询参数里取（外层 iframe 的 `src` 由
  `redoc-frame.tsx` 拼），命中不了就什么都不渲染。
- **路由**：这一份文档里只有 Redoc 一个消费者，`#` 段归它用（`redoc-ui.tsx` 外面那层
  `HashRouter`）。两个方向各走一条路，因为它们要绕过的坑不一样：
  - 外层 → 框内：改 `location.hash`。这一步会触发 `hashchange`，React Router 把它当成
    一次浏览器导航收下（POP），Redoc 于是换到那条接口，整份文档不重新加载。整页加载一条
    深链时那一段也是这么进来的：框里起来先向外层要一次。
  - 框内 → 外层：**听路由自己报**（`RedocUI` 的 `onRouteChange`，见 `redoc-ui.tsx` 里
    `LocationMirror` 那段注释）。框里点一条接口走的是 `history.pushState`，它**不触发**
    `hashchange`，监听那个事件收不到 —— 实测点完接口，框内地址变了、外层一次都没收到。
- **亮暗模式**：外层把它当前那一格送进来，这里写到自己的 `<html>` 上，Redoc 那套暗色表就
  改挂在这条属性上（`redoc-color-mode.ts`）。

收到、报出、以及那句「起来了，把你要的那两格给我」都住在共享层（`useInnerFrameSync`，
见 `@show-docs/theme-frame-kit`），与 `theme-stoplight` 用的是同一份；本层给的只有属性名
`COLOR_MODE_ATTRIBUTE` 与那份以包名做前缀的消息约定。
*/
export function RedocView(): ReactNode {
  const isBrowser = useIsBrowser();

  useInnerFrameSync({
    messages: redocFrameMessages,
    modeAttribute: COLOR_MODE_ATTRIBUTE,
  });

  if (!isBrowser) {
    return null;
  }

  const url = redocSpecUrlFromSearch(
    window.location.search,
    window.location.origin,
  );

  // `/redoc-view` 是条公开地址，别人直接打开它、`src` 那一段缺着或写成非 http(s) 的，
  // 这一格就什么都不渲染（Redoc 拿到空地址会把它自己那份 404 摆在正文区，那个观感
  // 反而更像坏了）。
  return url ? <RedocUI onRouteChange={reportRouteToParent} url={url} /> : null;
}
