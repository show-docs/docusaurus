import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

import {
  frameMessages,
  isFrameHash,
  isFrameInit,
  isFrameMode,
  isFrameReady,
  type FrameColorMode,
} from './frame-messages.ts';

/**
那两条消息循环：外层那份文档里的一个 iframe，与框内那份文档里的渲染器。

两边各装各的监听器，谁先谁后不固定，所以对齐是**两侧各推一次**的：框里起来时问一句
（{@link useFrameBridge} 里那句 ready），外层装好监听器也主动推一次（{@link useFrameHandshake}）。
只守其中一条就丢得掉 —— 实测丢过一次：`page.reload()` 之后框里那句 ready 先发出、外层的监听器
还没装上，于是数据与模式都没送进去。

这里不含 iframe 那一格本身，也不含它的尺寸：那一格在 `../components/component-frame.tsx`。

**这一族共用一套消息名**（`../lib/frame-messages.ts`）：外层只认自己那个 iframe 的窗口，
同一页面里挂几个框都不串。
*/

/** 外层那个 iframe 的 ref，与调用方渲染时挂的是同一个。 */
export type FrameRef = RefObject<HTMLIFrameElement | null>;

/**
这条消息是不是从 `expectedSource` 那个窗口、同一个源发来的。两个方向都过这一格：外层只收自己
那个 iframe 的，框内只收装载它的父窗口的 —— 别人手工拼进地址栏的那一条、页面上第三方脚本发的
消息都进不来。

引 DOM 类型的只有这一份文件：消息形状与地址那两份不碰 `Window`，配置期与浏览器期因此能共用
同一份源码。
*/
export function isTrustedMessage(
  event: MessageEvent,
  expectedSource: Window | null,
  origin: string,
): boolean {
  return event.source === expectedSource && event.origin === origin;
}

/** 外层要送进框里的那一份数据：哪个组件、给它的入参。 */
export type FramePayload = {
  componentId: string;
  data: Record<string, unknown>;
};

/**
挂在**外层**那份文档里：把这一页的那一份数据、当前亮暗模式与地址里 `#` 那一段送进框里，
并接住框里报回来的那一段。

- 外层 → 框内：`init` / `mode` / `hash` 三条。装好监听器先推一轮，`payload` 或 `colorMode`
  每次变化再推一轮（外层点了亮暗开关，框里不会来问第二次；外层换了 spec 地址，框里跟着换）。
- 框内 → 外层：`ready`（于是再推一轮）与 `hash`。后者只换外层地址里 `#` 那一段，而且是
*替换**当前那条历史记录：框里点一条接口不该在浏览器历史里多出一格，那会让「后退」变成
  在同一页的两条接口之间来回走。
- 前进/后退改的是外层地址（深链那一段就在里面），把它送进框里，两边才还是同一条接口。

`payload.data` 那一份引用要稳定（调用方 `useMemo`）：它排在这条 effect 的依赖里，每次渲染换新
对象就等于每帧重推一轮、重装监听器。
*/
export function useFrameHandshake(options: {
  frameRef: FrameRef;
  payload: FramePayload;
  colorMode: FrameColorMode;
}): void {
  const { frameRef, payload, colorMode } = options;

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) {
      return undefined;
    }
    const { origin } = window.location;

    const postInit = (target: Window): void => {
      target.postMessage(
        frameMessages.init(payload.componentId, payload.data),
        origin,
      );
    };

    const postMode = (target: Window): void => {
      target.postMessage(frameMessages.mode(colorMode), origin);
    };

    const postHash = (target: Window): void => {
      target.postMessage(frameMessages.hash(window.location.hash), origin);
    };

    // 框里那份是不是已经站在同一个源上，是的话把它交出去。还没开始加载时它是 `about:blank`，
    // 那里的 origin 是字符串 `null`，送过去只会被浏览器按目标源丢掉、白刷一条控制台报错；读
    // `location` 只在同源时不抛，抛了就当还没起来。同源的判定只做一次并交出那个窗口，而不是
    // 每格各判一次再 `?.` —— 「判过同源之后 contentWindow 又变空」在同步代码里不发生，
    // 那条可选链就是永远量不到的分支。
    const isFrameLoaded = (): Window | undefined => {
      try {
        return frame.contentWindow?.location.origin === origin
          ? frame.contentWindow
          : undefined;
      } catch {
        return undefined;
      }
    };

    const pushAll = (): void => {
      const target = isFrameLoaded();

      if (target === undefined) {
        return;
      }

      postInit(target);
      postMode(target);
      postHash(target);
    };

    const onMessage = (event: MessageEvent): void => {
      if (!isTrustedMessage(event, frame.contentWindow, origin)) {
        return;
      }

      if (isFrameReady(event.data)) {
        pushAll();
        return;
      }

      if (
        !isFrameHash(event.data) ||
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

    // 前进/后退时框可能还没站到同源上（或已经被摘掉）：走同一条同源判定，而不是赌
    // contentWindow 一定在。
    const onPopState = (): void => {
      const target = isFrameLoaded();

      if (target !== undefined) {
        postHash(target);
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('popstate', onPopState);
    pushAll();

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('popstate', onPopState);
    };
  }, [colorMode, frameRef, payload]);
}

