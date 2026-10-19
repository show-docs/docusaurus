import PrevDocCardList from '@theme-prev/DocCardList';

import type { ReactNode } from 'react';

/**
theme-c：DocCardList 这根链的第三层（声明顺序最后 → 赢得 `@theme/DocCardList`）。

`@theme-prev/DocCardList` 解析为 theme-b 的实现，链路至此三层。这一层是插件主题里的赢家，
主页上那张卡片列表从这一层进；站点 `src/theme` 还用自己那层包在它上面，见 src/theme/README.md。
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
