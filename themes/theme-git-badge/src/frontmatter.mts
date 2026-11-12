import type { ParseFrontMatter } from '@docusaurus/types';

import type { GitBadgeKind } from './badge.mts';
import { badgeKindOf } from './badge.mts';
import type { Repo } from './git-info.mts';

/**
徽标种类在 frontmatter 里走的那条通道：**官方唯一一条 frontmatter → 侧边栏的路**。

文档插件把这一页 frontmatter 里的 `sidebar_custom_props` 原样抄到侧边栏项的
`customProps` 上（`plugin-content-docs/lib/props.js`），分类项拿的是它链的那一页的。
所以这一格是判据与画标记之间唯一的接缝。
*/
const CUSTOM_PROPS_KEY = 'sidebar_custom_props';

/** 徽标种类在那一格里放在哪一格 */
const BADGE_KEY = 'gitBadge';

/** 包过的那份解析器上留的记号，用来判「是不是已经是我」 */
export const WRAPPED = Symbol.for('@show-docs/docusaurus-theme-git-badge');

/** 只有普通对象才「能往里写」：`parseFrontMatter` 是站点可插的，返回数组 / `null` 都不奇怪 */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 路径归一成正斜杠：判据只面对一种分隔符，Windows 上才不至于失灵 */
export function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

/**
包装：徽标叠在 `base` 的结果上，不覆盖它。

`base` 先跑（站点自己接 CMS 的那份照旧生效）。入参形状是官方 `ParseFrontMatter` 定的
（含 `defaultParseFrontMatter`），原样透传 —— 抓闭包里那份会让「两处版本错位」变成两份
frontmatter。`reloadSite()` 会把插件重跑一遍，同一份解析器套两层等于算两次，
所以带记号：见到记号直接交回同一个函数。

**不分内容根**：解析器是站点全局的，这里不看文件落在哪一棵内容根里 —— 判得出种类就写
`sidebar_custom_props`，读它的只有文档插件的侧边栏。blog / pages 那些 markdown 也会被写上
这一格，但没人读；反过来，站点里任何一份 docs 实例（含 preset 里那一份）都自然覆盖到。
*/
export function wrapParseFrontMatter(
  base: ParseFrontMatter,
  repo: () => Repo | undefined,
): ParseFrontMatter {
  if ((base as { [WRAPPED]?: true })[WRAPPED] === true) {
    return base;
  }

  const wrapped = Object.assign(
    async (params: Parameters<ParseFrontMatter>[0]) => {
      const parsed = await base(params);
      const { frontMatter } = parsed;

      // 不是普通对象时连判据都不看 —— 那种 frontmatter 本来就没处写
      if (!isPlainObject(frontMatter)) {
        return parsed;
      }

      const filePath = normalizePath(params.filePath);
      const kind = badgeKindOf({ filePath, frontMatter, repo: repo() });

      // 不表态就不写这一格：否则 frontmatter 上会多出一格 `sidebar_custom_props: undefined`，
      // `Object.keys` 数得着、`JSON.stringify` 又看不见
      if (kind === undefined) {
        return parsed;
      }

      // 只往 `gitBadge` 这一子格里补，别的不碰：于是页面为别的目的（`sidebar_label` 之类）写了
      // `sidebar_custom_props` 时徽标照样上，`git_badge` 那把钉子也照常算数。
      if (!Object.hasOwn(frontMatter, CUSTOM_PROPS_KEY)) {
        return {
          ...parsed,
          frontMatter: {
            ...frontMatter,
            [CUSTOM_PROPS_KEY]: { [BADGE_KEY]: kind satisfies GitBadgeKind },
          },
        };
      }

      // 页面自己写过这一格：能并就并，两种情况仍让位 —— 那一格不是普通对象（null / 数组 / 串，
      // 并进去就得毁掉原值），或页面已经亲手写过 `gitBadge`（那是它自己的钉子，以它为准）。
      const written = frontMatter[CUSTOM_PROPS_KEY];

      if (!isPlainObject(written) || Object.hasOwn(written, BADGE_KEY)) {
        return parsed;
      }

      return {
        ...parsed,
        frontMatter: {
          ...frontMatter,
          [CUSTOM_PROPS_KEY]: { ...written, [BADGE_KEY]: kind },
        },
      };
    },
    { [WRAPPED]: true as const },
  );

  return wrapped;
}
