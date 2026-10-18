import type { ReactNode } from 'react';

import PrevDocCardList from '@theme-prev/DocCardList';

/**
站点层 swizzle：链在「最后一层插件主题」之上，所以这条链在这里是四层。

`src/theme` 是层栈最外层的哨兵槽位，因此 `@theme-prev/DocCardList` = theme-c；
theme-c 里的 `@theme-prev` 又指向 theme-b…… 链路由此成立。

这一层挂在 `DocCardList` 而不是 `Logo` 上，是因为整条链只在主页出现：站点里只有
`docs/intro.md` 写了 `<DocCardList />`，正文区之外不需要再多一条链来证明同一件事。

站点层用官方 `@theme-original/DocCardList` 也一样成立（它本来就只在最外层安全，
语义零改动由 test/layers.test.mts 钉住），但统一用 `@theme-prev` 可以让每层写法完全一致。
*/
export default function SiteDocCardList(
  props: Record<string, unknown>,
): ReactNode {
  return (
    <div data-site-wrapper="src/theme">
      <span className="mark">[SITE]</span>
      <PrevDocCardList {...props} />
    </div>
  );
}
