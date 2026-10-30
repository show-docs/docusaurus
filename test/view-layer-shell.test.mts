// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, useEffect } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import {
  ViewLayer,
  ViewLayerDocItem,
} from '../packages/theme-component-page/lib/view-layer-shell.tsx';

/**
三条视图层（`theme-markmap` / `theme-erd` / `theme-diff`）共用那份外壳的分支单测
（`@vitest-environment jsdom`：这三份都要 DOM 与 React 渲染）。

量的是共享实现自己的几格：兜底在成功时放行、失败时退回那一条提示（文案跟着调用方给的说法走）、
`ViewLayer` 那三层结构（视图 + 分隔线 + 容器）与正文的顺序、宽度补丁跟着这一格渲染并随卸载
消失、`ViewLayerDocItem` 在有没有本层数据时的两条分支。各包那句说法交了什么文案，归
`view-layer-copies.test.mts` 的源码文本护栏。

`act` 的环境标记与另两份 jsdom 用例同一口径（只认 globalThis，是那条 unicorn 规则的唯一例外）。
*/
// eslint-disable-next-line unicorn/no-global-object-property-assignment -- React act 的环境标记只认 globalThis
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const HACK_STYLE = 'style[data-theme-view-layer-hack]';

const mounted: Array<() => void> = [];

function renderPage(node: ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  mounted.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  return container;
}

/** 一渲染就抛的子树：`getDerivedStateFromError` 收的就是它。 */
function Boom(): ReactNode {
  throw new Error('视图初始化出错');
}

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount();
  }
  vi.restoreAllMocks();
});

const labels = {
  name: 'theme-probe',
  title: '视图渲染失败',
  description: '本文标记了 probe，但视图初始化出错，请查看浏览器控制台。',
};

describe('ErrorBoundary：三条视图层共用的那一份兜底', () => {
  it('没出错时原样放行视图，不出提示', () => {
    function Fine({ data }: { data: string }): ReactNode {
      return createElement('span', { id: 'inner' }, data);
    }
    const page = renderPage(
      createElement(ViewLayerDocItem<string>, {
        labels,
        data: '视图',
        view: Fine,
      }),
    );

    expect(page.querySelector('#inner')?.textContent).toBe('视图');
    // 提示那一格是 `Admonition`，没出错时不该出现
    expect(page.querySelector('.alert')).toBeNull();
  });

  it('出错时退回调用方给的那条提示，且只打一条带本层名字的控制台', () => {
    const consoleError = vi.spyOn(console, 'error').mockReturnValue();
    const page = renderPage(
      createElement(
        ViewLayerDocItem<string>,
        { labels, data: 'boom', view: Boom },
        createElement('article', { id: 'doc' }, '正文'),
      ),
    );

    expect(page.textContent).toContain(labels.title);
    expect(page.textContent).toContain(labels.description);
    // 控制台那一行的前缀就是调用方交的包名，后面跟的是本层那句标题。
    // （React 自己还会为这次抛出打一条，所以这里不数次数，只钉子串。）
    const line = `[${labels.name}] ${labels.title}：`;
    expect(consoleError.mock.calls.map((call) => call[0])).toContain(line);
  });

  it('控制台那一行用的是调用方交的包名（两条层各说各的）', () => {
    const consoleError = vi.spyOn(console, 'error').mockReturnValue();
    const other = { ...labels, name: 'theme-other' };
    renderPage(
      createElement(ViewLayerDocItem<string>, {
        labels,
        data: 'boom',
        view: Boom,
      }),
    );
    renderPage(
      createElement(ViewLayerDocItem<string>, {
        labels: other,
        data: 'boom',
        view: Boom,
      }),
    );

    const lines = consoleError.mock.calls.map((call) => call[0]);
    expect(lines).toContain(`[${labels.name}] ${labels.title}：`);
    expect(lines).toContain(`[${other.name}] ${other.title}：`);
  });
});

describe('ViewLayer：视图 + 分隔线 + 装正文的容器', () => {
  it('视图在正文之前，两者之间一条分隔线', () => {
    const page = renderPage(
      createElement(
        ViewLayer,
        { view: createElement('div', { id: 'view' }, '视图') },
        createElement('article', { id: 'doc' }, '正文'),
      ),
    );

    const view = page.querySelector('#view');
    const divider = page.querySelector('hr');
    const doc = page.querySelector('#doc');

    expect(view?.textContent).toBe('视图');
    expect(divider).not.toBeNull();
    expect(doc?.textContent).toBe('正文');
    // 视图 → hr → 容器（正文的外壳）
    expect(view?.nextElementSibling).toBe(divider);
    expect(divider?.nextElementSibling).toBe(doc?.parentElement);
  });

  it('正文那层容器带的是官方间距类名与那条补丁认的 `.fake`', () => {
    const page = renderPage(
      createElement(ViewLayer, { view: null }, createElement('i')),
    );

    const container = page.querySelector('hr')?.nextElementSibling;
    expect(container?.className.split(' ')).toEqual([
      'container',
      'padding-top--md',
      'padding-bottom--lg',
      'fake',
    ]);
  });

  it('没有视图时只剩分隔线与容器（调用方不必自己判空）', () => {
    const page = renderPage(
      createElement(ViewLayer, { view: null }, createElement('i')),
    );
    expect(page.querySelector('hr')).not.toBeNull();
  });
});

