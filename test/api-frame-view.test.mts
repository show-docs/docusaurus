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

/** 假到刚好够工厂用：它只把 `url` 与 `onRouteChange` 这两格交给渲染接线，别的都不读。 */
function fakeView(): {
  seen: ApiFrameViewProps[];
  View: ComponentType<ApiFrameViewProps>;
} {
  const seen: ApiFrameViewProps[] = [];
  function View({ onRouteChange, url }: ApiFrameViewProps): ReactNode {
    seen.push({ onRouteChange, url });
    return createElement('div', {}, `spec:${url}`);
  }
  return { seen, View };
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
  const { View } = fakeView();

  it('包名在注册表里没有那一条时，造页面这一步就抛', () => {
    expect(() =>
      createApiFrameView({
        modeAttribute: 'data-x',
        namespace: '@show-docs/docusaurus-theme-nope',
        view: View,
      }),
    ).toThrow(/注册表里缺/);
  });

  it('命名空间指向 `external` 那一条（`iframe:`）也抛：那种框里没有框内页面', () => {
    expect(() =>
      createApiFrameView({
        modeAttribute: 'data-x',
        namespace: IFRAME,
        view: View,
      }),
    ).toThrow(/注册表里缺/);
  });
});

describe('工厂产出的那一页：渲染到哪一格为止', () => {
  it('浏览器之外什么都不渲染（服务端那一遍没有地址栏可读）', () => {
    stubIsBrowser.value = false;
    const { seen, View } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        view: View,
      }),
    );

    expect(container.textContent).toBe('');
    expect(seen).toHaveLength(0);
  });

  it('地址里缺 spec 参数时什么都不渲染', () => {
    const { seen, View } = fakeView();
    setSearch('');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        view: View,
      }),
    );

    expect(container.textContent).toBe('');
    expect(seen).toHaveLength(0);
  });

  it('参数写成了非 http(s) 的地址时同样什么都不渲染（那条页面是公开地址）', () => {
    const { seen, View } = fakeView();
    setSearch('?src=javascript%3Aalert(1)');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        view: View,
      }),
    );

    expect(container.textContent).toBe('');
    expect(seen).toHaveLength(0);
  });

  it('取到 http(s) 地址时把地址与「报回外层」那一句一起交给渲染接线', () => {
    const { seen, View } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        view: View,
      }),
    );

    expect(seen[0]?.url).toBe('http://localhost:3000/openapi.yaml');
    expect(container.textContent).toBe(
      'spec:http://localhost:3000/openapi.yaml',
    );
  });

  it('报回外层用的是本层命名空间那条 route 消息', () => {
    const posted = capturePosts();
    const { seen, View } = fakeView();
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
    const { View } = fakeView();

    renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        view: View,
      }),
    );

    expect(posted.map((entry) => entry.data)).toEqual([
      apiFrameMessages(REDOC).ready(),
    ]);
  });
});

describe('渲染接线可以到时再取（`loadView`）', () => {
  it('还没取到之前什么都不渲染', () => {
    const { seen, View } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        loadView: () => Promise.resolve(View),
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );

    expect(container.textContent).toBe('');
    expect(seen).toHaveLength(0);
  });

  it('取到之后把地址与「报回外层」交给它', async () => {
    const { seen, View } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');
    const loadView = vi.fn(() => Promise.resolve(View));

    const container = renderPage(
      createApiFrameView({
        loadView,
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );

    // 那条 effect 里的 `then` 要等微任务队列才轮到；`act` 把这一轮和随之而来的重渲染一起收掉。
    // （`import()` 那种真动态取法在 jsdom 里落不到那一轮，所以这里量的是 `loadView` 这一格本身。）
    await act(async () => {
      await flush();
    });

    expect(loadView).toHaveBeenCalledTimes(1);
    expect(seen[0]?.url).toBe('http://localhost:3000/openapi.yaml');
    expect(container.textContent).toBe(
      'spec:http://localhost:3000/openapi.yaml',
    );
  });

  it('还没取到就被卸载时，那一份回来也不再setState（换页期间不往旧树上写）', async () => {
    const { seen, View } = fakeView();
    setSearch('?src=%2Fopenapi.yaml');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const container = renderPage(
      createApiFrameView({
        loadView: () => Promise.resolve(View),
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );
    // 卸载发生在 effect 之后、那条 promise 的 `then` 之前：`stopped` 那一格就是为这一段设的。
    // 要把容器交回 `renderPage` 记下的那份卸载函数（它手里才有那棵树的 root）。
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
    await act(async () => {
      await flush();
    });

    expect(container.isConnected).toBe(false);
    expect(seen).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('取不到就把原因交给控制台，这一页的正文留空、不往外抛', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setSearch('?src=%2Fopenapi.yaml');

    const container = renderPage(
      createApiFrameView({
        loadView: () => Promise.reject(new Error('chunk 没了')),
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
      }),
    );

    await act(async () => {
      await flush();
    });

    expect(container.textContent).toBe('');
    expect(warn).toHaveBeenCalledWith(
      '[theme-iframe] 框内渲染器加载失败：',
      expect.any(Error),
    );
    warn.mockRestore();
  });
});

describe('亮暗落法由调用方给：两格互斥', () => {
  it('给了 `modeAttribute` 就写到这一份文档 `<html>` 上那条属性', () => {
    const { View } = fakeView();
    renderPage(
      createApiFrameView({
        modeAttribute: 'data-redoc-mode',
        namespace: REDOC,
        view: View,
      }),
    );

    dispatchMessage(apiFrameMessages(REDOC).mode('dark'));

    expect(document.documentElement.dataset.redocMode).toBe('dark');
  });

  it('给了 `onMode` 就整格交回调用方（Scalar 换的是 `<body>` 上两个类名）', () => {
    const onMode = vi.fn();
    const { View } = fakeView();
    renderPage(createApiFrameView({ namespace: SCALAR, onMode, view: View }));

    dispatchMessage(apiFrameMessages(SCALAR).mode('dark'));

    expect(onMode).toHaveBeenCalledWith('dark');
    expect(Object.hasOwn(document.documentElement.dataset, 'redocMode')).toBe(
      false,
    );
  });
});
