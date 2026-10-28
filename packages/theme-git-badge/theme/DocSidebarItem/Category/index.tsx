import PrevDocSidebarItemCategory from '@theme-prev/DocSidebarItem/Category';

import type { ReactNode } from 'react';

import { badgeOf, labelWithBadge } from '../../../components/git-badge.tsx';

/**
主题层：侧边栏里分类那一行（每个包那一行），末尾挂一个「新建 / 更新」的徽标。

分类项的 `customProps` 取的是它**链的那一页**的 `sidebar_custom_props`
（官方 `getCategoryLinkCustomProps`）—— 站点里每个包那一行链的就是这个包的 README，
所以包的 README 是新建或更新过的，那一行也带得上徽标。

其余与链接那一格同源：换的是 `label`（官方把 `label` 渲染进一个 `<span>`），
认种类与画点子的形状在 `components/git-badge.tsx`。

`item` 由官方那个分发器给（`@theme/DocSidebarItem` 只在 category 项上渲染这一格），恒在。
*/
interface SidebarItem {
  readonly label?: ReactNode;
  readonly customProps?: unknown;
}

export default function DocSidebarItemCategory(
  props: Record<string, unknown>,
): ReactNode {
  const item = props.item as SidebarItem;

  return (
    <PrevDocSidebarItemCategory
      {...props}
      item={{
        ...item,
        label: labelWithBadge(item.label, badgeOf(item.customProps)),
      }}
    />
  );
}
