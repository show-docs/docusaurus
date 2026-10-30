// Redoc 自带一套亮暗模式：它按**操作系统的**偏好（`matchMedia('(prefers-color-scheme: dark)')`，
// 另有它自己那份 localStorage）把 `light` / `dark` 写到 `<html>` 的类名上，它那 60 来条暗色规则
// （调色板变量、那些 `tag-*` 与 `card-*` 的配色、滚动条滑块）全挂在 `:root.dark` 开头。站点自己
// 也有亮暗开关，两处各判各的就打架 —— 实测「站点亮色 + 操作系统深色」时这一页会自己变暗。
//
// 这里只做一件事：把暗色表开头那一格换成本层自己那条属性。它的值由外层送进来（component-page
// 那条握手循环，落到这一份文档上由 `theme/RedocView` 经 `useFrameMode` 调用下面的
// `applyRedocColorMode`），于是驱动配色的只有一个来源：站点那个开关。
//
// 为什么这件事还得在**运行期**改：Redoc 的样式是 styled-components 在运行时插进 `<head>` 的，
// 构建期那一遍（PostCSS）拿不到那份文件；`StyleSheetManager` 的 `stylisPlugins` 正是
// styled-components 编译每条规则时经过的中间件链。
//
// 本层曾经在这条链上多做两件事（给裸标签选择器加 `:where(.redoc-root)` 前缀、把 `:root` 里
// 那三条真属性挪进 `.redoc-root`），为的是不让 Redoc 的样式漏到站点的壳上。现在 Redoc 整个跑在
// 框内那份文档（component-page 那条 `render: iframe` 的通用框页）里，「不漏出去」由浏览器给的
// 文档边界负责，圈定没有对象可圈了，于是删掉。口径见包 `docs/internals.md` 的「样式」一节。

import type { FrameColorMode } from '@show-docs/docusaurus-theme-component-page/lib/frame-messages.ts';

/**
框内那份文档的 `<html>` 上，代表当前亮暗模式的那条属性。

写它的是本包 `theme/RedocView`（值从外层那条消息里来，见下面 `applyRedocColorMode`），读它的是
下面那条选择器 —— 两边都在本包，但一个在 DOM 一个在 CSSOM，所以给个名字，别拼两串字面量。
为什么不借站点自己那条 `data-theme`，见 component-page 的 `docs/iframe-protocol.md`
的「为什么不用框架的那条存储同步」一节。
*/
export const COLOR_MODE_ATTRIBUTE = 'data-redoc-mode';

/**
把外层送来的亮暗写成上面那条属性。

`theme/RedocView` 把它交给 component-page 的 `useFrameMode`，于是每一次送达都只动这一条属性；
Redoc 那套暗色规则读的是它（改写后的选择器），不是自己那套按操作系统判出来的类名。
*/
export function applyRedocColorMode(mode: FrameColorMode): void {
  document.documentElement.setAttribute(COLOR_MODE_ATTRIBUTE, mode);
}

/** 这条属性在 CSS 里代表暗色的那一格，用来换掉 Redoc 自己那个 `:root.dark`。 */
const DARK_SELECTOR = `:root[${COLOR_MODE_ATTRIBUTE}="dark"]`;

/** Redoc 自己那套暗色表的开头那一格。 */
const DARK_PALETTE_PREFIX = ':root.dark';

type RuleLike = {
  type: string;
  props?: string[];
};

/**
把以 `:root.dark` 开头的那条选择器换成上面那条属性开头。

只动开头那一格，后面挂的类名（`.tag--` 那些）原样留着。按前缀切一刀而不是 `replace()`：
换进去的值是个变量，`String#replace()` 那种写法（`unicorn/no-unsafe-string-replacement`）
本来也容易被读成「整串替换」。
*/
function rehangDarkPalette(trimmed: string): string | undefined {
  if (!trimmed.startsWith(DARK_PALETTE_PREFIX)) {
    return undefined;
  }
  // 下一个字符还是单词字符或 `-`，就不是 `:root.dark` 这一格（`:root.darkness` 那种要放过）。
  const next = trimmed[DARK_PALETTE_PREFIX.length];
  return next !== undefined && /[\w-]/.test(next)
    ? undefined
    : `${DARK_SELECTOR}${trimmed.slice(DARK_PALETTE_PREFIX.length)}`;
}

/**
交给 `StyleSheetManager` 的 `stylisPlugins`。只认 `rule` 这一种元素，
其余（声明、`@keyframes`、注释）原样放过。
*/
export function followSiteColorMode(element: unknown): void {
  const rule = element as RuleLike;
  if (rule.type !== 'rule' || !Array.isArray(rule.props)) {
    return;
  }

  rule.props = rule.props.map((selector) => {
    const replaced = rehangDarkPalette(selector.trim());
    return replaced ?? selector;
  });
}
