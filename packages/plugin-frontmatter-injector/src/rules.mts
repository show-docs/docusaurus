import type { Scope } from './docs-scope.mts';
import type { Repo } from './git-info.mts';
import { repoPath, timesOf } from './git-info.mts';

export { RECENT_COMMITS, RECENT_WINDOW } from './git-info.mts';

const DAY = 86_400;

/** 「最近」的第一个口径：commit 落在 7 天内 */
export const RECENT_DAYS = 7;

/** 注入的那两把键 */
export const NEW_TAG = 'git-new';
export const UPDATE_TAG = 'git-update';

/** 算值那一步看得到的东西 */
export interface RuleContext {
  /** 文件绝对路径，正斜杠 */
  filePath: string;
  /** 此刻的 frontmatter */
  frontMatter: Record<string, unknown>;
  /** 打开的那个仓库；站点不在 git 里就是 `undefined` */
  repo: Repo | undefined;
  /**
   文档插件的地盘。`undefined` = 不限（不带这条判据）。地盘之外的文件不算「管得到」，
   与 `match` 不中同一条路：连算值那一步都不跑。
  */
  scope?: Scope | undefined;
}

/**
 一条注入规则：`match` 管哪些文件、`frontMatter` 给它们补哪几格。

 值写成函数时按「文件 → 值」现算，返 `undefined` 表示这份文件不表态（那一格不写）。
 键已经在了的格子根本不会被算（见 {@link applyRules}）。
*/
export interface FrontMatterRule {
  /** 只用于排查，不参与判定 */
  name: string;
  /** 文件路径（已归一成正斜杠）：字符串按后缀比，正则原样交给 `test` */
  match: RegExp | string;
  /** 要并进 frontmatter 的那几格 */
  frontMatter: Record<string, unknown | ((context: RuleContext) => unknown)>;
}

/**
 这份文件算不算「最近」：上次提交落在 {@link RECENT_DAYS} 天内，或那份文件在最后
 {@link RECENT_COMMITS} 个 commit 里出现过。

 两个口径都由 `openRepo()` 那两次 `git log` 给：`--since` 管前一条、`--max-count` 管后一条。
 走到这里说明这份文件在被读的那个窗口里出现过，所以 `head` 必然有值（`openRepo()` 最后一定
 在 `recent` 里放了东西），这也是 `!` 的依据。
*/
export function isRecent(repo: Repo, path: string, updatedAt: number): boolean {
  return repo.recent.has(path) || repo.head! - updatedAt <= RECENT_DAYS * DAY;
}

/** 这份文件要补的那几个标签：由 git 判出来的那两个；读不到历史就没有 */
export function tagsOf({ filePath, repo }: RuleContext): string[] {
  // 从空串起：这一格只交 git 判出来的那几个，页面自己写的那几条由 `applyRules` 合并进来
  const result: string[] = [];

  if (!repo) {
    return result;
  }

  const path = repoPath(repo, filePath);

  if (path === undefined) {
    return result;
  }

  const { created, updated } = timesOf(repo, filePath);

  if (updated === undefined) {
    return result;
  }

  if (created === updated && isRecent(repo, path, updated)) {
    result.push(NEW_TAG);
  }

  if (isRecent(repo, path, updated)) {
    result.push(UPDATE_TAG);
  }

  return result;
}

/**
 页面自己写的那份 `tags` 与算出来那份合起来：先去重、再排序。

 这一把键与别的键不一样 —— 别的键是「站点写过了就让位」，而标签是**并列**的：页面自己那几条
 与 `git-new` / `git-update` 说的是不同的事，谁让位都会丢信息。排序不是整洁癖：同一个标签组合
 在产物里只有一种写法，diff 与快照才稳得住，否则「页面里换一下顺序」也会被当成改动。

 写进 frontmatter 的一定是数组：页面写了 `tags: blog`（单个字符串）也照样收成 `['blog']`；
 写了别的形状（数字、对象）就原样交回 —— 那是页面的事，本插件不替它改类型。
*/
/**
逐码元比大小（`<` 比的是 UTF-16 码元），与 locale、与本机 ICU 版本都无关。

排序这一格不用 `localeCompare()`：它要问 ICU 与当前 locale，同一串标签在 Linux CI 与 Windows
上能排出两种顺序，那正好毁掉下面那句「产物里只有一种写法」。
*/
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : 1);

