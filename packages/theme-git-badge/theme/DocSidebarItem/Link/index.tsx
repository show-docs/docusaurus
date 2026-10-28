import PrevDocSidebarItemLink from '@theme-prev/DocSidebarItem/Link';

import type { ReactNode } from 'react';

import { badgeOf, labelWithBadge } from '../../../components/git-badge.tsx';

/**
主题层：侧边栏里文档条目那一行，末尾挂一个「新建 / 更新」的徽标。

徽标走官方那条 `sidebar_custom_props` 通道：文档插件把那一页 frontmatter 里的
`sidebar_custom_props` 抄到侧边栏项的 `customProps` 上（见
`node_modules/@docusaurus/plugin-content-docs/lib/props.js`）。种类是本包在构建期算出来的，
认种类与画点子的形状在 `components/git-badge.tsx`。

**为什么换的是 `label` 而不是另插一个元素**：官方那份把整个 `<li>` / `<a>` 当自己的根渲染，
从外面插不进 `<a>` 里面；而 `label` 是渲染进一个 `<span>` 的，React 节点渲染得进去。
走这条路就不用照抄官方那一份 —— 照抄要连它的 CSS module 一起抄，而 CSS 文件不在官方别名表里。

`item` 由官方那个分发器给（`@theme/DocSidebarItem` 只在 link 项上渲染这一格），恒在。
*/
interface SidebarItem {
  readonly label?: ReactNode;
  readonly customProps?: unknown;
}

export default function DocSidebarItemLink(
  props: Record<string, unknown>,
): ReactNode {
  const item = props.item as SidebarItem;

  return (
    <PrevDocSidebarItemLink
      {...props}
      item={{
        ...item,
        label: labelWithBadge(item.label, badgeOf(item.customProps)),
      }}
    />
  );
}
