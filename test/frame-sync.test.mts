// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import {
  createFrameMessages,
  type FrameColorMode,
} from '../theme/theme-iframe/lib/frame-messages.ts';
import {
  createRouteReporter,
  isTrustedMessage,
  useInnerFrameSync,
  useOuterFrameSync,
  type FrameRef,
} from '../theme/theme-iframe/lib/frame-sync.ts';

/**
两条消息循环的分支单测（`@vitest-environment jsdom`：这一族是 React hook + `window`，
node 环境跑不起来）。

模拟的边界只有一处 —— **递交**交给浏览器那一步换成「直接派发监听器要收的那条事件」与
「检查 `postMessage` 被怎么调」，其余逻辑（同源判定、可信校验、历史替换、hash 落地、
监听器拆装）全是源码本体的真运行。真浏览器那条通道跨文档、异步，量的是通路，归 e2e。

假 frame 不需要真的 `<iframe>`：hook 只用到 `contentWindow` 那一格，而它后面接的是
`.postMessage` 与 `.location.origin`，所以带这两样的对象就够；跨源那一格用 `location`
的 getter 直接抛来还原（jsdom 里读同源对象的 `location` 不会抛）。
*/

const NAMESPACE = '@show-docs/docusaurus-theme-probe';
const messages = createFrameMessages(NAMESPACE);
const ORIGIN = window.location.origin;

type Posted = Array<{ data: unknown; target: string }>;

/** 假到刚好够 hook 用：它只读 `postMessage` 与 `location.origin` 这两格。 */
type FakeInner = {
  posted: Posted;
  postMessage: (data: unknown, target: string) => void;
  location: { origin: string };
};

function sameOriginWindow(): FakeInner {
  const posted: Posted = [];
  return {
    posted,
    postMessage: (data: unknown, target: string) => {
      posted.push({ data, target });
    },
    location: { origin: ORIGIN },
  };
}

/**
`ref` 里那格是 **iframe 元素**，不是框内文档本身：hook 读的是 `frameRef.current.contentWindow`，
直接把窗口交进去会一路短路成「框不在」，什么也推不进去（这一格踩过一次，值得写在这）。
*/
function refOf(current: unknown): FrameRef {
  return { current } as unknown as FrameRef;
}

function frameOf(contentWindow: unknown): FrameRef {
  return refOf({ contentWindow });
}

/**
把 hook 挂进一份真文档里跑起来。

`Harness` 读一个可变盒子，`push()` 换掉盒子里的值再渲染一次 —— effect 依赖由源码自己判，
这里不代它决定「什么变了要重新装监听器」。
*/
function mountHook<T>(initial: T, use: (value: T) => void) {
  // React 的 `act` 要求测试环境自己声明「这里是测试环境」，不设就是每条告警一次。
  // 这一格只能挂在 globalThis 上（React 就是这么读的），是这条 unicorn 规则的唯一例外，
  // 换 `@testing-library/react` 可以免掉它（它替设），代价是多一份依赖 —— 这里选了后者省。
  // eslint-disable-next-line unicorn/no-global-object-property-assignment -- React act 的环境标记只认 globalThis
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const box = { value: initial };
  function Harness(): null {
    use(box.value);
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (): void => {
    act(() => {
      root.render(createElement(Harness));
    });
  };
  render();
  return {
    push(value: T): void {
      box.value = value;
      render();
    },
    unmount(): void {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function dispatchMessage(
  source: unknown,
  data: unknown,
  origin = ORIGIN,
): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        source: source as Window,
        origin,
      }),
    );
  });
}

function dispatchPopState(): void {
  act(() => {
    window.dispatchEvent(new Event('popstate'));
  });
}

/** 框内那份文档没有外层可退：jsdom 里 `window.parent === window`，收信方与发信方同一个对象。 */
function captureParentPosts(): Posted {
  const posted: Posted = [];
  vi.stubGlobal('postMessage', (data: unknown, target: string) => {
    posted.push({ data, target });
  });
  return posted;
}

const outer = (frameRef: FrameRef, colorMode: FrameColorMode = 'light') => ({
  frameRef,
  messages,
  colorMode,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = '';
  delete document.documentElement.dataset.probeMode;
});

