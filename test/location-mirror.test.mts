// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, createElement, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import {
  createLocationMirror,
  type RouterLocation,
} from '../packages/theme-component-page/lib/location-mirror.tsx';

/**
`theme-redoc` / `theme-stoplight` 共用那一格地址镜像的分支单测（`@vitest-environment jsdom`）。

量两格：挂载那一次不报（外层已经把这段地址交给框了），换地址之后报一次、报的是
`#pathname+search+hash` 拼起来的那一段。

`useLocation` 由用例直接交一个函数进来 —— 这正是工厂收下它的理由（两个路由包各自一条
实例），所以这里不必装任何路由库，也就能把「换地址」变成一次普通 re-render。
*/
// eslint-disable-next-line unicorn/no-global-object-property-assignment -- React act 的环境标记只认 globalThis
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<() => void> = [];

afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount();
  }
  vi.restoreAllMocks();
});

/** 用例摆出来的「当前地址」；改它必须和一次 re-render 成对出现（见 `navigate`）。 */
let currentLocation: RouterLocation = {
  pathname: '/',
  search: '',
  hash: '',
};

/**
`useLocation` 与镜像都必须是**稳定的引用**：工厂在渲染期再调一次就是新组件类型，
React 会卸掉重挂，`first` 那个 ref 跟着重置 —— 那样测出来的是 bug，不是这一格的行为。
*/
const useLocation = (): RouterLocation => currentLocation;
const Mirror = createLocationMirror(useLocation);

/**
一个最小的「路由」：位置放在组件 state 里，`useLocation` 每次渲染读模块级那格。
用例拿到 `navigate` 就能换地址，收到的那一次报告写进 `onRouteChange`。
*/
function renderMirror(initial: RouterLocation): {
  navigate: (next: RouterLocation) => void;
  onRouteChange: ReturnType<typeof vi.fn>;
} {
  currentLocation = initial;
  const onRouteChange = vi.fn<(hash: string) => void>();
  let navigate: (next: RouterLocation) => void = () => undefined;

  function Harness(): ReactNode {
    const [location, setLocation] = useState(initial);
    currentLocation = location;
    navigate = setLocation;

    return createElement(Mirror, { onRouteChange });
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });
  mounted.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  return {
    navigate: (next) => {
      act(() => {
        navigate(next);
      });
    },
    onRouteChange,
  };
}

describe('createLocationMirror：把框内地址里 `#` 那一段报给外层', () => {
  it('挂载那一次不报：外层已经知道这段地址', () => {
    const { onRouteChange } = renderMirror({
      pathname: '/orders/create',
      search: '',
      hash: '',
    });

    expect(onRouteChange).not.toHaveBeenCalled();
  });

  it('换地址之后报一次，内容是 `#` 拼上 pathname + search + hash', () => {
    const { navigate, onRouteChange } = renderMirror({
      pathname: '/',
      search: '',
      hash: '',
    });

    navigate({
      pathname: '/orders/create',
      search: '?env=test',
      hash: '#step-2',
    });

    expect(onRouteChange).toHaveBeenCalledTimes(1);
    expect(onRouteChange).toHaveBeenCalledWith(
      '#/orders/create?env=test#step-2',
    );
  });
});
