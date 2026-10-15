import type { ReactNode } from 'react';
import OriginalFooter from '@theme-original/DocItem/Footer';

/**
站点层 swizzle：用官方 `@theme-original/DocItem/Footer` 包住全局赢家（theme-a 的 Footer）。

这里**不是链式覆盖**：theme-a 的 Footer 并不导入 `@theme-prev`，链路到此为止。
这一格验的是另一件事 —— 官方 `@theme-original` 在最外层槽位照常可用（本插件不改它的语义）。
真正的链式覆盖（`@theme-prev` 逐层往上包）由 `src/theme/Logo` 演示。
*/
export default function DocItemFooterWrapper(
  props: Record<string, unknown>,
): ReactNode {
  return (
    <div data-site-wrapper="src/theme">
      <span className="mark">[SITE]</span>
      <OriginalFooter {...props} />
    </div>
  );
}
