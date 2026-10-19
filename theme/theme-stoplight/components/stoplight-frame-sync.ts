/**
外层文档页与框内那一页之间的约定：地址怎么拼、那三条消息用哪一份。

消息的形状、来源校验、两侧的监听都住在 [`@show-docs/theme-frame-kit`](../../frame-kit)
（`theme-redoc` 用的是同一份），这里只留下**本层专属的那三个名字**：Elements 的命名空间、
框内那条路由的路径、spec 地址那一条查询参数名。命名空间由包名给出，两条层各用各的，
所以同一站点上 Redoc 与 Elements 两份文档同时挂着也不会认到对方的消息。

`src/index.mts` 里注册路由用的是同一个路径名，两处各写一份常量 —— 两边站在编译边界的两侧
（`src/` 经 tsc 进 `dist/`，`components/` 是源码、由用本包的站点编译），共享不了，改要一起改。
*/

import {
  createFrameMessages,
  frameViewSrc,
  specUrlFromSearch,
} from '@show-docs/theme-frame-kit';

/** 框内那一页的路径名（不带 `baseUrl`），与 `src/index.mts` 里注册的那一条同值。 */
export const STOPLIGHT_VIEW_ROUTE = 'stoplight-view';

/** iframe 地址里带 spec 地址的那一条查询参数名。 */
export const STOPLIGHT_SPEC_PARAM = 'src';

/** 外层那个 iframe 的类名：本包外层的版式规则都挂在它上面（比裸 `iframe` 收得多）。 */
export const STOPLIGHT_FRAME_CLASS = 'stoplight-frame';

/** 本层那一份消息约定：三条 `type` 都带包名做前缀。 */
export const stoplightFrameMessages = createFrameMessages(
  '@show-docs/docusaurus-theme-stoplight',
);

/**
拼框内那一页的地址。

`specUrl` 编码进去，`hash` **不**放进去：iframe 的 `src` 因此只跟 frontmatter 走，服务端与
客户端算出的完全一样。深链那一段与亮暗模式都靠消息送，两侧的推法记在共享层
`useOuterFrameSync` 那份注释里（与 `theme-redoc` 的「深链」一节同一口径）。
*/
export function stoplightViewSrc(baseUrl: string, specUrl: string): string {
  return frameViewSrc({
    baseUrl,
    route: STOPLIGHT_VIEW_ROUTE,
    specParam: STOPLIGHT_SPEC_PARAM,
    specUrl,
  });
}

/** 从框内那一页的地址里取出要渲染的 spec 地址（只认 http(s)，见共享层那份注释）。 */
export function stoplightSpecUrlFromSearch(
  search: string,
  base: string,
): string | undefined {
  return specUrlFromSearch(search, base, STOPLIGHT_SPEC_PARAM);
}
