import OriginalDocSidebarItemCategory from '@theme-init/DocSidebarItem/Category';

import type { ReactNode } from 'react';

import { badgeOfTree } from '../../../components/git-badge.tsx';

/**
主题层：侧边栏里分类那一行（每个包那一行），末尾挂一个「新建 / 更新」的徽标。

分类项自己的 `customProps` 取的是它**链的那一页**的 `sidebar_custom_props`
（官方 `getCategoryLinkCustomProps`）—— 站点里每个包那一行链的就是这个包的 README。
子页新建或更新过、分类那一页本身却没有时，父分类也该有个说法，所以这一格看的是整棵子树
（`badgeOfTree`，`new` 压过 `update`）。

`item` 由官方那个分发器给（`@theme/DocSidebarItem` 只在 category 项上渲染这一格），恒在。
*/
export default function DocSidebarItemCategory(
  props: Record<string, unknown>,
): ReactNode {
  const kind = badgeOfTree(props.item);

  return (
    <OriginalDocSidebarItemCategory
      {...props}
      {...(kind === undefined ? {} : { 'data-git-badge': kind })}
    />
  );
}
