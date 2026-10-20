import '@scalar/api-reference/style.css';
import './scalar-ui.css';

import { createApiReference } from '@scalar/api-reference';

import { useEffect, useRef } from 'react';

import { isDarkColorModeAtLoad } from './scalar-color-mode.ts';

type Props = {
  /** 要渲染的那份 OpenAPI 文档的地址。 */
  url: string;
  /** 选中了哪条接口，报给框外那一份文档（用它的就是 `scalar-view.tsx`）。 */
  onRouteChange: (hash: string) => void;
};

/**
把 Scalar 挂到这一格 `<div>` 上，并把两头的地址对接起来。

挂载走 `@scalar/api-reference` 自己那份面向非 Vue 宿主的 `createApiReference(元素, 配置)`：
它在里面 `createApp(…)` 再 `mount(元素)`，本层因此不需要直接引 `vue`。返回的那只句柄里有
`destroy()`，卸载时把整棵 Vue 树收掉。

**框内 → 外层**用配置里的 `onSidebarClick`：它拿到的正是 Scalar 刚往历史里写的那条完整地址，
本层只取 `#` 那一段报出去。为什么不是监听 `hashchange`：Scalar 换接口走
`history.pushState`，那个方法**不触发** `hashchange`（theme-redoc 与 theme-stoplight 栽过同一格）。

**外层 → 框内**反过来：共享层收到外层送来的那一段就写本份文档的 `location.hash`，那一步**会**
触发 `hashchange`，而 Scalar 认的是 `popstate`（它只在挂载那一次读地址，另外只监听前进/后退）。
所以这里把前者转成后者： Scalar 自己在 `popstate` 里按地址取那一条接口、展开左栏、滚过去。
这一转不会成环 —— Scalar 写历史用的是 `pushState` / `replaceState`，两条都不触发 `hashchange`。
*/
export function ScalarUI(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { onRouteChange, url } = props;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }

    const instance = createApiReference(host, {
      // `hideDarkModeToggle`：Scalar 左栏底部那颗它自己的亮暗开关（实测：露出来时是一份
      // `aria-label="Set dark mode"` 的元素，没有 `data-testid`；e2e 那条判据认这个标识）。
      // 配色现在由站点的开关驱动（`scalar-color-mode.ts`），留着它就是一颗跟 navbar 那颗
      // 重复、还会把选择写进 `localStorage` 的按钮 —— 与 theme-redoc 收掉它那颗是同一取舍，
      // 只是这一层不用写 CSS，配置里就有这一格。
      darkMode: isDarkColorModeAtLoad(),
      hideDarkModeToggle: true,
      onSidebarClick: (href: string): void => {
        // 只要 `#` 那一段：外层地址栏里别的什么都不该被框里改掉（见共享层 `useOuterFrameSync`）。
        onRouteChange(new URL(href, window.location.href).hash);
      },
      url,
    });

    const onHashChange = (): void => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    };

    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      instance.destroy();
    };
  }, [onRouteChange, url]);

  // 这一格只是 `createApiReference` 要的挂载宿主，不带类名：`scalar-ui.css` 里那条与 e2e
  // 那几句认的都是 Scalar 自己挂在它下面的 `.scalar-app.scalar-api-reference`。
  return <div ref={hostRef} />;
}
