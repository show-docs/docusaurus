// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { apiFrameMessages } from '../theme/theme-iframe/lib/api-frame-messages.ts';
import {
  createApiFrameView,
  type ApiFrameViewProps,
} from '../theme/theme-iframe/lib/api-frame-view.tsx';

import { stubIsBrowser } from './stubs/use-is-browser.ts';

/**
框内那份工厂的分支单测。两条消息循环本身（同源判定、可信校验、`#` 段落地、历史替换）
已由 `frame-sync.test.mts` 钉住，这里只量工厂自己那几格：注册表守卫、在浏览器之外与地址
取不到时各返回什么、`modeAttribute` 与 `onMode` 两条落法怎么选、报回外层那一句用的是不是
本层命名空间。递交仍换成「直接派发那条事件」，真浏览器里那条跨文档的通路归 e2e。

`useIsBrowser` 是测试替身（`test/stubs/use-is-browser.ts`，换的理由写在那份头上）。
*/

const REDOC = '@show-docs/docusaurus-theme-redoc';
const SCALAR = '@show-docs/docusaurus-theme-scalar';
const IFRAME = '@show-docs/docusaurus-theme-iframe';

// React 的 `act` 要求测试环境自己声明「这里是测试环境」，不设就是每条告警一次。
// 这一格只能挂在 globalThis 上（React 就是这么读的），是这条 unicorn 规则的唯一例外，
// 与 `frame-sync.test.mts` 里同一处同一口径。
// eslint-disable-next-line unicorn/no-global-object-property-assignment -- React act 的环境标记只认 globalThis
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Posted = Array<{ data: unknown; target: string }>;

/**
假到刚好够工厂用：它只把 `url` 与 `onRouteChange` 这两格交给渲染接线，别的都不读。

`loadView` 那一格是工厂要的形状（交回组件本身，工厂自己决定什么时候取）；`load` 的调用次数
就是「渲染器被真的问了几次」—— 服务端那一遍与地址缺参 / 坏参那几格都该是 0。
*/
function fakeView(): {
  load: ReturnType<typeof vi.fn>;
  loadView: () => Promise<ComponentType<ApiFrameViewProps>>;
  seen: ApiFrameViewProps[];
  View: ComponentType<ApiFrameViewProps>;
} {
  const seen: ApiFrameViewProps[] = [];
  function View({ onRouteChange, url }: ApiFrameViewProps): ReactNode {
    seen.push({ onRouteChange, url });
    return createElement('div', {}, `spec:${url}`);
  }
  const load = vi.fn(() => Promise.resolve(View));
  return { load, loadView: load, seen, View };
}

/** 放干当前这一轮微任务与宏任务队列：effect 里那条 `Promise` 的 `then` 排在它们后面。 */
function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const mounted: Array<() => void> = [];

function renderPage(page: ComponentType): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(page));
  });
  mounted.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  return container;
}

/** 按工厂拼框内地址的那个形状换掉这一份文档的查询参数。 */
function setSearch(search: string): void {
  window.history.replaceState(null, '', `/redoc-view${search}`);
}

function dispatchMessage(data: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: window.location.origin,
      source: window.parent,
    }),
  );
}

/** 收走「送给外层」那一条：jsdom 里 `window.parent` 就是 `window` 自己。 */
function capturePosts(): Posted {
  const posted: Posted = [];
  vi.stubGlobal('postMessage', (data: unknown, target: string) => {
    posted.push({ data, target });
  });
  return posted;
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount();
  }
  vi.unstubAllGlobals();
  stubIsBrowser.value = true;
  setSearch('');
  window.location.hash = '';
  delete document.documentElement.dataset.redocMode;
});

describe('createApiFrameView：注册表守卫', () => {
  const { loadView } = fakeView();

  it('包名在注册表里没有那一条时，造页面这一步就抛', () => {
    expect(() =>
      createApiFrameView({
        modeAttribute: 'data-x',
        namespace: '@show-docs/docusaurus-theme-nope',
        loadView,
      }),
    ).toThrow(/注册表里缺/);
  });

  it('命名空间指向 `external` 那一条（`iframe:`）也抛：那种框里没有框内页面', () => {
    expect(() =>
      createApiFrameView({
        modeAttribute: 'data-x',
        namespace: IFRAME,
        loadView,
      }),
    ).toThrow(/注册表里缺/);
  });
});

