import { useEffect } from 'react';
import type { RefObject } from 'react';

import type { FrameColorMode, FrameMessages } from './frame-messages.ts';
import { isTrustedMessage } from './frame-trust.ts';

/**
那两条消息循环：外层那份文档里的一个 iframe，与框内那份文档里的渲染器。

两边各装各的监听器，谁先谁后不固定，所以对齐是**两侧各推一次**的：框里起来时问一句
（{@link useInnerFrameSync} 里那句 ready），外层装好监听器也主动推一次
（{@link useOuterFrameSync}）。只守其中一条就丢得掉 —— 实测丢过一次：`page.reload()`
之后框里那句 ready 先发出、外层的监听器还没装上，于是深链与模式都没送进去。

这里不含 iframe 那一格本身，也不含它的尺寸：调用方自己渲染 `<iframe ref={…}>`，
把同一个 ref 交给 {@link useOuterFrameSync}。
*/

/** 外层那个 iframe 的 ref，与调用方渲染时挂的是同一个。 */
export type FrameRef = RefObject<HTMLIFrameElement | null>;

/**
挂在**外层**那份文档里：把地址栏那一段与当前亮暗模式送进框里，并接住框里报回来的那一段。

- 外层 → 框内：`route` 与 `mode` 两条。装好监听器先推一次，`colorMode` 每次变化再推一次
  （外层点了亮暗开关，框里不会来问第二次）。
- 框内 → 外层：`ready`（于是再推一次）与 `route`。后者只换外层地址里 `#` 那一段，
  而且是**替换**当前那条历史记录：框里点一条接口不该在浏览器历史里多出一格，
  那会让「后退」变成在同一页的两条接口之间来回走。
- 前进/后退改的是外层地址（深链那一段就在里面），把它送进框里，两边才还是同一条接口。
*/
export function useOuterFrameSync(options: {
  frameRef: FrameRef;
  messages: FrameMessages;
  colorMode: FrameColorMode;
}): void {
  const { frameRef, messages, colorMode } = options;

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) {
      return undefined;
    }
    const { origin } = window.location;

    const postRoute = (): void => {
      frame.contentWindow?.postMessage(
        messages.route(window.location.hash),
        origin,
      );
    };

    const postMode = (): void => {
      frame.contentWindow?.postMessage(messages.mode(colorMode), origin);
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
      if (messages.isReady(event.data)) {
        pushToFrame();
        return;
      }
      if (
        !messages.isRoute(event.data) ||
        event.data.hash === window.location.hash
      ) {
        return;
      }
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${event.data.hash}`,
      );
    };

    const onPopState = (): void => {
      postRoute();
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('popstate', onPopState);
    pushToFrame();
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('popstate', onPopState);
    };
  }, [colorMode, frameRef, messages]);
}

/**
挂在**框内**那份文档里：起来第一件事向外层要那两格，之后接住外层送来的两条。

- `mode`：落到这一份文档自己身上，落法由各层给（见 {@link InnerFrameSyncOptions} 那两条）。
  这一份文档不套 Docusaurus 的 `ColorModeProvider`，站点那条 `data-theme` 在这里只是加载时内联脚本写死的
  一份、没人维护，所以本层不读它，两边不会打架。第一次送达之前这一格是空的，也就是亮色：
  本站的默认模式是亮色，而送达不靠谁先起来（两边各推一次，见上面那段）。站点把默认模式
  改成暗色时，这一格会先亮一下再翻过去。
- `route`：改 `window.location.hash`。这一步会触发 `hashchange`；渲染器认不认这一格是各家的事
  （Redoc 与 Elements 的路由按它走，Scalar 只听 `popstate`，转换写在那一层的 `scalar-ui.tsx`），
  于是换到那条接口而整份文档不重新加载。整页加载一条深链时那一段也是这么进来的：
  框里起来先向外层要一次。

反方向（框内 → 外层）**不在这里**：那要听渲染器自己报，理由是每个渲染器换接口走的是
`history.pushState`，它**不触发** `hashchange`，监听那个事件收不到 —— 见
{@link createRouteReporter}。
*/
export type InnerFrameSyncOptions = { messages: FrameMessages } & (
  | {
      /**
      把收到的亮暗写成这一份文档 `<html>` 上的**一条属性**（属性名由调用方给）。
      Redoc 与 Elements 那一类按属性判亮暗的渲染器用这一格。
      */
      modeAttribute: string;
      onMode?: undefined;
    }
  | {
      /**
      这一格的落法由调用方自己决定：渲染器不按属性判亮暗时用它那一格。
      Scalar 换的是 `<body>` 上互斥的**两个类名**（`dark-mode` / `light-mode`），就用这一条。
      */
      modeAttribute?: undefined;
      onMode: (mode: FrameColorMode) => void;
    }
);

export function useInnerFrameSync(options: InnerFrameSyncOptions): void {
  const { messages, modeAttribute, onMode } = options;

  useEffect(() => {
    const { origin } = window.location;

    const onMessage = (event: MessageEvent): void => {
      if (!isTrustedMessage(event, window.parent, origin)) {
        return;
      }
      if (messages.isMode(event.data)) {
        if (onMode) {
          onMode(event.data.mode);
          return;
        }
        // 走到这一格就说明上面那条没给，类型上 `modeAttribute` 必在 —— 但解构出来的两个成员
        // 不会跟着 `options` 一起收窄，所以要这一句转述（不是运行期的兜底）。
        document.documentElement.setAttribute(
          modeAttribute as string,
          event.data.mode,
        );
        return;
      }
      if (
        !messages.isRoute(event.data) ||
        event.data.hash === window.location.hash
      ) {
        return;
      }
      // 空串这一格浏览器处理成「把 `#` 整段去掉」，不是「跳到一个空 id 的元素」
      window.location.hash = event.data.hash;
    };

    window.addEventListener('message', onMessage);
    window.parent.postMessage(messages.ready(), origin);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [messages, modeAttribute, onMode]);
}

/**
造一个「把这一份文档地址里那一段报给外层」的函数（框内 → 外层那一条）。

为什么由调用方在渲染器换接口的时候报，而不是这里监听 `hashchange`：三个渲染器（Redoc 的路由、
Elements 的路由、Scalar 自己那一条）换地址走的都是 `history.pushState`，那个方法**不触发**
`hashchange`（那个事件只由改 `location.hash`、点锚点链接、前进/后退这几条路触发）。实测都是这条：
框里点一条接口，`location.hash` 变了、渲染器认到了，`hashchange` 一次都没进来。

返回的函数只读 `window`，调用方可以在模块级造一份稳定的，不必每次渲染新建。
*/
export function createRouteReporter(
  messages: FrameMessages,
): (hash: string) => void {
  return (hash: string): void => {
    window.parent.postMessage(messages.route(hash), window.location.origin);
  };
}
