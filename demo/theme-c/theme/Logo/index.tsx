import type { ReactNode } from 'react';
import PrevLogo from '@theme-prev/Logo';

/**
theme-c：链式覆盖的第三层插件主题（声明顺序最后 → 赢得 `@theme/Logo`）。

`@theme-prev/Logo` 解析为 theme-b 的实现，链路至此变为三层。
*/
export default function LogoC(props: Record<string, unknown>): ReactNode {
  return (
    <span data-theme-wrapper="theme-c">
      <span className="mark">[C]</span>
      <PrevLogo {...props} />
    </span>
  );
}
