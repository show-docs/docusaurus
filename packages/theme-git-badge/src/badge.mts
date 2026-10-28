import type { Repo } from './git-info.mts';
import { isRecent, repoPath, timesOf } from './git-info.mts';

/**
徽标种类：这一页是「新建」的还是「更新过的」。

徽标是**纯色标记**：颜色即语义（绿=新建、橙=更新），叶子行画一个点、分类行把折叠箭头
染成这个颜色；都不带文字也不带链接 —— 文字会变成第二份要跟着标签表漂的文案，链接会让
「页面上每一处 `/tags/` 链接都在文章末尾那一格」那条断言失效。
*/
export type GitBadgeKind = 'new' | 'update';

/**
页面自己钉住徽标的那把键：写 `git_badge: new` / `git_badge: update` 就由页面说了算，
不写就由 git 判。它**不是标签** —— 写它不会在正文里多出一颗芯片，也不进标签页。
*/
export const PINNED_BADGE_KEY = 'git_badge';

/**
git 判出来的状态与徽标的对应：**只提交过一次且最近动过**是「新建」，其余**最近动过**的是
「更新」。没进这张表的两种（不是最近、压根没有历史）都不表态。

新建蕴含更新，所以「只提交过一次且最近动过」只有一个标记（一格一个）。
*/
const BADGE_BY_STATE: Record<string, GitBadgeKind | undefined> = {
  'once/recent': 'new',
  'many/recent': 'update',
};

/**
git 判出来的那种徽标：判据是这份文件的两个时刻（`timesOf`）与「最近动过没有」
（`isRecent`）。

「最近」的两个口径都在 git 那一侧：全仓最后 5 个提交，或最近 7 天（按此刻的墙上时钟算）。

没进 git 的管辖范围、压根没有历史、或者不在这两个口径里 —— 三种都不表态。
*/
function gitBadgeKind(
  repo: Repo | undefined,
  filePath: string,
): GitBadgeKind | undefined {
  if (!repo) {
    return undefined;
  }

  const path = repoPath(repo, filePath);
  if (path === undefined) {
    return undefined;
  }

  const { created, updated } = timesOf(repo, filePath);
  if (updated === undefined) {
    return undefined;
  }

  const recent = isRecent(repo, path, updated);
  const state = `${created === updated ? 'once' : 'many'}/${
    recent ? 'recent' : 'old'
  }`;

  return BADGE_BY_STATE[state];
}

/** 算徽标时看得到的东西 */
export interface BadgeContext {
  /** 文件绝对路径，正斜杠 */
  filePath: string;
  /** 此刻的 frontmatter */
  frontMatter: Record<string, unknown>;
  /** 打开的那个仓库；站点不在 git 里就是 `undefined` */
  repo: Repo | undefined;
}

/**
这一页的徽标是哪种。

**页面自己钉了就以页面为准**（那是钉子，不是判断）：frontmatter 里写了
`git_badge: new` / `git_badge: update` 就按它来，不问 git。没写才由 git 判。

不表态时返回 `undefined` —— 那一页在侧边栏上就没有标记，而不是画成别的颜色。
*/
export function badgeKindOf({
  filePath,
  frontMatter,
  repo,
}: BadgeContext): GitBadgeKind | undefined {
  const pinned = frontMatter[PINNED_BADGE_KEY];

  return pinned === 'new' || pinned === 'update'
    ? pinned
    : gitBadgeKind(repo, filePath);
}
