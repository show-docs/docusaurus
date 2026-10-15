import type { ReactNode } from 'react';
import PrevLogo from '@theme-prev/Logo';

/**
theme-a：链式覆盖的第一层插件主题。

`@theme-prev/Logo` = 「紧邻我下面那一层」的实现；theme-a 下面是 preset 的
theme-classic Logo，所以这里直接包住它。

注意用的是 `@theme-prev` 而不是 `@theme-original`：
`@theme-original` 是官方别名（恒等于 `@theme/Logo`）= 全局赢家，
在非最外层使用会指向自己 → 无限递归 / OOM，
见 ../../../../plugins/plugin-prev-layer-resolver/README.md 的「为什么另起 specifier，而不改写 @theme-original」。

props 用透传形式（`...props`）而不是显式声明，因为下层组件的 props 由
各自的主题层决定，站点 / 插件层不该假设它的形状。
*/
export default function LogoA(props: Record<string, unknown>): ReactNode {
  return (
    <span data-theme-wrapper="theme-a">
      <span className="mark">[A]</span>
      <PrevLogo {...props} />
    </span>
  );
}
