// Elements 那套配色（底下是 `@stoplight/mosaic`）本身就按 `<html data-theme>` 判亮暗，暗色那些
// 变量与规则挂在 `[data-theme=dark]` 打头的选择器上；站点那个开关写的也是同一条属性 —— 同名，
// 所以本层不需要像 `theme-redoc` 那样写一个 styled-components 的中间件去改它暗色表的生效条件，
// 只要把「站点当前那一格」搬到框内那份文档的 `<html>` 上。
//
// 这一格单独一份文件，是为了让框内那条页面（`theme/StoplightPage`）拿得到属性名却碰不到 Elements：
// 常量与 `API` 同处一室时，静态 import 一句就把那 1.8 MB 连带拉进入口 chunk（实测记在包
// `docs/internals.md` 的「首屏不下载渲染器」一节）。`theme-redoc` 的 `redoc-color-mode.ts` 是同一格。

/** 框内那份文档 `<html>` 上代表当前亮暗模式的那条属性。 */
export const COLOR_MODE_ATTRIBUTE = 'data-theme';