/** 框内这一份文档当前站在哪一步：还没接到数据、接到了但那个登记名查不到、正常渲染。 */
export type FrameBridgeState = {
  payload: FramePayload | undefined;
  colorMode: FrameColorMode | undefined;
};

/**
挂在**框内**那份文档里：起来第一件事向外层要那一份数据，之后接住外层送来的三条。

- `init`：这一页要渲染哪个组件与给它的入参。第二次送达（外层改了 spec 地址）整份替换 ——
  外层送的是完整快照，不做增量合并。
- `mode`：只存进状态，**怎么落到这一份文档上归组件自己**（各渲染器认的属性名与类名不一样，
  机制层不猜）。组件用 {@link useFrameMode} 落到这一份文档上（要自己读那一格再用 {@link useFrameColorMode}）。
- `hash`：改 `window.location.hash`，这一步触发 `hashchange`，于是换到那条接口而整份文档不
  重新加载。渲染器认不认这一格是各家的事。整页加载一条深链时那一段也是这么进来的。
  与当前那一段一样时一个字都不动 —— 外层与框内各推一次，不做相等判断就会互相写个没完。

反方向（框内 → 外层）用 {@link useFrameHashReporter} 那一句，由调用方在渲染器换接口的时候报，
而不是这里监听 `hashchange`：各家渲染器换地址走的都是 `history.pushState`，那个方法**不触发**
`hashchange`（那个事件只由改 `location.hash`、点锚点链接、前进/后退这几条路触发）。实测都是
这条：框里点一条接口，`location.hash` 变了、渲染器认到了，`hashchange` 一次都没进来。

**挂载那一次别报**：那一次报的是初始位置 `#/`，而外层可能正带着一条深链
（`/api-demo#/orders/createorder`），初始那一句会先把外层地址栏里那一段擦成 `#/`，紧接着外层
补送深链时读到的已经是被擦过的值，深链就丢了。{@link useFrameHashReporter} 交回的那一句
只在渲染器真的换过接口之后才被调用，这一格因此归调用方（各家那层 `LocationMirror`）。
*/
export function useFrameBridge(): FrameBridgeState {
  const [state, setState] = useState<FrameBridgeState>({
    payload: undefined,
    colorMode: undefined,
  });

  useEffect(() => {
    const { origin } = window.location;

    const onMessage = (event: MessageEvent): void => {
      if (!isTrustedMessage(event, window.parent, origin)) {
        return;
      }

      if (isFrameInit(event.data)) {
        setState((current) => ({ ...current, payload: event.data }));

        return;
      }

      if (isFrameMode(event.data)) {
        const { mode } = event.data;

        setState((current) =>
          current.colorMode === mode
            ? current
            : { ...current, colorMode: mode },
        );

        return;
      }

      if (
        !isFrameHash(event.data) ||
        event.data.hash === window.location.hash
      ) {
        return;
      }

      // 空串这一格浏览器处理成「把 `#` 整段去掉」，不是「跳到一个空 id 的元素」
      window.location.hash = event.data.hash;
    };

    window.addEventListener('message', onMessage);
    window.parent.postMessage(frameMessages.ready(), origin);

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return state;
}

/** 框内那份文档给组件的那两格能力：站点当前的亮暗，和「把选中的那条接口报给外层」那一句。 */
export type FrameBridge = {
  /** 外层送来的亮暗；第一次送达之前是 `undefined`（那时这一份文档按站点默认那一格）。 */
  colorMode: FrameColorMode | undefined;
  /** 把这一份文档地址里 `#` 那一段报给外层（框内 → 外层那一条）。 */
  reportHash: (hash: string) => void;
};

const FrameBridgeContext = createContext<FrameBridge | null>(null);

/**
「把这一份文档地址里 `#` 那一段报给外层」那一句。

它住在模块级，所以引用天生稳定：既不用 `useMemo` 养着，也能排进调用方的 effect 依赖。
*/
export function reportHashToParent(hash: string): void {
  window.parent.postMessage(frameMessages.hash(hash), window.location.origin);
}

/** 框内那份文档把上面那两格交给渲染中的组件（只有 `theme/ComponentFramePage` 用得上）。 */
export function FrameBridgeProvider(options: {
  colorMode: FrameColorMode | undefined;
  children?: ReactNode;
}): ReactNode {
  const { colorMode, children } = options;
  const value = useMemo<FrameBridge>(
    () => ({ colorMode, reportHash: reportHashToParent }),
    [colorMode],
  );

  return (
    <FrameBridgeContext.Provider value={value}>
      {children}
    </FrameBridgeContext.Provider>
  );
}

/** 读框内那份文档的上下文：组件在父文档里被渲染时（`render: 'page'`）这样用就是写歪了。 */
function useFrameBridgeContext(): FrameBridge {
  const bridge = useContext(FrameBridgeContext);

  if (bridge === null) {
    throw new Error(
      'theme-component-page：这条 hook 只在框内那份文档里可用（由 render: iframe 的规则渲染的组件）。要把组件直接铺在正文里，就让那条规则写 `render: "page"`。',
    );
  }

  return bridge;
}

/**
站点当前的亮暗（外层送进来的那一条消息落成的值），要直接用还是落到这一份文档上由调用方判；
落到文档上的那一条见 {@link useFrameMode}。

第一次送达之前是 `undefined`，那时这一份文档按自己的默认（本站默认亮色）。
*/
export function useFrameColorMode(): FrameColorMode | undefined {
  return useFrameBridgeContext().colorMode;
}

/**
把外层送来的亮暗落到**这一份文档**上：送达一次就落一次，卸载时不必收尾（这一份文档整个跟着框走，
框没了它也没了）。

各家的落法不一样，所以机制层只给「什么时候落」这一格，不给「落成什么」：Redoc 与 Elements 按
`<html>` 上一条属性判（把它们那份暗色表的生效条件换到这条属性上），Scalar 换的是 `<body>` 上互斥
的两个类名（属性名换不动它）。那两格都由调用方写成 `apply` 交进来。

第一次送达之前什么都不做（那时按这份文档自己的默认，本站默认亮色）。
*/
export function useFrameMode(apply: (mode: FrameColorMode) => void): void {
  const mode = useFrameColorMode();

  useEffect(() => {
    if (mode !== undefined) {
      apply(mode);
    }
  }, [apply, mode]);
}

/**
「把这一份文档地址里 `#` 那一段报给外层」那一句。引用稳定，可以排进 effect 依赖。

**挂载那一次别拿它报初始位置**，理由见 {@link useFrameBridge}。
*/
export function useFrameHashReporter(): (hash: string) => void {
  return useFrameBridgeContext().reportHash;
}
