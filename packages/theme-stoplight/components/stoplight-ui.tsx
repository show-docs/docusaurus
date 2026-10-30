import './stoplight-ui.css';

// 交给 `@stoplight/elements` 的那个地址，加上「选中了哪条接口」报给框外那一份文档 ——
// 这一格的形状由本包 `theme/StoplightView` 给（下面那份本地 `StoplightUIProps`）。
// 「把框里那段 `#` 报出去」那一格在 component-page 的共享源码里（`createLocationMirror`），
// 各层只交自己路由包里的 `useLocation`。
import { createLocationMirror } from '@show-docs/docusaurus-theme-component-page/lib/location-mirror.tsx';
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

import { HashRouter, useLocation } from 'react-router-dom';

// 亮暗那条属性名与它的落法住在 `stoplight-color-mode.ts`：框内那一份渲染接线也要用它，而它
// 不该因此把 Elements 拖进自己的静态依赖（这一格的理由见那份文件头）。

/** 本层渲染接线要的两格：那份文档的地址，加上「框内换了接口，报给外层」那一句。 */
export type StoplightUIProps = {
  /** 选中了哪条接口，报给框外那一份文档。 */
  onRouteChange: (hash: string) => void;
  /** 要渲染的那份文档的地址（由 `theme/StoplightView` 从这一页的 frontmatter 里挑出来）。 */
  url: string;
};

/** 包着 Elements 的那层壳，也是 `stoplight-ui.css` 那份样式的作用范围。 */
const STOPLIGHT_ROOT_CLASS = 'stoplight-root';

// 本层的 `useLocation` 来自 `react-router-dom`（Elements 内部那条线）；镜像本身是共享的那一份。
const LocationMirror = createLocationMirror(useLocation);

// `hideExport`：那条「Export / Download」入口在本仓的示例页上没有对象（文档是站点自己那份
// `static/openapi-stoplight.yaml`，导出一份再存回本地没有意义）。
// `router: 'hash'` 这一格**不再**决定用哪种路由（下面那层 `HashRouter` 才是），它喂的是
// Elements 的 `RouterTypeContext`：章节标题那颗锚点链接按它决定要不要把 `#id` 接在当前路径后面
// （`hash` 那一支会，见包里的 `LinkHeading`）。**不传 `basePath`**：命中 `outerRouter` 那一支时
// 它会被拿去做「从当前路径里剥掉前缀」那一步，而这一份文档没有前缀可剥，传了侧栏就认不出当前接口。
const shared = { hideExport: true, router: 'hash' } as const;

export function StoplightUI(props: StoplightUIProps) {
  // 服务端那一遍不在这里挡：渲染到这一格的只有框内那份文档，而它在那一份数据送达之前显示的是
  // 自己那句占位（SSR 那一遍根本没有那份数据，握手只在浏览器里跑）。
  //
  // 外面这一层 `HashRouter` 是本层的路由口径，与 `theme-redoc` 的 `RedocUI` 同一取舍：
  // `@stoplight/elements` 的 `API` 外面套着它自己的 `withRouter`，那个高阶组件按
  // `useInRouterContext()` 决定要不要自建路由 —— 给它一个，它就不自建，于是「框里换一条接口」
  // 只是这一份文档里的一次 hash 变化，整份文档不重新加载，而且外层那条能分享的地址
  // （`/stoplight-demo#/operations/createOrder`）里 hash 不参与取文件，托管侧回 200
  // —— 两边怎么对齐记在 component-page 的 `docs/iframe-protocol.md`。
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
