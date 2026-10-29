import type { GitBadgeKind } from '../src/badge.mts';

/**
侧边栏徽标：「这一页是新建的还是更新过的」。

判据由本包写进 frontmatter 的 `sidebar_custom_props` 里 —— 官方唯一一条 frontmatter →
侧边栏的通道（文档插件把它原样抄到侧边栏项的 `customProps` 上，分类项拿的是它链的那一页的）。
这一格只负责把那份 props 认成徽标种类；画在 CSS 里（`styles/git-badge.css`），侧边栏那一行
只多一个 `data-git-badge` 属性，不多一个元素。

徽标是**纯色标记**：颜色即语义（绿=新建、橙=更新），叶子行画一个点、分类行把折叠箭头染成
这个颜色；都不带文字也不带链接 —— 文字是第二份要跟着语义走的文案，链接会让这枚状态标记
看起来像一处导航。

类型是从构建期那份（`../src/badge.mts`）**只取类型**引进来的：那个模块读 git、真跑在
Node 里，浏览器这一半一个字都不该带它进来。
*/

/** 徽标种类在 `sidebar_custom_props` 里放在哪一格 */
const BADGE_KEY = 'gitBadge';

/** 侧边栏项里这一层用得到的两格：自己的 props 与子项。 */
interface SidebarItemLike {
  readonly customProps?: unknown;
  readonly items?: readonly unknown[];
}

/** 把一个值认成徽标种类：`customProps` 里那一格与属性上的那一格同一套认法。 */
export function badgeKindOf(value: unknown): GitBadgeKind | undefined {
  return value === 'new' || value === 'update' ? value : undefined;
}

/**
从侧边栏项的 `customProps` 里认出徽标种类。

认不出就是没有徽标 —— 那一格不画标记，而不是画成别的颜色。
*/
export function badgeOf(customProps: unknown): GitBadgeKind | undefined {
  return typeof customProps === 'object' && customProps !== null
    ? badgeKindOf((customProps as Record<string, unknown>)[BADGE_KEY])
    : undefined;
}

/**
分类行那一格徽标：它自己与全部子页（含嵌套）里最强的那一枚。

分类项自己的 `customProps` 只是它**链的那一页**的（官方 `getCategoryLinkCustomProps`），
子页新建或更新过、分类那一页本身却没有时，父分类也该有个说法，所以这里递归看一眼。
`new` 压过 `update`：「只提交过一次且最近动过」蕴含「最近动过」，一格只有一个标记。
*/
export function badgeOfTree(item: unknown): GitBadgeKind | undefined {
  if (typeof item !== 'object' || item === null) {
    return undefined;
  }

  const node = item as SidebarItemLike;
  const own = badgeOf(node.customProps);

  if (own === 'new') {
    return own;
  }

  let kind = own;

  const children = node.items ?? [];

  for (const child of children) {
    const childKind = badgeOfTree(child);

    if (childKind === 'new') {
      return childKind;
    }

    kind = childKind ?? kind;
  }

  return kind;
}
