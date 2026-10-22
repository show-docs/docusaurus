import './redoc-ui.css';

// 渲染要用的那份文档地址，加上「选中了哪条接口」报给框外那一份文档 ——
// 这一格的形状由 theme-iframe 那份框内工厂给出（`ApiFrameViewProps`），三份渲染接线共用一份。
import type { ApiFrameViewProps as Props } from '@show-docs/docusaurus-theme-iframe/lib/index.ts';
import { RedocStandalone } from 'redoc';
import { StyleSheetManager } from 'styled-components';

import { useEffect, useRef } from 'react';
import { HashRouter, useLocation } from 'react-router';

import { followSiteColorMode } from './redoc-color-mode.ts';

// 包着 Redoc 的那层壳。`redoc-ui.css` 收掉的三处、e2e 那几条判据都认这个类名；
// 它**不再**参与样式圈定（那件事现在由 iframe 的文档边界负责，见 `redoc-color-mode.ts`）。
const REDOC_ROOT_CLASS = 'redoc-root';

/**
站在 `HashRouter` 里面，把「地址里 `#` 那一段」报给外面。

不能靠监听 `hashchange`：React Router 换地址走 `history.pushState`，那一步不触发它
（理由与实测记在 theme-iframe 的 `docs/iframe-protocol.md`，「四个方向各走一条路」一节）。
`first` 那一格是那条「挂载那一次别报」的约定，见 `createRouteReporter`。
*/
function LocationMirror(props: Pick<Props, 'onRouteChange'>): null {
  const { onRouteChange } = props;
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
}

// `disableTelemetry`：`redoc` 的依赖里挂着 `@redocly/redoc-opentelemetry`，默认会把文档标题
// 之类的用量报出去。本仓的示例页全在本地（`/openapi-redoc.yaml`），也不该往第三方发东西。
//
// `hideDownloadButtons`：Redoc 把「Download OpenAPI description」那一格排在正文最前面，链接指向
// 它取 spec 用的那个地址 —— 本层没传 `downloadUrls`，`redoc@3.0.1` 自己从 `specUrl` 推出这一条
// （改之前实测框内正文第一格就是 `data-testid="panel-download-openapi-description"`）。那条地址是
// 站点 `static/` 里的那份 yaml，直接给出去只是让人绕开这一页去抓原始文件。
//
// `options` 里**没有** `scrollYOffset`：Redoc 渲染时调用那个函数，把返回值写成容器上的
// `--navbar-height` 与 `--navbar-stack-height`，左栏高度、sticky 停靠位、滚过去的
// `scroll-margin-top` 全从这两条取值；不给就按 0 算（`redoc` 里那一格是
// `Math.max(fn?.() ?? 0, 0)`）。本组件只跑在框内那份文档上，那份文档没有 navbar，
// 量出来本来也是 0，于是连量都省了。高度链的口径在包 `docs/internals.md` 的「高度」一节。
const options = { disableTelemetry: true, hideDownloadButtons: true } as const;

// 数组写成模块级的常量：`StyleSheetManager` 按 props 认这张样式表，每次渲染换一个新数组就
// 等于换一张表，Redoc 的规则会被重新插一遍。
const stylisPlugins = [followSiteColorMode];

export function RedocUI(props: Props) {
  // 服务端那一遍不在这里挡：渲染到这一格的只有 theme-iframe 那份框内工厂，它在浏览器之外就返回
  // `null`（spec 地址在地址栏里，那份数据服务端根本没有）。
  //
  // 外面这一层 `HashRouter` 是本层的路由口径，理由见包 `docs/internals.md` 的「路由」一节：
  // `RedocStandalone` 自己不带 `router` 选项，只在**没有外层路由**时补一个按路径的
  // `BrowserRouter`。地址改成 `#/…` 之后有两处对上：框内换成另一条接口不重新加载整份文档；
  // 外层那条能分享的地址（`/redoc-demo#/orders/createorder`）里 hash 不参与取文件，托管侧回 200
  // —— 两边怎么对齐记在 theme-iframe 的 `docs/iframe-protocol.md`。`basePath` 也不用传：
  // hash 里只剩 `/orders/…`，默认的 `/` 就对。
  //
  // `react-router` 必须与 `redoc` 内部用的是**同一个模块实例**，否则那句 `useInRouterContext()`
  // 读不到这里的 context，它还是会自己造一个按路径的路由。
  //
  // `StyleSheetManager` 同一个道理：它靠 React context 把中间件递给 styled-components，只有和
  // `redoc` 用**同一份** styled-components 才接得上（版本线见 `package.json`）。这条链上现在只剩
  // 一件事 —— 把 Redoc 的暗色表改挂到本层自己那条 `<html data-redoc-mode>` 上（值由外层送来，
  // 口径记在包 `docs/internals.md` 的「样式」与「亮暗模式」两节），写在 `redoc-color-mode.ts`。
  return (
    <div className={REDOC_ROOT_CLASS}>
      <HashRouter>
        <LocationMirror onRouteChange={props.onRouteChange} />
        <StyleSheetManager stylisPlugins={stylisPlugins}>
          <RedocStandalone options={options} specUrl={props.url} />
        </StyleSheetManager>
      </HashRouter>
    </div>
  );
}
