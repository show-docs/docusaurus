import type { ReactNode } from 'react';

import type { GitBadgeKind } from '../src/badge.mts';

/**
侧边栏徽标：「这一页是新建的还是更新过的」。

判据由本包写进 frontmatter 的 `sidebar_custom_props` 里 —— 官方唯一一条 frontmatter →
侧边栏的通道（文档插件把它原样抄到侧边栏项的 `customProps` 上，分类项拿的是它链的那一页的）。
这一格只负责把那份 props 认成徽标种类并画出来。

徽标是**纯色点**：颜色即语义（绿=新建、橙=更新），不带文字也不带链接 ——
文字会变成第二份要跟着标签表漂的文案，链接会让「页面上每一处 `/tags/` 链接都在文章末尾那一格」
那条断言失效。

类型是从构建期那份（`../src/badge.mts`）**只取类型**引进来的：那个模块读 git、真跑在
Node 里，浏览器这一半一个字都不该带它进来。
*/

/** 徽标种类在 `sidebar_custom_props` 里放在哪一格 */
const BADGE_KEY = 'gitBadge';

/**
从侧边栏项的 `customProps` 里认出徽标种类。

认不出就是没有徽标 —— 那一格不画点子，而不是画成别的颜色。
*/
export function badgeOf(customProps: unknown): GitBadgeKind | undefined {
  if (typeof customProps !== 'object' || customProps === null) {
    return undefined;
  }

  const kind = (customProps as Record<string, unknown>)[BADGE_KEY];

  return kind === 'new' || kind === 'update' ? kind : undefined;
}

/** 徽标本身：一个纯色点，没有文字，也不是链接 */
export function GitBadge({ kind }: { readonly kind: GitBadgeKind }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`git-badge git-badge--${kind}`}
      data-git-badge={kind}
    />
  );
}

/**
把标签文字换成「带徽标的样子」。

标签文字**不是字符串** = 已经带过徽标：分类项在没有可见子页时会把标签原样转交给链接那一格
（官方那份 `DocSidebarItem/Category` 干的），那一格再判一次就会画两个点。这种情形原样返回。
*/
export function labelWithBadge(
  label: ReactNode,
  kind: GitBadgeKind | undefined,
): ReactNode {
  if (kind === undefined) {
    return label;
  }

  return typeof label === 'string' ? (
    <>
      {label}
      <GitBadge kind={kind} />
    </>
  ) : (
    label
  );
}
