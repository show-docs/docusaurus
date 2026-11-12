import type { FrameColorMode } from '@show-docs/docusaurus-theme-component-page/lib/frame-messages.ts';

/**
框内那份文档的 `<html>` 上，Redoc 自己认的那两个亮暗类名。

Redoc 3.1.0 把亮暗类名写在渲染器自己的包裹节点上（`.redoc.light` / `.redoc.dark`），
驱动它的输入就是 `<html>` 上的这一类类名 —— 它自己那份内联脚本写的也是这两格。所以本层
把站点送来的模式直接写成类名，配色交给厂商自己那套选择器（含 `:root:has(.redoc.dark)` 那条
变量上浮），不再改它的选择器：3.1.0 起它内部还套了一层 `StyleSheetManager`，会把外面的
`stylisPlugins` 顶掉，改选择器那条路已经接不上。
*/
const DARK_CLASS = 'dark';
const LIGHT_CLASS = 'light';

/**
把外层送来的亮暗写成上面那两个类名里的一个。

`theme/RedocView` 把它交给 component-page 的 `useFrameMode`，于是每一次送达都只动这一对类名；
两格互斥地写，Redoc 自己那个 MutationObserver 读到就换它包裹节点上的类。
*/
export function applyRedocColorMode(mode: FrameColorMode): void {
  const { classList } = document.documentElement;
  const dark = mode === 'dark';

  classList.toggle(DARK_CLASS, dark);
  classList.toggle(LIGHT_CLASS, !dark);
}