describe('宽度补丁：跟着视图那一格来，也跟着它走', () => {
  it('补丁渲染在视图自己的子树里，规则按 :has() 限定作用域', () => {
    const page = renderPage(
      createElement(ViewLayer, { view: null }, createElement('i')),
    );

    const style = page.querySelector<HTMLStyleElement>(HACK_STYLE);
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain('.container:has(.fake)');
    expect(style?.textContent).toContain('max-width: 100% !important');
  });

  it('不往 <head> 插；卸载后页面里一份都不剩（SPA 离开视图页）', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(ViewLayer, { view: null }));
    });
    expect(document.querySelector(HACK_STYLE)).not.toBeNull();

    act(() => {
      root.unmount();
    });
    container.remove();

    expect(document.querySelector(HACK_STYLE)).toBeNull();
    expect(document.head.querySelector(HACK_STYLE)).toBeNull();
  });

  it('没有视图层的普通页：一份补丁都没有', () => {
    renderPage(createElement('article', { id: 'plain' }, '正文'));

    expect(document.querySelector(HACK_STYLE)).toBeNull();
  });
});

describe('ViewLayerDocItem：命中才插那块视图，不命中原样交给下层', () => {
  const labels = {
    name: 'theme-probe',
    title: '视图渲染失败',
    description: '本文标记了 probe，但视图初始化出错，请查看浏览器控制台。',
  };

  function Probe({ data }: { data: string | null }): ReactNode {
    return createElement('div', { id: 'probe' }, data);
  }

  it('本层数据在：视图在前、正文在后，那条补丁也一起挂上', () => {
    const page = renderPage(
      createElement(
        ViewLayerDocItem<string>,
        { labels, data: 'probe-data', view: Probe },
        createElement('article', { id: 'doc' }, '正文'),
      ),
    );

    expect(page.querySelector('#probe')?.textContent).toBe('probe-data');
    expect(page.querySelector('hr')).not.toBeNull();
    expect(page.querySelector('#doc')?.textContent).toBe('正文');
    expect(page.querySelector(HACK_STYLE)).not.toBeNull();
  });

  it('本层数据不在（`undefined` / `null`）：没有视图、没有分隔线，只剩下层交回的那份', () => {
    for (const data of [undefined, null]) {
      const page = renderPage(
        createElement(
          ViewLayerDocItem<string | null>,
          { labels, data, view: Probe },
          createElement('article', { id: 'doc' }, '正文'),
        ),
      );

      expect(page.querySelector('#probe')).toBeNull();
      expect(page.querySelector('hr')).toBeNull();
      expect(page.querySelector('#doc')?.textContent).toBe('正文');
      // 不命中 = 这一层根本不该挂补丁
      expect(page.querySelector(HACK_STYLE)).toBeNull();
    }
  });

  it('父级换一份 labels（同层 re-render）时视图不重挂，补丁也只渲染一份', () => {
    let mounts = 0;
    function Counting({ data }: { data: string }): ReactNode {
      // 只在挂载那一次跑：re-render 不算，重挂才算。
      useEffect(() => {
        mounts += 1;
      }, []);
      return createElement('div', { id: 'probe' }, data);
    }

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    const renderWith = (labelsNow: typeof labels): void => {
      act(() => {
        root.render(
          createElement(ViewLayerDocItem<string>, {
            labels: labelsNow,
            data: 'probe-data',
            view: Counting,
          }),
        );
      });
    };

    renderWith(labels);
    // 调用方每次渲染都现造一份说法（三条层都这么写），类身份必须只由本模块决定
    renderWith({ ...labels });

    expect(mounts).toBe(1);
    expect(container.querySelectorAll(HACK_STYLE)).toHaveLength(1);
  });

  it('视图那边抛了：退回本层那条提示，正文照旧不白屏', () => {
    vi.spyOn(console, 'error').mockReturnValue();
    const page = renderPage(
      createElement(
        ViewLayerDocItem<string>,
        { labels, data: 'boom', view: Boom },
        createElement('article', { id: 'doc' }, '正文'),
      ),
    );

    expect(page.textContent).toContain(labels.title);
    // 兜底只罩住视图那一格，正文不跟着一起没
    expect(page.querySelector('#doc')?.textContent).toBe('正文');
  });
});
