import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';

/**
「把框内这份文档地址里 `#` 那一段报给外层」这一格，`theme-redoc` 与 `theme-stoplight` 共用。

两份渲染接线的差别只有 `useLocation` 从哪个包来：Redoc 那份路由是 `react-router`，
Elements 那份是 `react-router-dom`。**不能在这里 import 其中任意一个** —— 两条依赖线各自
要求「与渲染器内部用的是同一个模块实例」，替它们选定一个包会把另一条路由的 context 读空。
所以这里收成工厂，由各层把自己那个包里的 `useLocation` 交进来。

不能靠监听 `hashchange`：Redoc 与 Elements 换一条接口走 `history.pushState`，那一步不触发它
（理由与实测记在 `docs/iframe-protocol.md`，「四个方向各走一条路」一节）。

`first` 那一格是「挂载那一次别报」：外层已经把这段地址交给框了，挂载时再报一遍只是把同一段
地址写回去；真正要报的是用户之后在框里换的那一条，判据见 `frame-sync.tsx` 里 `useFrameBridge`
那段说明。
*/

/** 路由包给的那个位置里，本层真正要用的三格（`react-router` 与 `react-router-dom` 都满足）。 */
export type RouterLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export type LocationMirrorProps = {
  /** 选中了哪条接口，报给框外那一份文档。 */
  onRouteChange: (hash: string) => void;
};

/**
造出那一格镜像：每次换地址把 `#pathname+search+hash` 报出去一次，挂载那一次不报。
*/
export function createLocationMirror(
  useLocation: () => RouterLocation,
): ComponentType<LocationMirrorProps> {
  return function LocationMirror({ onRouteChange }: LocationMirrorProps): null {
    const location = useLocation();
    const first = useRef(true);

    useEffect(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      onRouteChange(`#${location.pathname}${location.search}${location.hash}`);
    }, [location, onRouteChange]);

    return null;
  };
}
