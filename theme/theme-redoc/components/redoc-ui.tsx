import './redoc-ui.css';

import { RedocStandalone } from 'redoc';
import { StyleSheetManager } from 'styled-components';

import { useEffect, useRef } from 'react';
import { HashRouter, useLocation } from 'react-router';

import { followSiteColorMode } from './redoc-color-mode.ts';

// 包着 Redoc 的那层壳。`redoc-ui.css` 收掉的三处、e2e 那几条判据都认这个类名；
// 它**不再**参与样式圈定（那件事现在由 iframe 的文档边界负责，见 `redoc-color-mode.ts`）。
const REDOC_ROOT_CLASS = 'redoc-root';

type Props = {
  /** 要渲染的那份 OpenAPI 文档的地址。 */
  url: string;
  /** 选中了哪条接口，报给框外那一份文档（用它的就是 theme-iframe 那份框内工厂）。 */
  onRouteChange: (hash: string) => void;
};

/**
站在 `HashRouter` 里面，把「地址里 `#` 那一段」报给外面。

这件事只能在这里做，不能靠监听 `hashchange`：React Router 换地址走的是
`history.pushState`，**它不触发 `hashchange`**（那个事件只由改 `location.hash`、点锚点链接、
前进/后退这几条路触发）。实测就是这条：框里点一条接口，`location.hash` 变了、路由认到了，
`hashchange` 一次都没进来。

刚挂载那一次不报（`first` 那一格）：那一次报的是初始位置 `#/`，而外层可能正带着一条深链
（`/redoc-demo#/orders/createorder`）—— 初始那一句会先把外层地址栏里那一段擦成 `#/`，
紧接着外层补送深链时读到的已经是被擦过的值，深链就丢了。
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
// 之类的用量报出去。本仓的示例页全在本地（`/openapi.yaml`），也不该往第三方发东西。
//
// `options` 里**没有** `scrollYOffset`：Redoc 在渲染时调用那个函数，把返回值写成容器上的
// `--navbar-height` 与 `--navbar-stack-height`，左栏高度、sticky 停靠位、点接口时滚过去的
// `scroll-margin-top` 全从这两条取值；不给它就直接按 0 算（`redoc` 里那一格是
// `Math.max(fn?.() ?? 0, 0)`）。本组件只跑在 iframe 里那份文档上（见 theme-iframe 的
// `lib/api-frame-view.tsx`），那份文档没有 navbar，量出来本来也是 0，于是连量都省了。
// 高度链的口径在包 README 的
// 「高度」一节。
const options = { disableTelemetry: true } as const;

// 数组写成模块级的常量：`StyleSheetManager` 按 props 认这张样式表，每次渲染换一个新数组就
// 等于换一张表，Redoc 的规则会被重新插一遍。
const stylisPlugins = [followSiteColorMode];

export function RedocUI(props: Props) {
  // 服务端那一遍不在这里挡：渲染到这一格的只有 theme-iframe 那份框内工厂，它在浏览器之外就
  // 返回 `null` 了（它还要读地址栏，那份数据服务端根本没有）。
  //
  // 外面这一层 `HashRouter` 是本层的路由口径，理由见包 README 的「深链」一节：
  // `RedocStandalone` 自己不带 `router` 选项，它只在**没有外层路由**时补一个按路径的
  // `BrowserRouter`。地址改成 `#/…` 之后有两处对上：框内这一页换成另一条接口不会重新加载
  // 整份文档；外层那条能分享的地址（`/redoc-demo#/orders/createorder`）里 hash 不参与取文件，
  // 产物有这一页，托管侧回 200 —— 两边怎么把那一段对齐记在 theme-iframe 的 `docs/iframe-protocol.md`。
  // `basePath` 也不用传了：hash 里只剩 `/orders/…`，`RedocStandalone` 默认的 `/` 就对。
  //
  // `react-router` 必须与 `redoc` 内部用的是**同一个模块实例**，否则它那句
  // `useInRouterContext()` 读不到这里的 context，还是会自己造一个按路径的路由。
  //
  // `StyleSheetManager` 同一个道理：它靠 React context 把中间件递给 styled-components，
  // 只有和 `redoc` 用**同一份** styled-components 才接得上（`package.json` 里那份
  // `styled-components` 与 `redoc` 自己声明的是同一条版本线）。这条链上现在只剩一件事 ——
  // 把 Redoc 的暗色表改挂到本层自己那条 `<html data-redoc-mode>` 上（值由外层送来，
  // 落点见 theme-iframe 的 `lib/api-frame-view.tsx`），写在 `redoc-color-mode.ts`，口径记在
  // 包 README 的「样式」与
  // 「亮暗模式」两节。
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
