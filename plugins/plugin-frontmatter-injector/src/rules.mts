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
  /** `docusaurus.config.mjs` 在 `plugins` 里给的那一份（传给本插件的 `tags` 选项） */
  tags: readonly string[];
  /** 打开的那个仓库；站点不在 git 里就是 `undefined` */
  repo: Repo | undefined;
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

/** 这份文件要补的那几个标签：配置里那份与前缀拼起来的新造标签，外加 git 判出来的那两个 */
export function tagsOf({ filePath, tags, repo }: RuleContext): string[] {
  // 页面自己写了 `tags` 的话，这一格整格都不会被算（只补不覆盖）
  const result: string[] = [...tags];

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

 只补不覆盖：键已经在了就原样留着，算值那一步也不跑 —— 否则规则表就成了「谁来都能改站点
 写过的东西」。用 `Object.hasOwn` 而不是 `in`，原型链上的名字（`constructor`）不该算
 「这一页写过了」。

 值一律按 Promise 收：算值那一步可能要问 git，而问 git 是异步的（见 `./index.mts`）。
*/
export async function applyRules(
  { filePath, frontMatter, tags, repo }: RuleContext,
  rules: FrontMatterRule[],
): Promise<string[]> {
  const injected: string[] = [];
  const context = { filePath, frontMatter, tags, repo };

  for (const rule of rules) {
    if (!matches(rule.match, filePath)) {
      continue;
    }

    for (const [key, make] of Object.entries(rule.frontMatter)) {
      if (Object.hasOwn(frontMatter, key)) {
        continue;
      }

      const value =
        typeof make === 'function' ? await (make(context) as unknown) : make;

      // 算出来是 `undefined` 就当这条规则对这份文件不表态：不写键 —— 否则 frontmatter 上会
      // 多出一格 `key: undefined`，`Object.keys` 数得着、`JSON.stringify` 又看不见
      if (value === undefined) {
        continue;
      }

      // eslint-disable-next-line no-param-reassign -- 入参就是被 apply 的那份 frontmatter
      frontMatter[key] = value;
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
