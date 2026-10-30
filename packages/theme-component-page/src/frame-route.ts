/**
通用框内那条独立页面的地址。

这里是**数据**，纯串 + 纯函数、不引 Node 也不引 React：配置期（`./index.mts` 拿它
`addRoute`）与浏览器期（`../theme/ComponentFrame` 拿它算那个 `<iframe>` 的 `src`）读的是同一份
源码，那条地址因此在注册与请求两侧不会各写一遍。浏览器侧的转出口在 `../lib/frame-route.ts`
（为什么数据住在 `src/`、浏览器却从 `lib/` 引，记在那一份头上）。

一条路由服务整族：`render: 'iframe'` 的规则都渲染在这一份文档里，框里渲染哪个组件由外层送进
来的登记名决定（见 `../lib/frame-messages.ts`），所以各包不再自带 `/xxx-view`。
*/

/** 那条路由的路径名（不带 `baseUrl`，也不带开头那条斜杠）。 */
export const COMPONENT_FRAME_ROUTE = '__component-frame';

/**
那条路由在站点里的完整路径：`baseUrl` 末尾那条斜杠只留一格。

官方 `addRoute` 的 `path` 要的是**含 `baseUrl`** 的绝对路径，而浏览器侧拼 `src` 走的是
`lib/frame-url.ts` 里那条（`baseUrl` + 路径名 + 尾斜杠口径）—— 两格形状不同，所以这里只出
配置期那一份，路径名本身两边共用上面那个常量。
*/
export function componentFrameRoutePath(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${COMPONENT_FRAME_ROUTE}`;
}
