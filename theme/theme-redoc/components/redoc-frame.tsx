import './redoc-frame.css';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { useColorMode } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

import {
  isRedocReadyMessage,
  isRedocRouteMessage,
  isTrustedMessage,
  REDOC_FRAME_CLASS,
  redocModeMessage,
  redocRouteMessage,
  redocViewSrc,
} from './redoc-frame-sync.ts';

type Props = { specUrl: string };

/**
命中 `redoc:` 的那一页里本层放的东西：一个 iframe，指向本包自己那条插件路由。

Redoc 的代码、它往 `<head>` 插的那张运行时样式表、它写的 localStorage 与它自己的路由，
都在框里那份文档内；这一份文档（站点的文档页）只多出一个框和一条尺寸规则。
口径与理由见包 README 的「渲染放在独立页面，文档页只嵌它」一节。

地址栏里 `#/orders/createorder` 那一段仍然属于**外层**这一页（发给别人的是外层地址），
框内外层靠 postMessage 双向对齐它，见 `redoc-frame-sync.ts`。对齐是**两侧各推一次**的：
框里起来时问一句（ready），外层装好监听器也主动推一次 —— 两份文档各装各的监听器，谁先
谁后不固定，只守其中一条就丢得掉（实测丢过一次，见包 README 的「深链」一节）。

站点的亮暗模式走同一条通道、同一对：这一格读 `useColorMode()`，把当前模式送进框里，
框内那份文档不套站点的任何外壳（见 `theme/RedocPage/index.tsx`）。
*/
export function RedocFrame(props: Props): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const { colorMode } = useColorMode();
  const frameRef = useRef<HTMLIFrameElement>(null);

  // 服务端与客户端算出的必须是同一个字符串：`src` 只由 baseUrl 与 frontmatter 里那个地址决定。
  // 深链那一段与亮暗模式都不塞进地址（两件都靠下面的消息送），否则整页加载一条深链时
  // SSR 那份 html 与客户端第一次渲染就对不上。
  const src = redocViewSrc(siteConfig.baseUrl, props.specUrl);

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) {
      return undefined;
    }
    const { origin } = window.location;

    const postRoute = (): void => {
      frame.contentWindow?.postMessage(
        redocRouteMessage(window.location.hash),
        origin,
      );
    };

    // 站点的亮暗模式送进框内：框里那份文档不套站点的 ColorModeProvider，这一格就是它唯一的
    // 来源。改挂这条属性的理由见 `redoc-color-mode.ts`。
    const postMode = (): void => {
      frame.contentWindow?.postMessage(redocModeMessage(colorMode), origin);
    };

    // 框里那一份是不是已经站在同一个源上。还没开始加载时它是 `about:blank`，那里的 origin 是
    // 字符串 `null`，这一格送过去只会被浏览器按目标源丢掉、白刷一条控制台报错。
    // 读它的 `location` 只在同源时不抛，抛了就当还没起来。
    const isFrameLoaded = (): boolean => {
      try {
        return frame.contentWindow?.location.origin === origin;
      } catch {
        return false;
      }
    };

    /** 把外层这两格（地址里那一段与当前模式）整份送进框里。 */
    const pushToFrame = (): void => {
      if (!isFrameLoaded()) {
        return;
      }

      postRoute();
      postMode();
    };

    const onMessage = (event: MessageEvent): void => {
      if (!isTrustedMessage(event, frame.contentWindow, origin)) {
        return;
      }
      // 框里那份刚起来：把它地址里缺的那一段与当前模式一起给它。这一句与上面那次主动推
      // 是**一对**，缺一条就有丢得掉的对齐 —— 两份文档各装各的监听器，谁先谁后不固定，
      // 见 `redocReadyMessage`。
      if (isRedocReadyMessage(event.data)) {
        pushToFrame();
        return;
      }
      if (
        !isRedocRouteMessage(event.data) ||
        event.data.hash === window.location.hash
      ) {
        return;
      }
      // 只换 `#` 那一段，并且是**替换**当前那条历史记录：框里点一条接口不该在浏览器历史里
      // 多出一格，那会让「后退」变成在同一个页面的两条接口之间来回走。
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${event.data.hash}`,
      );
    };

    // 前进/后退改的是外层地址（深链那一段就在里面），把它送进框里，两边才还是同一条接口。
    const onPopState = (): void => {
      postRoute();
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('popstate', onPopState);
    // 监听器装上这一次就主动推一次：框里那份文档可能早就起来了、它那句 ready 早在外层还没
    // 监听时就发出去过（命中缓存时真发生过，见包 README 的「深链」一节）。
    // 模式变了也是同一条路：外层点了开关，框里不会再来问第二次，只能由这里推。
    pushToFrame();
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('popstate', onPopState);
    };
  }, [colorMode]);

  return (
    <iframe
      ref={frameRef}
      className={REDOC_FRAME_CLASS}
      src={src}
      title="API 文档"
    />
  );
}
