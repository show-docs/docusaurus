// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement } from 'react';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import {
  LazyView,
  useLazyView,
  type ViewModule,
} from '../packages/theme-component-page/lib/frame-view.tsx';

/**
## 框内那一页怎么把渲染器取进来

三份渲染器（Scalar / Redoc / Elements）各带几 MB 依赖，只在真渲染时才 `import()`；「取之前空着、
取不到说一句话」这一套形状共用这一份，所以这里量的是**壳**：三种状态各落到什么、那条 `import`
实际发几次、以及摘掉之后落不落地。

组件本体长什么样、那份依赖装不装得上，是各包 `components/` 与 webpack 分词的事，由 e2e 在真浏览器
里钉（那一条要看网络面板上的 chunk）；这里把 `import()` 换成一句能手动翻面的 Promise。
*/

type Props = { value: number };

// 这一族是 `.mts`，oxc 不按 JSX 解析，元素一律走 `createElement`（跟 `frame-sync.test.mts` 同一口径）。
function Probe({ value }: Props): ReactElement {
  return createElement('p', null, `probe:${value}`);
}

/** 让挂在 effect 里的那条 Promise 落地：微任务要在 `act` 里排空，React 才算完这一次更新。 */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** 一条可以手动翻面的取法：`calls` 数那条 `import` 实际发了几次。 */
function controllableLoad(module: ViewModule<Props>): {
  calls: () => number;
  loadView: () => Promise<ViewModule<Props>>;
  reject: (error: unknown) => Promise<void>;
  resolve: () => Promise<void>;
} {
  let pending:
    | {
        reject: (error: unknown) => void;
        resolve: (value: ViewModule<Props>) => void;
      }
    | undefined;

  let calls = 0;

  return {
    calls: () => calls,
    loadView: () =>
      new Promise<ViewModule<Props>>((resolve, reject) => {
        calls += 1;
        pending = { reject, resolve };
      }),
    reject: async (error: unknown) => {
      act(() => {
        pending?.reject(error);
      });
      await flush();
    },
    resolve: async () => {
      act(() => {
        pending?.resolve(module);
      });
      await flush();
    },
  };
}

/** 一条立刻成功的取法（`module` 可以是组件本身，也可以是 `import()` 那份带 `default` 的壳）。 */
const loaded =
  (module: ViewModule<Props>): (() => Promise<ViewModule<Props>>) =>
  () =>
    Promise.resolve(module);

/** 一条立刻失败的取法：`loadView()` 交回的就是以 `error` 拒掉的 Promise。 */
const failing =
  (error: unknown): (() => Promise<ViewModule<Props>>) =>
  async () => {
    throw error;
  };

/** React 的 `act` 要求测试环境自己声明「这里是测试环境」，不设就是每条告警一次。 */
function declareActEnvironment(): void {
  // 这一格只能挂在 globalThis 上（React 就是这么读的），是这条 unicorn 规则的唯一例外，
  // 换 `@testing-library/react` 可以免掉它（它替设），代价是多一份依赖 —— 这里选了后者省。
  // eslint-disable-next-line unicorn/no-global-object-property-assignment -- React act 的环境标记只认 globalThis
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
}

/** `loadView` 那一条 Promise 的形状（`P` 在本份测试里始终是 `Props`）。 */
type LoadView = () => Promise<ViewModule<Props>>;

/** 那一层壳的入参，`P` 钉成 `Props`（泛型组件在 `createElement` 那一格推不出类型参数）。 */
type LazyViewProps = {
  loadView: LoadView;
  pending?: string;
  viewProps: Props;
};

const lazyView = (props: LazyViewProps): ReactElement =>
  createElement(LazyView as ComponentType<LazyViewProps>, props);

