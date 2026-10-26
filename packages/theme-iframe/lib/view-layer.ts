/**
那一族视图层（`theme-markmap` / `theme-erd` / `theme-diff`）共用的一句补丁：

    .container:not(.fake) { max-width: 100% !important }

命中页的正文装在一个带 `.fake` 的 `.container` 里，这一条把页面默认那个宽度上限放开，
让视图与正文铺满整栏。三条层共用同一句，所以它只住在这里。

**为什么是运行期插一份 `<style>`，而不是走 Docusaurus 的样式管道**：这条补丁只有在
头几帧就要生效的前提下才有意义（视图是首屏最上面那一块），走 `getClientModules()`
的样式表要等站点那份 css 下载解析完，命中页会先窄一下再变宽。
*/

const STYLE_ID = 'theme-view-layer-hack';

/**
把补丁挂到 `<head>` 上，同页只挂一份 —— 三条层命中同一页时它们各调一次。

只从 `useInsertionEffect` 里调（见 `view-layer-shell.tsx`）：那一步在 DOM 变更前执行，
补丁来得及参与首屏绘制；渲染函数里直接调用会在并发渲染下被重放或丢弃，留下重复节点。
*/
export function hackStyle(): null {
  // 浏览器之外（SSG 那一轮）没有 `<head>` 可挂，也无需补。
  if (
    typeof document !== 'undefined' &&
    !document.querySelector(`#${STYLE_ID}`)
  ) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
  .container:not(.fake) {
    max-width: 100% !important;
  }
`;
    document.head.append(style);
  }

  return null;
}
