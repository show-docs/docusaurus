import './stoplight-ui.css';

// 交给 `@stoplight/elements` 的那个地址，加上「选中了哪条接口」报给框外那一份文档 ——
// 这一格的形状由 theme-iframe 那份框内工厂给出（`ApiFrameViewProps`），三份渲染接线共用一份。
import type { ApiFrameViewProps as Props } from '@show-docs/docusaurus-theme-iframe/lib/index.ts';
import { API } from '@stoplight/elements';
// 这一条 `import` 拿到的不是「把这文件打进 bundle」，而是**它单独那个产物的地址**（一个字符串）：
// `src/index.mts` 给这一条路径配了 webpack 的 `asset/resource` 规则，并把它从 Docusaurus 的 css
// 规则里摘了出去。为什么要这么绕 —— Docusaurus 把每一个 css 导入都并进**全站那一份**
// `assets/css/styles.<hash>.css`，产物里每条页面都 `<link>` 同一个文件，而 Elements 那张表里有一批
// 不带 `.sl-` 的全局规则，进了那一份 bundle 就是整站生效。iframe 隔的是 DOM 与运行时，
// **隔不了静态 CSS**，所以这里要的是「这份样式表只出现在框内那一页」。
// 规则条数、改造前实测到的症状，以及为什么 `theme-redoc` 那边能整条删掉圈定（它的样式是
// styled-components 在运行期插进它自己那份文档的 `<head>`，不进这份 bundle）都记在 `docs/internals.md` 的
// 「样式」一节。
import stoplightStylesUrl from '@stoplight/elements/styles.min.css';

import { useEffect, useRef } from 'react';
import { HashRouter, useLocation } from 'react-router-dom';

/**
框内那份文档拿来说「现在是暗色」的那条属性。

本层不需要改写谁的样式：`@stoplight/elements/styles.min.css` 里那套暗色规则本来就是
`[data-theme=dark]` 打头的（调色板那些 `--text-h` / `--bg` 写在这条属性所在的元素上，再靠继承落到
`.sl-elements` 那一整棵子树）。把它写在**这一份文档自己的 `<html>`** 上，配色就跟着站点走 ——
值由外层随消息送进来，落点在 theme-iframe 那份框内工厂里。`theme-redoc` 那边要多写一个
styled-components 的中间件，是因为 Redoc 的暗色表挂在它自己按操作系统偏好写的 `:root.dark` 上。
*/
export const COLOR_MODE_ATTRIBUTE = 'data-theme';

/** 包着 Elements 的那层壳，也是 `stoplight-ui.css` 那份样式的作用范围。 */
const STOPLIGHT_ROOT_CLASS = 'stoplight-root';

/**
站在 `HashRouter` 里面，把「这一份文档地址里 `#` 那一段」报给外面。

不能靠监听 `hashchange`：Elements 换一条接口走 `history.pushState`，那一步不触发它
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

// `hideExport`：那条「Export / Download」入口在本仓的示例页上没有对象（文档是站点自己那份
// `static/openapi.yaml`，导出一份再存回本地没有意义）。
// `router: 'hash'` 这一格**不再**决定用哪种路由（下面那层 `HashRouter` 才是），它喂的是
// Elements 的 `RouterTypeContext`：章节标题那颗锚点链接按它决定要不要把 `#id` 接在当前路径后面
// （`hash` 那一支会，见包里的 `LinkHeading`）。**不传 `basePath`**：命中 `outerRouter` 那一支时
// 它会被拿去做「从当前路径里剥掉前缀」那一步，而这一份文档没有前缀可剥，传了侧栏就认不出当前接口。
const shared = { hideExport: true, router: 'hash' } as const;

export function StoplightUI(props: Props) {
  // 服务端那一遍不在这里挡：渲染到这一格的只有 theme-iframe 那份框内工厂，它在浏览器之外就返回
  // `null`（spec 地址在地址栏里，那份数据服务端根本没有）。
  //
  // 外面这一层 `HashRouter` 是本层的路由口径，与 `theme-redoc` 的 `RedocUI` 同一取舍：
  // `@stoplight/elements` 的 `API` 外面套着它自己的 `withRouter`，那个高阶组件按
  // `useInRouterContext()` 决定要不要自建路由 —— 给它一个，它就不自建，于是「框里换一条接口」
  // 只是这一份文档里的一次 hash 变化，整份文档不重新加载，而且外层那条能分享的地址
  // （`/stoplight-demo#/operations/createOrder`）里 hash 不参与取文件，托管侧回 200
  // —— 两边怎么对齐记在 theme-iframe 的 `docs/iframe-protocol.md`。
  //
  // `react-router-dom` 必须与 `@stoplight/elements-core` 内部用的是**同一个模块实例**，否则那句
  // `useInRouterContext()` 读不到这里的 context，它还是自己再造一个路由；那时框里的地址照样变，
  // 但本层收不到，外层地址栏就不跟着换 —— `test/e2e/features/stoplight.feature` 里
  // 「点一条接口，外层地址栏那一段跟着换」那一句钉的就是这一格。版本线由 `package.json` 里那一条
  // `react-router-dom` 钉住，要和 `@stoplight/elements-core` 自己声明的那一条落在同一份产物上。
  return (
    <>
      {/* Elements 那份全局样式表只挂在这一份文档上（站点的文档页压根不加载它，理由见上面那条
          `import`）。它是 `<link>`、不是 JS 注入，所以先于渲染出现也不影响判据：这一页只有
          Elements 一个消费者。 */}
      <link href={stoplightStylesUrl} rel="stylesheet" />
      <div className={STOPLIGHT_ROOT_CLASS}>
        <HashRouter>
          <LocationMirror onRouteChange={props.onRouteChange} />
          <API apiDescriptionUrl={props.url} {...shared} />
        </HashRouter>
      </div>
    </>
  );
}
