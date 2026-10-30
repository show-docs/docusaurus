import type { FrameColorMode } from '@show-docs/docusaurus-theme-component-page/lib/frame-messages.ts';

// Scalar 自带一套亮暗模式：它按 `localStorage` 里的 `colorMode` → 配置里的 `darkMode` →
// 操作系统偏好那三条依次判一次，把结果落成 `<body>` 上的**两个类名**（`dark-mode` /
// `light-mode`），它那份调色板（`@scalar/themes` 里每个主题都发一对）就挂在这两个类名下面。
// 站点自己也有亮暗开关（外层 `<html data-theme>`），两处各判各的就打架 —— 与 theme-redoc
// 当初「站点亮色 + 操作系统深色」时那一页自己变暗是同一类事。
//
// 这里只做一件事：让**站点**成为唯一的驱动。挂载那一刻先按这一份文档自己的 `<html data-theme>`
// 交给 Scalar 一个明确的布尔（不给 `undefined`，否则它退到操作系统那一格）；之后外层随那条
// postMessage 通道送进来的值一到，就把这两个类名换一遍。
//
// 为什么换类名这件事归本层、不进共享层：另外两层都按**属性**判亮暗，只有 Scalar 用两个互斥的
// 类名。类名由 `@scalar/themes` 那一份 CSS 定义，是它对外的口径，不是私有实现细节。

/** Scalar 那两个类名：`@scalar/themes` 每一张调色板都按这两个类各发一组变量。 */
const MODE_CLASS: Record<FrameColorMode, string> = {
  light: 'light-mode',
  dark: 'dark-mode',
};

/**
把这一份文档 `<body>` 上的亮暗类名换成外层送进来的那一格。

两个都 `toggle`（不是只加要的那一个），所以永远不会同时挂着一个 `dark-mode` 一个
`light-mode` —— 与 Scalar 自己那一格（`applyColorMode`）的做法一致。
*/
export function applyScalarColorMode(mode: FrameColorMode): void {
  document.body.classList.toggle(MODE_CLASS.dark, mode === 'dark');
  document.body.classList.toggle(MODE_CLASS.light, mode === 'light');
}

/**
挂载那一刻读到的亮暗（`darkMode` 那一条配置要的是布尔）。

读的是**本份文档**自己 `<html data-theme>` 上那条：框内这一页同样是站点编译出来的一份文档，
Docusaurus 的内联脚本在 hydration 之前就按同源的那份 `localStorage` 把它写好了，所以这不是去读
外层那份文档的 DOM（跨文档读属性会把两份文档绑死），而是同一份配置在这一页上的落点。
它只用这一次，之后没人维护 —— 运行时那一格由外层送进来。
*/
export function isDarkColorModeAtLoad(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}