describe('useOuterFrameSync：外层往框里推、接框里报回来的那一段', () => {
  it('ref 还指不到框的时候什么都不做（不装监听器也不报错）', () => {
    // 交出去的是 **ref**（`{current: null}`），不是「框在但 contentWindow 是 null」
    const harness = mountHook(outer(refOf(null)), useOuterFrameSync);
    // 没有 frame 就没有可信来源：这两条照发，接不接得住都不该有副作用
    dispatchMessage(null, messages.ready());
    dispatchPopState();
    harness.unmount();
  });

  it('框还没站到同源上（读 location 就抛）：先不推，等它报 ready', () => {
    const inner = sameOriginWindow();
    let ready = false;
    const frame = {
      get contentWindow() {
        return ready
          ? inner
          : ({
              postMessage: inner.postMessage,
              get location(): never {
                throw new Error('cross-origin');
              },
            } as unknown as Window);
      },
    };
    const harness = mountHook(outer(refOf(frame)), useOuterFrameSync);
    expect(inner.posted).toEqual([]);

    ready = true;
    dispatchMessage(inner, messages.ready());
    expect(inner.posted.map((entry) => entry.data)).toEqual([
      messages.route(''),
      messages.mode('light'),
    ]);
    expect(inner.posted[0]!.target).toBe(ORIGIN);
    harness.unmount();
  });

  it('框站在别的源上（origin 对不上）：同样不推', () => {
    const other = {
      postMessage: vi.fn(),
      location: { origin: 'https://other.example.com' },
    };
    const harness = mountHook(outer(frameOf(other)), useOuterFrameSync);
    expect(other.postMessage.mock.calls).toEqual([]);
    harness.unmount();
  });

  it('装好监听器就先推一次：地址那一段与当前亮暗各一条，目标源写自己那份', () => {
    const inner = sameOriginWindow();
    const harness = mountHook(outer(frameOf(inner), 'dark'), useOuterFrameSync);
    expect(inner.posted.map((entry) => entry.data)).toEqual([
      messages.route(window.location.hash),
      messages.mode('dark'),
    ]);
    for (const { target } of inner.posted) {
      expect(target).toBe(ORIGIN);
    }
    harness.unmount();
  });

  it('站点切亮暗：外层再推一次，框里不会来问第二次', () => {
    const inner = sameOriginWindow();
    const frameRef = frameOf(inner);
    const harness = mountHook(outer(frameRef), useOuterFrameSync);
    inner.posted.length = 0;
    harness.push(outer(frameRef, 'dark'));
    expect(inner.posted.map((entry) => entry.data)).toEqual([
      messages.route(''),
      messages.mode('dark'),
    ]);
    harness.unmount();
  });

  it('框里报回来一条别的接口：只换外层地址里 # 那一段，而且不新增历史', () => {
    const inner = sameOriginWindow();
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const harness = mountHook(outer(frameOf(inner)), useOuterFrameSync);
    dispatchMessage(inner, messages.route('#/paths/users'));
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      `${window.location.pathname}${window.location.search}#/paths/users`,
    );
    expect(window.location.hash).toBe('#/paths/users');
    replaceState.mockClear();

    // 框里报的就是当前这一段：不该再动历史
    dispatchMessage(inner, messages.route('#/paths/users'));
    expect(replaceState).not.toHaveBeenCalled();

    // 不是自家的消息（命名空间对不上）：一律不看
    dispatchMessage(inner, { type: `${NAMESPACE}/other`, hash: '#/x' });
    expect(replaceState).not.toHaveBeenCalled();
    harness.unmount();
  });

  it('别人发来的消息接不进来：来源窗口对不上、origin 对不上都不算', () => {
    const inner = sameOriginWindow();
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const harness = mountHook(outer(frameOf(inner)), useOuterFrameSync);
    dispatchMessage(sameOriginWindow(), messages.route('#/from/stranger'));
    dispatchMessage(
      inner,
      messages.route('#/from/elsewhere'),
      'https://other.example.com',
    );
    expect(replaceState).not.toHaveBeenCalled();
    harness.unmount();
  });

  it('前进/后退把外层地址里的新那一段送进框里（只送 route，模式没变）', () => {
    const inner = sameOriginWindow();
    const harness = mountHook(outer(frameOf(inner)), useOuterFrameSync);
    window.location.hash = '#/paths/orders';
    inner.posted.length = 0;
    dispatchPopState();
    expect(inner.posted.map((entry) => entry.data)).toEqual([
      messages.route('#/paths/orders'),
    ]);
    harness.unmount();
  });

  it('框已经被摘掉：ready 与前进/后退都只是安静地什么都不做', () => {
    // 挂载时同源在场，之后 contentWindow 变成 null（真浏览器里 iframe 被移走就是这样）
    const inner = sameOriginWindow();
    const frame: { contentWindow: unknown } = { contentWindow: inner };
    const harness = mountHook(outer(refOf(frame)), useOuterFrameSync);
    // 挂载那两条是真推出去了（上面各用例已量过），这里只看翻面之后不再推
    inner.posted.length = 0;
    frame.contentWindow = null;
    dispatchPopState();
    dispatchMessage(null, messages.ready());
    expect(inner.posted).toEqual([]);
    harness.unmount();
  });

  it('卸载摘掉监听器：之后的消息与前进/后退都不再送进框里', () => {
    const inner = sameOriginWindow();
    const harness = mountHook(outer(frameOf(inner)), useOuterFrameSync);
    harness.unmount();
    inner.posted.length = 0;
    dispatchMessage(inner, messages.ready());
    dispatchPopState();
    expect(inner.posted).toEqual([]);
  });
});