function mountInto(element: ReactNode): {
  container: HTMLDivElement;
  rerender: (next: ReactNode) => void;
  text: () => string;
  unmount: () => void;
} {
  declareActEnvironment();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (node: ReactNode): void => {
    act(() => {
      root.render(node);
    });
  };
  render(element);

  return {
    container,
    rerender: (next: ReactNode) => {
      render(next);
    },
    text: () => container.textContent ?? '',
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** 把一句 `useLazyView` 挂进真文档里跑起来，每次渲染的返回值都摆在盘上给用例读。 */
function mountLazyView(initial: () => Promise<ViewModule<Props>>): {
  latest: () => { View: ComponentType<Props> | undefined; error: unknown };
  push: (next: () => Promise<ViewModule<Props>>) => void;
  unmount: () => void;
} {
  const seen: Array<{
    View: ComponentType<Props> | undefined;
    error: unknown;
  }> = [];

  // 换值靠这个盒子，不靠换元素：换 `createElement` 那份组件类型会让 React 拆了重挂，
  // 那条 effect 就不是「依赖变了」那一路，而是「重新挂载」那一路了。
  const box = { loadView: initial };

  function Harness(): null {
    seen.push(useLazyView(box.loadView));
    return null;
  }

  const shell = mountInto(createElement(Harness));

  return {
    latest: () => seen.at(-1)!,
    push: (next) => {
      box.loadView = next;
      shell.rerender(createElement(Harness));
    },
    unmount: shell.unmount,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLazyView：取之前空着，取到之后引用稳定', () => {
  it('取到之前交回 undefined，同一条取法只发一次（重渲染不会重取）', () => {
    const load = controllableLoad(Probe);
    const harness = mountLazyView(load.loadView);

    expect(harness.latest()).toEqual({ View: undefined, error: undefined });

    // `loadView` 那份引用要由调用方写死在模块级：换一次渲染不该变成再下载一次。
    harness.push(load.loadView);
    harness.push(load.loadView);
    expect(load.calls()).toBe(1);
    harness.unmount();
  });

  it('取到之后交回组件本身：函数与 `import()` 那份带 `default` 的壳两种形状都认', async () => {
    const asFunction = mountLazyView(loaded(Probe));
    expect(asFunction.latest().View).toBeUndefined();
    await flush();
    expect(asFunction.latest().View).toBe(Probe);
    asFunction.unmount();

    const asModule = mountLazyView(loaded({ default: Probe }));
    await flush();
    expect(asModule.latest().View).toBe(Probe);
    asModule.unmount();
  });

  it('取不到时把原因原样交回调用方（不吞、也不替它改成一句话）', async () => {
    const cause = new Error('chunk 404');
    const harness = mountLazyView(failing(cause));
    await flush();

    expect(harness.latest()).toEqual({ View: undefined, error: cause });
    harness.unmount();
  });

  it('取到之前就摘掉：成功与失败都不落地，也不报「卸载后更新状态」', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 两条各一份取法：同一条 Promise 只会被翻面一次，第二次调用是空转。
    const gone = controllableLoad(Probe);
    const stillPending = { View: undefined, error: undefined };
    const success = mountLazyView(gone.loadView);
    expect(success.latest()).toEqual(stillPending);
    success.unmount();
    await gone.resolve();

    const alsoGone = controllableLoad(Probe);
    const failure = mountLazyView(alsoGone.loadView);
    failure.unmount();
    await alsoGone.reject(new Error('太晚了'));

    expect(logged).not.toHaveBeenCalled();
  });
});

describe('LazyView：那一层壳的三种状态', () => {
  it('取到之前只有 pending 那一句，各家不写就用共用那一句', () => {
    const shared = mountInto(
      lazyView({
        loadView: controllableLoad(Probe).loadView,
        viewProps: { value: 1 },
      }),
    );
    expect(shared.text()).toBe('正在装载这一页的渲染器…');
    shared.unmount();

    const custom = mountInto(
      lazyView({
        loadView: controllableLoad(Probe).loadView,
        pending: '稍等，正在取 Redoc…',
        viewProps: { value: 1 },
      }),
    );
    expect(custom.text()).toBe('稍等，正在取 Redoc…');
    custom.unmount();
  });

  it('取到之后把 viewProps 原样交给它：换引用重渲染既不重取、也不漏', async () => {
    const rendereds: Props[] = [];
    function Recording(props: Props): ReactElement {
      rendereds.push(props);
      return createElement('p', null, 'ok');
    }

    const load = controllableLoad(Recording);
    const shell = mountInto(
      lazyView({ loadView: load.loadView, viewProps: { value: 7 } }),
    );
    await load.resolve();
    expect(shell.text()).toBe('ok');

    shell.rerender(
      lazyView({
        loadView: load.loadView,
        viewProps: { value: 8 },
      }),
    );
    expect(rendereds).toEqual([{ value: 7 }, { value: 8 }]);
    expect(load.calls()).toBe(1);
    shell.unmount();
  });

  it('`import()` 那份带 `default` 的壳一样能铺上去', async () => {
    const shell = mountInto(
      lazyView({
        loadView: loaded({ default: Probe }),
        viewProps: { value: 3 },
      }),
    );
    await flush();
    expect(shell.text()).toBe('probe:3');
    shell.unmount();
  });

  it('取不到时在框里摆一条看得见的说明，而不是让整份文档空白', async () => {
    const shell = mountInto(
      lazyView({
        loadView: failing(new Error('chunk 404')),
        viewProps: { value: 1 },
      }),
    );
    await flush();

    const admonition = shell.container.querySelector('.alert--danger');
    expect(admonition?.textContent).toContain('这一页的渲染器装载失败');
    expect(admonition?.textContent).toContain('chunk 404');
    shell.unmount();
  });
});
