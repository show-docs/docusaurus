import type { ReactNode } from 'react';

import PrevDocCardList from '@theme-prev/DocCardList';

/**
theme-c：DocCardList 这根链的第三层（声明顺序最后 → 赢得 `@theme/DocCardList`）。

`@theme-prev/DocCardList` 解析为 theme-b 的实现，链路至此三层。这一层是全局赢家，
所以主页上那张卡片列表从这一层进 —— 站点没有 swizzle `DocCardList`，链尾就是 theme-a。
*/
export default function DocCardListC(
  props: Record<string, unknown>,
): ReactNode {
  return (
    <div data-theme-wrapper="theme-c">
      <span className="mark">[C]</span>
      <PrevDocCardList {...props} />
    </div>
  );
}
