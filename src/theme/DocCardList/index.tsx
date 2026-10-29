import PrevDocCardList from '@theme-prev/DocCardList';

import type { ReactNode } from 'react';

/**
站点层 swizzle：链在「最后一层插件主题」之上，所以这条链在这里是四层。

`src/theme` 是层栈最外层的哨兵槽位，因此 `@theme-prev/DocCardList` = theme-c；
theme-c 里的 `@theme-prev` 又指向 theme-b…… 链路由此成立。

这一层挂在 `DocCardList` 而不是 `Logo` 上，是因为整条链只在主页出现：站点里只有
`packages/README.md` 写了 `<DocCardList />`，正文区之外不需要再多一条链来证明同一件事。

`DocCardList` 在仓库里有四层提供（theme-a/b/c 与站点自己），所以这一格必须走链：`@theme-init`
只会拿到最初的官方实现、把中间三层一起跳过。`@theme-original` 在这一格虽然也等价（它只在
最外层安全，语义由 test/layers.test.mts 钉住），但真有多层覆盖的组件按规则书统一用 `@theme-prev`。
*/
export default function SiteDocCardList(
  props: Record<string, unknown>,
): ReactNode {
  return (
    <div className="layer-site" data-site-wrapper="src/theme">
      <span className="mark">[SITE]</span>
      <PrevDocCardList {...props} />
    </div>
  );
}