describe('工厂产出的那一页：渲染到哪一格为止', () => {
  it('浏览器之外什么都不渲染（服务端那一遍没有地址栏可读）', () => {
    stubIsBrowser.value = false;
    const { loadView, seen } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        loadView,
      }),
    );

    expect(container.textContent).toBe('');
    expect(seen).toHaveLength(0);
  });

  it('地址里缺 spec 参数时什么都不渲染', () => {
    const { load, loadView, seen } = fakeView();
    setSearch('');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        loadView,
      }),
    );

    expect(container.textContent).toBe('');
    expect(seen).toHaveLength(0);
    expect(load).not.toHaveBeenCalled();
  });

  it('参数写成了非 http(s) 的地址时同样什么都不渲染（那条页面是公开地址）', () => {
    const { load, loadView, seen } = fakeView();
    setSearch('?src=javascript%3Aalert(1)');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        loadView,
      }),
    );

    expect(container.textContent).toBe('');
    expect(seen).toHaveLength(0);
    expect(load).not.toHaveBeenCalled();
  });

  it('取到 http(s) 地址时把地址与「报回外层」那一句一起交给渲染接线', async () => {
    const { loadView, seen } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        loadView,
      }),
    );

    // 渲染接线在 effect 之后才取到（`loadView` 那一路），要等这一轮的微任务。
    await act(async () => {
      await flush();
    });

    expect(seen[0]?.url).toBe('http://localhost:3000/openapi.yaml');
    expect(container.textContent).toBe(
      'spec:http://localhost:3000/openapi.yaml',
    );
  });

  it('报回外层用的是本层命名空间那条 route 消息', async () => {
    const posted = capturePosts();
    const { loadView, seen } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        loadView,
      }),
    );
    await act(async () => {
      await flush();
    });
    posted.length = 0;
    seen[0]?.onRouteChange('#/orders/createorder');

    expect(posted.map((entry) => entry.data)).toEqual([
      apiFrameMessages(REDOC).route('#/orders/createorder'),
    ]);
  });

  it('静态交渲染接线时「报回外层」那一句同样是工厂给的那一条', () => {
    const posted = capturePosts();
    const { View, seen } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        view: View,
      }),
    );
    posted.length = 0;
    seen[0]?.onRouteChange('#/orders/createorder');

    expect(posted.map((entry) => entry.data)).toEqual([
      apiFrameMessages(REDOC).route('#/orders/createorder'),
    ]);
  });

  it('起来第一件事向外层要一次那两格', () => {
    const posted = capturePosts();
    const { loadView } = fakeView();

    renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        loadView,
      }),
    );

    expect(posted.map((entry) => entry.data)).toEqual([
      apiFrameMessages(REDOC).ready(),
    ]);
  });
});

