import PrevDocSidebarItemLink from '@theme-prev/DocSidebarItem/Link';

import type { ReactNode } from 'react';

import { badgeKindOf, badgeOf } from '../../../components/git-badge.tsx';

/**
主题层：侧边栏里文档条目那一行，末尾挂一个「新建 / 更新」的徽标。

徽标走官方那条 `sidebar_custom_props` 通道：文档插件把那一页 frontmatter 里的
`sidebar_custom_props` 抄到侧边栏项的 `customProps` 上（见
`node_modules/@docusaurus/plugin-content-docs/lib/props.js`）。种类是本包在构建期算出来的，
认种类在 `components/git-badge.tsx`，点子由 `styles/git-badge.css` 按 `data-git-badge` 画。

**为什么是属性而不是另插一个元素**：官方那份把整个 `<li>` / `<a>` 当自己的根渲染，从外面插不进
`<a>` 里面；而它把认不得的 props 原样摊到 `<a>` 上，于是 `data-git-badge` 落在那一条
`<a class="menu__link">` 上，点子交给 CSS 的伪元素 —— 不用照抄官方那一份（照抄要连它的
CSS module 一起抄，而 CSS 文件不在官方别名表里）。

`item` 由官方那个分发器给（`@theme/DocSidebarItem` 只在 link 项上渲染这一格），恒在。
*/
interface SidebarItem {
  readonly customProps?: unknown;
}

export default function DocSidebarItemLink(
  props: Record<string, unknown>,
): ReactNode {
  const item = props.item as SidebarItem;

  // 分类项在没有可见子页时会连 props 一起转交给链接那一格（官方那份
  // `DocSidebarItem/Category` 干的）：它已经算过整棵子树的种类，这里照收，
  // 不拿自己那一格（只是分类链的那一页）盖掉。
  const kind =
    badgeKindOf(props['data-git-badge']) ?? badgeOf(item.customProps);

  return (
    <PrevDocSidebarItemLink
      {...props}
      {...(kind === undefined ? {} : { 'data-git-badge': kind })}
    />
  );
}
