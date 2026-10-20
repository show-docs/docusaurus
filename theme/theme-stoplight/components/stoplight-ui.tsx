import './stoplight-ui.css';

import { API } from '@stoplight/elements';
// 这一条 `import` 拿到的不是「把这文件打进 bundle」，而是**它单独那个产物的地址**（一个字符串）：
// `src/index.mts` 里给这一条路径配了 webpack 的 `asset/resource` 规则，并把它从 Docusaurus
// 的 css 规则里摘了出去。为什么要这么绕 —— 直接 `import '@stoplight/elements/styles.min.css'`
// 会被抽进**整站那一份** `assets/css/styles.<hash>.css`，而产物里每一条页面都 `<link>`
// 同一个文件（`build/stoplight-demo/index.html` 与 `build/stoplight-view/index.html` 与主页上是
// 同一个文件名，实测过）。那份样式表里有 26 条不带 `.sl-` 的全局规则（`html`、`body`、`*`、
// `:root`、`a`、`h1`–`h6`、`ol`、`button`…），进了那一份 bundle 就是整站生效：实测把 `<html>`
// 的字体换成它的 `--font-ui`（Inter），主页 `h1` 掉到 `16px / 400`，正文 `a` 变成继承色且没有
// 下划线，`.markdown ol` 的编号被 `list-style: none` 收掉。iframe 隔的是 DOM 与运行时，
// **隔不了静态 CSS**，所以这里要的是「这份样式表只出现在框内那一页」。
//
// `styles.min.css` 里没有 `url()`、没有 `@import`、没有 data URI（实测各 0 处），
// 所以不经 css-loader 也不丢东西。
//
// 这就是 `theme-redoc` 那边能整条删掉圈定而这一层以前删不掉的原因：Redoc 的样式是
// styled-components 在**运行期**插进它自己那份文档的 `<head>`，压根不进这份 bundle；
// Elements 的是静态样式表。口径见包 README 的「样式」一节。
import stoplightStylesUrl from '@stoplight/elements/styles.min.css';

import { useEffect, useRef } from 'react';
import { HashRouter, useLocation } from 'react-router-dom';

// 交给 `@stoplight/elements` 的那个地址，加上「选中了哪条接口」报给框外那一份文档（用它的就是
// `stoplight-view.tsx`）。形状与 `theme-redoc` 的 `RedocUI` 一致。
type Props = {
  url: string;
  onRouteChange: (hash: string) => void;
};

/**
框内那份文档拿来说「现在是暗色」的那条属性。

这一格不需要本层去改写谁的样式：`@stoplight/elements/styles.min.css` 里那套暗色规则本来就是
`[data-theme=dark]` 打头的（调色板那些 `--text-h` / `--bg` 之类的自定义属性就写在这条属性所在的
元素上，再靠继承落到 `.sl-elements` 那一整棵子树）。把它写在**这一份文档自己的 `<html>`** 上，
Elements 的配色就跟着站点走 —— 值由外层随消息送进来，落点在 `stoplight-view.tsx`。
`theme-redoc` 那边要额外写一个 styled-components 的中间件，是因为 Redoc 的暗色表挂在它自己按
操作系统偏好写的 `:root.dark` 类名上；这一层没有那件事。
*/
export const COLOR_MODE_ATTRIBUTE = 'data-theme';

/** 包着 Elements 的那层壳，也是 `stoplight-ui.css` 那份样式的作用范围。 */
const STOPLIGHT_ROOT_CLASS = 'stoplight-root';

/**
站在 `HashRouter` 里面，把「这一份文档地址里 `#` 那一段」报给外面。

这件事只能在这里做，不能靠监听 `hashchange`：Elements 换一条接口走的是 `history.pushState`，
**它不触发 `hashchange`**（那个事件只由改 `location.hash`、点锚点链接、前进/后退这几条路触发）。
实测就是这条：框里点一条接口，`location.hash` 变了、Elements 认到了，`hashchange` 一次都没进来。
`theme-redoc` 那边同一件事由 React Router 自己报，见 `redoc-ui.tsx` 里的同名组件。

刚挂载那一次不报（`first` 那一格）：那一次报的是初始位置 `#/`，而外层可能正带着一条深链
（`/stoplight-demo#/operations/createOrder`）—— 初始那一句会先把外层地址栏里那一段擦成 `#/`，
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

// `hideExport`：那条「Export / Download」的入口在本仓的示例页上没有对象（文档是站点自己那份
// `static/openapi.yaml`，导出一份再存回本地没有意义）。
// `router: 'hash'` 这一格**不再**决定用哪种路由（下面那层 `HashRouter` 才是），它喂的是
// Elements 的 `RouterTypeContext`：章节标题那颗锚点链接按这一格决定要不要把 `#id` 接在当前
// 路径后面（`hash` 那一支会，见它包里的 `LinkHeading`）。
// **不传 `basePath`**：命中 `outerRouter` 那一支时它会被拿去做「从当前路径里剥掉前缀」那一步，
// 而这一份文档没有前缀可剥，传了只会让侧栏认不出当前那条接口。
const shared = { hideExport: true, router: 'hash' } as const;

export function StoplightUI(props: Props) {
  // 服务端那一遍不在这里挡：唯一会渲染到这一格的是 `stoplight-view.tsx`，它自己在浏览器之外就
  // 返回 `null` 了（它还要读地址栏，那份数据服务端根本没有）。
  //
  // 外面这一层 `HashRouter` 是本层的路由口径，与 `theme-redoc` 的 `RedocUI` 同一取舍：
  // `@stoplight/elements` 的 `API` 外面套着它自己的 `withRouter`，那个高阶组件按
  // `useInRouterContext()` 决定要不要自建一个路由 —— 我们给它一个，它就不自建，
  // 于是「框里换一条接口」只是这一份文档里的一次 hash 变化，整份文档不重新加载，
  // 而且外层那条能分享的地址（`/stoplight-demo#/operations/createOrder`）里
  // hash 不参与取文件，托管侧回 200。两边怎么对齐记在 theme-iframe 的 `docs/iframe-protocol.md`。
  //
  // `react-router-dom` 必须与 `@stoplight/elements-core` 内部用的是**同一个模块实例**，否则
  // 那句 `useInRouterContext()` 读不到这里的 context，它还是会自己再造一个路由；那时
  // 框里的地址照样变，但本层这一格收不到，外层地址栏就不跟着换了 ——
  // `test/e2e/features/stoplight.feature` 里「点一条接口，外层地址栏那一段跟着换」那一句
  // 钉的就是这一格。版本线由 `package.json` 里那一条 `react-router-dom` 钉住，
  // 它要和 `@stoplight/elements-core` 自己声明的那一条落在同一份产物上。
  return (
    <>
      {/* Elements 那份全局样式表只挂在这一份文档上（站点的文档页压根不加载它，
          理由见上面那一条 `import`）。它是 `<link>`，不是 JS 注入，所以先于渲染出现也不影响
          判据：这一页只有 Elements 一个消费者。 */}
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
