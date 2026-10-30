// Elements 那套配色（底下是 `@stoplight/mosaic`）本身就按 `<html data-theme>` 判亮暗，暗色那些
// 变量与规则挂在 `[data-theme=dark]` 打头的选择器上；站点那个开关写的也是同一条属性 —— 同名，
// 所以本层不需要像 `theme-redoc` 那样写一个 styled-components 的中间件去改它暗色表的生效条件，
// 只要把「站点当前那一格」搬到框内那份文档的 `<html>` 上。
//
// 这一格单独一份文件，是为了让框内那一份渲染接线（`theme/StoplightView`）拿得到它却碰不到 Elements：
// 常量与 `API` 同处一室时，静态 import 一句就把那 1.8 MB 连带拉进入口 chunk（实测记在包
// `docs/internals.md` 的「首屏不下载渲染器」一节）。`theme-redoc` 的 `redoc-color-mode.ts` 是同一格。
//
// 这里只引**类型**：那条 `import type` 编译后就没了，运行时一格依赖都不多。

import type { FrameColorMode } from '@show-docs/docusaurus-theme-component-page/lib/frame-messages.ts';

/** 框内那份文档 `<html>` 上代表当前亮暗模式的那条属性。 */
export const COLOR_MODE_ATTRIBUTE = 'data-theme';

/**
把外层送来的亮暗写成上面那条属性。

`theme/StoplightView` 把它交给 component-page 的 `useFrameMode`。这条与站点自己那一条同名，
但这是**框内那份文档**（它不套站点的色模式上下文），谁送的值落谁 —— 口径见 component-page 的
`docs/iframe-protocol.md` 的「为什么不用框架的那条存储同步」一节。
*/
export function applyStoplightColorMode(mode: FrameColorMode): void {
  document.documentElement.setAttribute(COLOR_MODE_ATTRIBUTE, mode);
}