describe('渲染接线还没轮到取的那几格', () => {
  /**
  这一层收的是取法（`loadView`），不是组件：取不取、什么时候取，由工厂决定。下面几格钉住
  「不该取的时候一次都没问」—— 那正是渲染器不进首屏全部证据。
  */
  it('服务端那一遍、地址缺参、地址坏参时，一次都没去取', async () => {
    stubIsBrowser.value = false;
    const server = fakeView();
    setSearch('?src=%2Fopenapi.yaml');
    renderPage(
      createApiFrameView({
        loadView: server.loadView,
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );

    stubIsBrowser.value = true;
    const missing = fakeView();
    setSearch('');
    renderPage(
      createApiFrameView({
        loadView: missing.loadView,
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );

    const bad = fakeView();
    setSearch('?src=javascript%3Aalert(1)');
    renderPage(
      createApiFrameView({
        loadView: bad.loadView,
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );

    await act(async () => {
      await flush();
    });

    expect(server.load).not.toHaveBeenCalled();
    expect(missing.load).not.toHaveBeenCalled();
    expect(bad.load).not.toHaveBeenCalled();
  });

  /**
  取不到渲染器时那一页只剩空白，原因交给控制台 —— 丢掉一页正文，不该整份文档一起炸。
  同一页上另两份静置的工厂（下面那条）保证这句 `console.warn` 不会因为「没人装监听器」被吞掉。
  */
  it('渲染器取不到时不抛、只打一条告警', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockReturnValue();
    const failure = new Error('chunk 取不到');
    const loadView = vi.fn(() => Promise.reject(failure));
    setSearch('?src=%2Fopenapi.yaml');

    const page = renderPage(
      createApiFrameView({
        loadView,
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );

    await act(async () => {
      await flush();
    });

    expect(loadView).toHaveBeenCalledTimes(1);
    // 框里那一格仍是空白：没有正文，也没有替身组件
    expect(page.textContent).toBe('');
    const warned = consoleWarn.mock.calls.map((call) => call[0]);
    expect(warned).toContain('[theme-iframe] 框内渲染器加载失败：');
    consoleWarn.mockRestore();
  });

  it('取法只问一次：重渲染不会把同一份渲染器再拉一遍', async () => {
    const { load, loadView, seen } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const page = createApiFrameView({
      loadView,
      modeAttribute: 'data-redoc-mode',
      namespace: REDOC,
    });
    renderPage(page);

    await act(async () => {
      await flush();
    });
    // 换一次亮暗，让这一页重渲染一遍。
    dispatchMessage(apiFrameMessages(REDOC).mode('dark'));
    await act(async () => {
      await flush();
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(seen[0]?.url).toBe('http://localhost:3000/openapi.yaml');
  });
});

describe('静态交渲染接线那一格（`view`）', () => {
  it('`view` 直接渲染，不去问任何取法', () => {
    const { load, View } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        view: View,
      }),
    );

    // 渲染器随这一份代码一起进来，没有「先空白再补」那一段
    expect(container.textContent).toBe(
      'spec:http://localhost:3000/openapi.yaml',
    );
    expect(load).not.toHaveBeenCalled();
  });
});

describe('取法还在飞时这一页就被卸掉', () => {
  it('落地之后不再写状态（不会往已卸载的树上补渲染）', async () => {
    const { promise: pending, resolve: resolveView } =
      Promise.withResolvers<ComponentType<ApiFrameViewProps>>();
    const loadView = vi.fn(() => pending);
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        loadView,
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );
    // 把这一页卸掉：effect 的清理函数会把 `stopped` 置上
    for (const unmount of mounted.splice(0)) {
      unmount();
    }

    resolveView(fakeView().View);
    await act(async () => {
      await flush();
    });

    expect(loadView).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('');
  });
});

describe('取法交回的形状：组件本身或 `import()` 那份模块', () => {
  /**
  两种形状都要能落地：`import()` 那份模块（`{ default }`，三份真渲染器都是这一格）与
  组件本身。两种都在 `useLoadedView` 那一句三元里，漏一种就是这一页白屏 —— 下面两条各钉一种。
  */
  it('取法交回 `{ default }`（`import()` 那份模块）时取它的默认导出', async () => {
    const { View } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        loadView: () => Promise.resolve({ default: View }),
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );
    await act(async () => {
      await flush();
    });

    expect(container.textContent).toBe(
      'spec:http://localhost:3000/openapi.yaml',
    );
  });

  it('取法交回组件本身时不再去读 `default`', async () => {
    const { View } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        loadView: () => Promise.resolve(View),
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );
    await act(async () => {
      await flush();
    });

    expect(container.textContent).toBe(
      'spec:http://localhost:3000/openapi.yaml',
    );
  });
});

describe('亮暗落法由调用方给：两格互斥', () => {
  it('给了 `modeAttribute` 就写到这一份文档 `<html>` 上那条属性', () => {
    const { loadView } = fakeView();
    renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        loadView,
      }),
    );

    dispatchMessage(apiFrameMessages(REDOC).mode('dark'));

    expect(document.documentElement.dataset.redocMode).toBe('dark');
  });

  it('给了 `onMode` 就整格交回调用方（Scalar 换的是 `<body>` 上两个类名）', () => {
    const onMode = vi.fn();
    const { loadView } = fakeView();
    renderPage(createApiFrameView({ loadView, namespace: SCALAR, onMode }));

    dispatchMessage(apiFrameMessages(SCALAR).mode('dark'));

    expect(onMode).toHaveBeenCalledWith('dark');
    expect(Object.hasOwn(document.documentElement.dataset, 'redocMode')).toBe(
      false,
    );
  });
});
