/**
框内那一页怎么把渲染器取进来：三份渲染器（Scalar / Redoc / Elements）各带几 MB 依赖，
只在真渲染时才 `import()`，静态那一条 `import` 一概留在各包的 `components/` 里。

为什么还要这一格：那条路由的 chunk 不是任何页面的首屏，但它就是「这一页要不要下载」的全部
判据 —— 静态交进来就跟着框内那份文档一起下载，动态取才有分词。三份各写一遍同样的「取之前空着、
取不到说一句话」，就会在三个地方各漂一次，所以取法留在这里、各家只交那一句 `() => import(…)`。

**取到之前什么都不渲染**（只有 `pending` 那一格那句话）：这条取法走 effect 而不是 React 的
挂起，所以没有 `Suspense` 那份 `fallback` 可用。取不到时在框里摆一条看得见的说明，而不是让
整份文档空白 —— 框里那份文档本来就在别人的页面上，空白看起来像「这条规则没生效」。
*/

import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

import Admonition from '@theme/Admonition';

/** `loadView` 可能交回的那几种形状：组件本身，或 `import()` 那份带 `default` 的模块。 */
export type ViewModule<P extends object> =
  ComponentType<P> | { default: ComponentType<P> };

/**
按取法取那份接线：取到之前交回 `null`，取到之后交回组件本身（引用稳定）。

`loadView` 那份引用要由调用方写死在模块级（`() => import(…)`），每次渲染都是同一个，所以排进
effect 依赖是安全的 —— 这条 `import` 实际只会发一次。
*/
export function useLazyView<P extends object>(
  loadView: () => Promise<ViewModule<P>>,
): { View: ComponentType<P> | undefined; error: unknown } {
  const [state, setState] = useState<{
    View?: ComponentType<P>;
    error?: unknown;
  }>({});

  useEffect(() => {
    let stopped = false;

    loadView()
      .then((module) => {
        if (stopped) {
          return;
        }

        const View = typeof module === 'function' ? module : module.default;

        // 写成 `() => View`：直接把函数交给 `setState` 会被当成 updater，
        // React 会拿上一个值去调它 —— 那一次调用就把新组件渲成 `undefined` 的 props。
        setState(() => ({ View }));
      })
      .catch((error: unknown) => {
        if (!stopped) {
          setState({ error });
        }
      });

    return () => {
      stopped = true;
    };
  }, [loadView]);

  return { View: state.View, error: state.error };
}

/** 三份渲染器共用的那两句说法。 */
const DEFAULT_PENDING = '正在装载这一页的渲染器…';

type Props<P extends object> = {
  /** 真渲染时才去取那份接线（见 {@link useLazyView}）。 */
  loadView: () => Promise<ViewModule<P>>;
  /** 交给那个组件的入参；引用可以每次渲染都换，它不排进任何依赖。 */
  viewProps: P;
  /** 取到之前那一格的说法。 */
  pending?: string;
};

/**
那一层按需的壳：取到之前是 `pending` 那句话，取不到是一条看得见的错误，取到之后把 `viewProps`
原样交给它。

它自己是一个组件、而不是在同一层里判「取到没有」，是为了让不必按需的那些组件一个 hook
都不多挂。
*/
export function LazyView<P extends object>({
  loadView,
  viewProps,
  pending = DEFAULT_PENDING,
}: Props<P>): ReactNode {
  const { View, error } = useLazyView(loadView);

  if (error !== undefined) {
    return (
      <Admonition title="这一页的渲染器装载失败" type="danger">
        {`theme-component-page：${String(error)}。这一格是渲染器自己的问题（依赖装载不上），不是这条规则没生效。`}
      </Admonition>
    );
  }

  if (View === undefined) {
    return <p>{pending}</p>;
  }

  // `View` 来自 `import()`，取到之后就是同一个引用 —— 不是每次渲染新造一个组件（那才是
  // `react-hooks/static-components` 要拦的情况，这里够不上它）。
  return <View {...viewProps} />;
}