export function mergeTags(
  owned: unknown,
  injected: readonly string[],
): readonly string[] | unknown {
  const list = Array.isArray(owned) ? owned : [owned];

  // 相等那一格不必管：上面的 `Set` 已经把重复的并掉了，进来的两项只会是不同的串。
  return list.every((tag): tag is string => typeof tag === 'string')
    ? [...new Set([...list, ...injected])].toSorted(byCodeUnit)
    : owned;
}

/** 唯一一把「已有的与算出来的合起来」的键 */
export const MERGE_KEY = 'tags';

/** 合并前后一不一样：`next` 是并集的数组，`owned` 是页面原来那一格 */
function isSameTags(next: unknown, owned: unknown): boolean {
  if (!Array.isArray(next)) {
    return true;
  }

  const before = Array.isArray(owned) ? owned : [owned];

  return (
    before.length === next.length &&
    before.every((tag: unknown, index) => tag === next[index])
  );
}

/** 算出来的值按「一串标签」读：不是数组的当没有（规则表写错了不该顺手清空页面的标签） */
function asTags(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === 'string')
    : [];
}

/** 本仓的缺省规则表：给每一页 md/mdx 的 `tags` 补上上面那几个 */
export const defaultRules: FrontMatterRule[] = [
  {
    name: 'tags',
    match: /\.mdx?$/,
    frontMatter: { tags: tagsOf },
  },
];

/** 只有普通对象才「能往里写」：`parseFrontMatter` 是站点可插的，返回数组 / `null` 都不奇怪 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 路径归一成正斜杠：规则表只面对一种分隔符，`/\/docs\//` 这种正则才不至于在 Windows 上失灵 */
export function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

/**
 按规则表给一份 frontmatter 补值，**就地**改传进来的那个对象，返回补进去的键。

 两件不变的事与一件例外：

 - 没有的键都算「要补」，算出来是 `undefined` 就是「这份文件不表态」，那一格不写；
 - 值一律按 Promise 收：算值那一步可能要问 git，而问 git 是异步的（见 `./index.mts`）；
 - **例外是 `tags`**：它本来就是并集的语义，页面写的与 git 判的是并列的几件事，谁也不该让位。
   所以这一格当成「已有的与算出来的合起来」处理（见 {@link mergeTags}）。
   其余每个键仍是「站点写过了就让位」—— 不然规则表就成了「谁来都能改站点写过的东西」。

 键在不在用 `Object.hasOwn` 判，不用 `in`：原型链上的名字（`constructor`）不该算「这一页写过了」。
*/
export async function applyRules(
  { filePath, frontMatter, repo, scope }: RuleContext,
  rules: FrontMatterRule[],
): Promise<string[]> {
  // 地盘之外的文件连一条规则都不跑：那些文件在站点里根本不成为页面
  if (scope && !scope.covers(filePath)) {
    return [];
  }

  const injected: string[] = [];
  const context: RuleContext = { filePath, frontMatter, repo, scope };

  for (const rule of rules) {
    if (!matches(rule.match, filePath)) {
      continue;
    }

    for (const [key, make] of Object.entries(rule.frontMatter)) {
      const has = Object.hasOwn(frontMatter, key);

      // 只有可合并那把键在「已经有了」的情况下还要往下走，其余的一律让位、算值那一步也不跑
      if (has && key !== MERGE_KEY) {
        continue;
      }

      const owned: unknown = has ? frontMatter[key] : undefined;

      const value =
        typeof make === 'function' ? await (make(context) as unknown) : make;

      // 算出来是 `undefined` 就当这条规则对这份文件不表态：不写键 —— 否则 frontmatter 上会
      // 多出一格 `key: undefined`，`Object.keys` 数得着、`JSON.stringify` 又看不见
      if (value === undefined) {
        continue;
      }

      // 合并出来的与原来一模一样就不算补过：包装层靠这个判断「要不要换个对象交回去」
      const next = has ? mergeTags(owned, asTags(value)) : value;

      if (has && isSameTags(next, owned)) {
        continue;
      }

      // eslint-disable-next-line no-param-reassign -- 入参就是被 apply 的那份 frontmatter
      frontMatter[key] = next;
      injected.push(key);
    }
  }

  return injected;
}

/** 规则的地盘：字符串按后缀比，正则原样交给 `test` */
export function matches(match: RegExp | string, filePath: string): boolean {
  return match instanceof RegExp
    ? match.test(filePath)
    : filePath.endsWith(match);
}