describe('useInnerFrameSync：框内先要那两格，再接住外层送来的两条', () => {
  it('起来第一件事向外层报 ready', () => {
    const posted = captureParentPosts();
    const harness = mountHook(
      { messages, modeAttribute: 'data-probe-mode' },
      useInnerFrameSync,
    );
    expect(posted.map((entry) => entry.data)).toEqual([messages.ready()]);
    expect(posted[0]!.target).toBe(ORIGIN);
    harness.unmount();
  });

  it('亮暗落成 <html> 上那条属性（Redoc / Elements 那一类按属性判的层）', () => {
    captureParentPosts();
    const harness = mountHook(
      { messages, modeAttribute: 'data-probe-mode' },
      useInnerFrameSync,
    );
    dispatchMessage(window.parent, messages.mode('dark'));
    expect(document.documentElement.dataset.probeMode).toBe('dark');
    dispatchMessage(window.parent, messages.mode('light'));
    expect(document.documentElement.dataset.probeMode).toBe('light');
    harness.unmount();
  });

  it('亮暗的落法交给调用方时就不碰属性（Scalar 换的是 <body> 上两个类名）', () => {
    captureParentPosts();
    const onMode = vi.fn();
    const harness = mountHook({ messages, onMode }, useInnerFrameSync);
    dispatchMessage(window.parent, messages.mode('dark'));
    expect(onMode).toHaveBeenCalledWith('dark');
    expect(Object.hasOwn(document.documentElement.dataset, 'probeMode')).toBe(
      false,
    );
    harness.unmount();
  });

  it('外层送来新的那一段就改地址，同一段、外人消息与不是自家的都不改', () => {
    captureParentPosts();
    const harness = mountHook(
      { messages, modeAttribute: 'data-probe-mode' },
      useInnerFrameSync,
    );
    dispatchMessage(window.parent, messages.route('#/paths/users'));
    expect(window.location.hash).toBe('#/paths/users');
    // 同一段再来一次：不重复赋值（赋值本身会触发一次多余的 hashchange）
    dispatchMessage(window.parent, messages.route('#/paths/users'));
    expect(window.location.hash).toBe('#/paths/users');
    dispatchMessage(window.parent, { type: `${NAMESPACE}/other`, hash: '#/x' });
    expect(window.location.hash).toBe('#/paths/users');
    dispatchMessage({}, messages.route('#/from/stranger'));
    expect(window.location.hash).toBe('#/paths/users');
    harness.unmount();
  });

  it('卸载摘掉监听器：之后外层送什么都不再接', () => {
    captureParentPosts();
    const onMode = vi.fn();
    const harness = mountHook({ messages, onMode }, useInnerFrameSync);
    harness.unmount();
    dispatchMessage(window.parent, messages.mode('dark'));
    expect(onMode).not.toHaveBeenCalled();
  });
});

describe('createRouteReporter：框内把渲染器换的那一段报给外层', () => {
  it('造出来的函数只读 window，可以在模块级造一份反复用', () => {
    const posted = captureParentPosts();
    const report = createRouteReporter(messages);
    report('#/paths/users');
    report('');
    expect(posted.map((entry) => entry.data)).toEqual([
      messages.route('#/paths/users'),
      messages.route(''),
    ]);
  });
});

describe('isTrustedMessage：两个方向都过的来源校验', () => {
  const source = {} as Window;
  // 两个字段都显式给：`?? ` 会把「来源确实是 null」读成「没写这一格」，正好漏掉要测的那一种
  const event = (eventSource: unknown, eventOrigin: string) =>
    ({ source: eventSource, origin: eventOrigin }) as unknown as MessageEvent;

  it('来源窗口与 origin 都对得上才算自家消息', () => {
    expect(isTrustedMessage(event(source, ORIGIN), source, ORIGIN)).toBe(true);
    expect(isTrustedMessage(event({}, ORIGIN), source, ORIGIN)).toBe(false);
    expect(
      isTrustedMessage(
        event(source, 'https://other.example.com'),
        source,
        ORIGIN,
      ),
    ).toBe(false);
    expect(
      isTrustedMessage(event({}, 'https://other.example.com'), source, ORIGIN),
    ).toBe(false);
  });

  it('expectedSource 是 null（框还没起来 / 已摘掉）时，只有同样为 null 的来源对得上', () => {
    expect(isTrustedMessage(event(null, ORIGIN), null, ORIGIN)).toBe(true);
    expect(isTrustedMessage(event(source, ORIGIN), null, ORIGIN)).toBe(false);
  });
});
