import type { LoadContext, ParseFrontMatter, Plugin } from '@docusaurus/types';

import type { DocsScope, Scope } from './docs-scope.mts';
import { createScope, docsContentPath } from './docs-scope.mts';
import type { Repo } from './git-info.mts';
import { findRepoRoot, openRepo } from './git-info.mts';
import type { FrontMatterRule } from './rules.mts';
import {
  applyRules,
  defaultRules,
  isPlainObject,
  matches,
  normalizePath,
} from './rules.mts';

export type { FrontMatterRule, RuleContext } from './rules.mts';
export type { DocsScope, Scope } from './docs-scope.mts';
export type { GitTimes, Repo } from './git-info.mts';
export {
  createScope,
  DEFAULT_INCLUDE,
  docsContentPath,
} from './docs-scope.mts';
export {
  applyRules,
  defaultRules,
  isRecent,
  mergeTags,
  NEW_TAG,
  RECENT_COMMITS,
  RECENT_DAYS,
  RECENT_WINDOW,
  tagsOf,
  UPDATE_TAG,
} from './rules.mts';
export {
  findRepoRoot,
  noTimes,
  openRepo,
  repoPath,
  timesOf,
} from './git-info.mts';

const PLUGIN_NAME = '@show-docs/docusaurus-plugin-frontmatter-injector';

/** 包过的那份解析器上留的记号，用来判「是不是已经是我」 */
export const WRAPPED = Symbol.for(PLUGIN_NAME);

export interface FrontMatterInjectorOptions {
  /** 规则表；不传用 `defaultRules`（给 md/mdx 补 `tags`），传 `[]` 等于本插件什么都不做 */
  rules?: FrontMatterRule[];
  /**
   文档插件扫哪些文件（`docs.path` / `docs.include` / `docs.exclude`）。站点把那份选项写在预设里
   时插件拿不到，只能由站点转述过来；不传 = 只管 `<siteDir>/docs` 整棵。

   地盘之外的文件一个标签都不补 —— 「页面」这个概念由文档插件定义，注入跟着它走。
  */
  docs?: DocsScope;
}

/**
 从给定目录（插件拿的是 `context.siteDir`）往上找仓库，把那个仓库读出来。**每个插件实例只读
 一次**：第一次问历史时打开，之后（含 `reloadSite()` 重跑）每个文件都在这份结果里查。

 读不到（站点不在 git 里、git 不在 PATH、仓库坏了）就返回 `undefined`，注入那边当「没有历史」
 处理 —— 不阻断构建：一份 README 少两个标签，不该比构建失败更糟。
*/
export function openRepoFrom(cwd: string): Repo | undefined {
  const root = findRepoRoot(cwd);

  if (root === undefined) {
    return undefined;
  }

  try {
    return openRepo(root);
  } catch {
    // 仓库在、但读不动：最常见的是 `git init` 之后还没有第一个提交（`git log` 以 128 退出），
    // 其次是对象库损坏。两种都按「没有历史」处理 —— 上面那条契约不能只在文档里成立。
    return undefined;
  }
}

/**
 地盘：`covers` 用的根是内容根的绝对路径。`from` 传站点根（或仓库根，两者只差一层软链），
 与 docs 插件自己算 `contentPath` 的口径一致 —— 都是「站点根 + `docs.path`」。
*/
export function scopeOf(from: string, docs: DocsScope = {}): Scope {
  return createScope(docsContentPath(from, docs), docs);
}

/**
 包装：注入叠在 `base` 的结果上，不覆盖它。

 `base` 先跑（站点自己接 CMS 的那份照旧生效）。入参形状是官方 `ParseFrontMatter` 定的
（含 `defaultParseFrontMatter`），原样透传 —— 抓闭包里那份会让「两处版本错位」变成两份
frontmatter。`reloadSite()` 会把插件重跑一遍，同一份解析器套两层等于每条规则算两次，
所以带记号：见到记号直接交回同一个函数。
*/
export function wrapParseFrontMatter(
  base: ParseFrontMatter,
  rules: FrontMatterRule[],
  repo: () => Repo | undefined,
  scope?: Scope,
): ParseFrontMatter {
  if ((base as { [WRAPPED]?: true })[WRAPPED] === true) {
    return base;
  }

  const wrapped = Object.assign(
    async (params: Parameters<ParseFrontMatter>[0]) => {
      const parsed = await base(params);
      const { frontMatter } = parsed;
      const filePath = normalizePath(params.filePath);
      // 地盘之外的文件在站点里不是页面（mdx-loader 也会路过它们），一条规则都不跑
      const hit =
        isPlainObject(frontMatter) && (scope?.covers(filePath) ?? true)
          ? rules.filter((rule) => matches(rule.match, filePath))
          : [];

      // 不是普通对象、或没有一条规则管得到这份文件：连 git 都不问，原样交回（引用也不换）
      if (hit.length === 0) {
        return parsed;
      }

      // 在拷贝上补：既不动 base 的返回值，下游按引用比较也看得见「变了」。`content` 一个字都不碰
      const next = { ...frontMatter };
      const injected = await applyRules(
        { filePath, frontMatter: next, repo: repo(), scope },
        hit,
      );

      return injected.length === 0 ? parsed : { ...parsed, frontMatter: next };
    },
    { [WRAPPED]: true as const },
  );

  return wrapped;
}

/**
 按规则给 md 注入 frontmatter，注入会走完官方那条解析路径落进编译产物。

 两件事是接线非知道不可的（取舍与证据在 `./docs/internals.md`）：

 - 换掉 `markdown.parseFrontMatter` 是唯一一条「元数据与 MDX 产物同时变」的路；
 - 一定要**包装**，不能覆盖：站点自己写的那一份可能正接在 CMS 上，吞掉它不会有任何报错。
*/
export default function frontMatterInjectorPlugin(
  context: LoadContext,
  { rules = defaultRules, docs }: FrontMatterInjectorOptions = {},
): Plugin {
  const { markdown } = context.siteConfig;
  // 地盘在构造函数里定下来就够：`docs.path` / `include` / `exclude` 是站点配置的一部分，
  // 改它们等于重启（dev 下 `reloadSite()` 会带着新配置重新实例化本插件）
  const scope = scopeOf(context.siteDir, docs);

  // 插件实例级：`reloadSite()` 重跑的是插件各阶段，那次整仓读不必跟着重来
  let cached: { repo: Repo | undefined } | undefined;

  /**
   把注入包上去，只包一次。

   时机必须是 `loadContent()`，不能晚到 `contentLoaded()`：docs 插件在它**自己的**
   `loadContent()` 里就把 `parseFrontMatter` 解构走了，之后再换属性只是换了一份没人用的。
  */
  const install = () => {
    // 空规则表 = 本插件自己关掉：连 `parseFrontMatter` 都不该被替换
    if (rules.length === 0) {
      return;
    }

    markdown.parseFrontMatter = wrapParseFrontMatter(
      markdown.parseFrontMatter,
      rules,
      () => {
        // 只读一次：第一次问历史时才走 git，之后（含 `reloadSite()` 重跑）
        // 都拿同一份结果。找仓库从**站点根**起步，不从 `process.cwd()`：`pnpm --dir`
        // 或从仓库里别的子目录起构建时，工作目录不一定是被构建的那个站点。
        cached ??= { repo: openRepoFrom(context.siteDir) };

        return cached.repo;
      },
      scope,
    );
  };

  return {
    name: PLUGIN_NAME,
    loadContent: install,
    // 插件被单独 reload（`reloadSite()`）时会重跑这一阶段
    contentLoaded: install,
  };
}
