/**
那一族视图层（`theme-markmap` / `theme-erd` / `theme-diff`）共用的一句补丁：

    .container:has(.fake) { max-width: 100% !important }

命中页的正文装在一个带 `.fake` 的 `.container` 里，这一句把**包着它的**页面容器放开，
让视图与正文铺满整栏。三条层共用同一句，所以它只住在这里。

**为什么随视图一起渲染，而不是往 `<head>` 里插一份**：补丁必须跟着这一页来、跟着这一页走。
挂在 `<head>` 上时，「同页只插一份」的守卫防不了离开页面 —— SPA 导航不重建 `<head>`，
访问过一次视图页之后，之后所有普通页的 `.container` 都会被放宽。渲染成子树里的 `<style>`
之后，命中页的 HTML 里就有它（首屏绘制前生效，不必等站点那份 css 下载解析完），
离开时随组件卸载一起消失。

选择器交给 `:has()` 限定作用域：只命中「里面有视图容器」的那几层 `.container`，
不再是一枚全站开关。浏览器基线见仓库根 `browserslist`（Chrome 105+ / Safari 15.4+ / Firefox 121+）。
*/
export const WIDTH_HACK_CSS = `
  .container:has(.fake) {
    max-width: 100% !important;
  }
`;
