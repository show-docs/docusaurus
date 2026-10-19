import PrevDocCardList from '@theme-prev/DocCardList';

import type { ReactNode } from 'react';

/**
theme-a：DocCardList 这根链的第一层（`@theme-prev/DocCardList` = 下面那层 theme-classic）。

这条链只会在**主页**出现：站点里只有 `docs/intro.md` 写了 `<DocCardList />`，别的页面根本不
渲染这个组件，所以「只在 intro 页验证」不需要按页面 id 分支的代码。

`items` 是可省的 —— 不传时官方那层自己取「本页在侧边栏里的兄弟项」，本层把它原样透传下去。
*/
export default function DocCardListA(
  props: Record<string, unknown>,
): ReactNode {
  return (
    <div data-theme-wrapper="theme-a">
      <span className="mark">[A]</span>
      <PrevDocCardList {...props} />
    </div>
  );
}
