import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

import useIsBrowser from '@docusaurus/useIsBrowser';

import { COLOR_MODE_ATTRIBUTE } from './redoc-color-mode.ts';
import {
  isRedocModeMessage,
  isRedocRouteMessage,
  isTrustedMessage,
  redocReadyMessage,
  redocRouteMessage,
  specUrlFromSearch,
} from './redoc-frame-sync.ts';
import { RedocUI } from './redoc-ui.tsx';

/**
框内那一页的正文：按地址里的 `src` 取文档、渲染 Redoc，并把外层送过来的两件事落到自己身上。

- **加载**：spec 地址从这一份文档自己的查询参数里取（外层 iframe 的 `src` 由
  `redoc-frame.tsx` 拼），命中不了就什么都不渲染。
- **路由**：这一份文档里只有 Redoc 一个消费者，`#` 段归它用（`redoc-ui.tsx` 外面那层
  `HashRouter`）。两个方向各走一条路，因为它们要绕过的坑不一样：
  - 外层 → 框内：改 `location.hash`。这一步会触发 `hashchange`，React Router 把它当成
    一次浏览器导航收下（POP），Redoc 于是换到那条接口，整份文档不重新加载。整页加载一条
    深链时那一段也是这么进来的：框里起来先向外层要一次（见下面那句 ready）。
  - 框内 → 外层：**听路由自己报**（`RedocUI` 的 `onRouteChange`，见 `redoc-ui.tsx` 里
    `LocationMirror` 那段注释）。框里点一条接口走的是 `history.pushState`，它**不触发**
    `hashchange`，监听那个事件收不到 —— 实测点完接口，框内地址变了、外层一次都没收到。
- **亮暗模式**：外层把它当前那一格送进来（`redocModeMessage`），这里写到自己的 `<html>` 上，
  Redoc 那套暗色表就改挂在这条属性上（`redoc-color-mode.ts`）。这一份文档不套 Docusaurus 的
  `ColorModeProvider`，站点那条 `data-theme` 在这里只是加载时内联脚本写死的一份、没人维护 ——
  本层不读它，所以两边不会打架。第一次送达之前这一格是空的，也就是亮色：本站的默认模式是亮色，
  而送达不靠谁先起来（外层装上监听器就主动推一次，这里问的那句再要一次，见 `redocReadyMessage`）。
  站点把默认模式改成暗色时，这一格会先亮一下再翻过去。
*/
export function RedocView(): ReactNode {
  const isBrowser = useIsBrowser();

  // 送给外层那一条接口。写成稳定的一份：`RedocUI` 里那个镜像组件把它放进 effect 的依赖里，
  // 每次渲染换一个新函数就会多报一次。
  const postToParent = useCallback((hash: string): void => {
    window.parent.postMessage(redocRouteMessage(hash), window.location.origin);
  }, []);

  useEffect(() => {
    const { origin } = window.location;

    const onMessage = (event: MessageEvent): void => {
      if (!isTrustedMessage(event, window.parent, origin)) {
        return;
      }
      // 外层换亮暗了：落到自己 `<html>` 的那条属性上（选择器由 `redoc-color-mode.ts` 改挂过去）。
      if (isRedocModeMessage(event.data)) {
        document.documentElement.setAttribute(
          COLOR_MODE_ATTRIBUTE,
          event.data.mode,
        );
        return;
      }
      if (
        !isRedocRouteMessage(event.data) ||
        event.data.hash === window.location.hash
      ) {
        return;
      }
      // 空串这一格浏览器处理成「把 `#` 整段去掉」，不是「跳到一个空 id 的元素」
      window.location.hash = event.data.hash;
    };

    window.addEventListener('message', onMessage);
    // 起来第一件事：问外层要它地址里那一段与当前模式。为什么由框里问、而不是外层在 iframe 的
    // `load` 事件上推，以及为什么外层还要反过来主动推一次，都记在 `redocReadyMessage` 那一份
    // 注释与包 README 的「深链」一节。
    window.parent.postMessage(redocReadyMessage(), origin);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  if (!isBrowser) {
    return null;
  }

  const url = specUrlFromSearch(window.location.search, window.location.origin);

  // `/redoc-view` 是条公开地址，别人直接打开它、`src` 那一段缺着或写成非 http(s) 的，
  // 这一格就什么都不渲染（Redoc 拿到空地址会把它自己那份 404 摆在正文区，那个观感
  // 反而更像坏了）。
  return url ? <RedocUI onRouteChange={postToParent} url={url} /> : null;
}
