import type { ReactNode } from 'react';
import PrevLogo from '@theme-prev/Logo';

/**
theme-b：链式覆盖的第二层插件主题，后声明 → 赢得 `@theme/Logo`。

`@theme-prev/Logo` 解析为「紧邻下一层」= theme-a（而不是 theme-b 自己），
因此这一层也能安全包裹。任意层数同理 —— 这是 `j < i` 恒成立的直接结果，
见 ../../../../plugins/plugin-prev-layer-resolver/README.md 的「新 specifier」。
*/
export default function LogoB(props: Record<string, unknown>): ReactNode {
  return (
    <span data-theme-wrapper="theme-b">
      <span className="mark">[B]</span>
      <PrevLogo {...props} />
    </span>
  );
}
