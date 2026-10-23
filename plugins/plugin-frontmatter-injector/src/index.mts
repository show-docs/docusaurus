import type { LoadContext, Plugin } from '@docusaurus/types';

import { defaultRules } from './rules.mts';
import type { FrontMatterRule } from './types.mts';
import { wrapParseFrontMatter } from './wrap.mts';

export type {
  ApplyResult,
  DefaultParseFrontMatter,
  FrontMatterRule,
  FrontMatterValue,
  LoggerLike,
  ParseFrontMatter,
  ParseFrontMatterParams,
  ParseFrontMatterResult,
  RuleContext,
} from './types.mts';
export {
  applyRules,
  injectFrontMatter,
  isPlainObject,
  matchesFile,
} from './inject.mts';
export { defaultRules } from './rules.mts';
export { normalizePath, wrapParseFrontMatter } from './wrap.mts';

export interface FrontMatterInjectorOptions {
  /** 规则表；不传（或传 `undefined`）用 {@link defaultRules}，传 `[]` 等于本插件什么都不做 */
  rules?: FrontMatterRule[];
}

/**
按规则给 md 注入 frontmatter，注入的东西会走完官方那条路径落进编译产物。

路线取舍（四条路、四个坑）在 `./docs/internals.md`；这里只留接线非知道不可的两条：

- 换掉 `markdown.parseFrontMatter` 是唯一一条「元数据与 MDX 产物同时变」的路
  （`markdown.preprocessor` 拿到的是原文、又不是插件能设的；改磁盘上的 md 会让 dev 反复重编译）；
- 一定要**包装**，不能覆盖：站点自己写的那一份可能正接在 CMS 上，吞掉它不会有任何报错。
*/
export default function frontMatterInjectorPlugin(
  context: LoadContext,
  { rules = defaultRules }: FrontMatterInjectorOptions = {},
): Plugin {
  const { markdown } = context.siteConfig;

  /**
  把注入包上去，只包一次。

  `reloadSite()`（dev 下改配置）会把 `loadContent()` 重跑一遍，而站点配置里那份
  `markdown` 是共享的同一个对象 —— 所以这里每次都先从**当前**那一份取 `parseFrontMatter`，
  幂等记号只负责「别套第二层」（见 `wrap.mts`）。
  */
  const install = () => {
    // 空规则表 = 本插件自己关掉：连 `parseFrontMatter` 都不该被替换，
    // 站点那份保持原样（替换了也只是多一层透传，但这层没有意义，还会让人以为配置生效了）。
    if (rules.length === 0) {
      return;
    }

    markdown.parseFrontMatter = wrapParseFrontMatter(
      markdown.parseFrontMatter,
      rules,
    );
  };

  return {
    name: '@show-docs/docusaurus-plugin-frontmatter-injector',

    // 时机必须是 `loadContent()`，不能晚到 `contentLoaded()`：后者与 docs 插件的
    // `loadContent()` 是 `Promise.all()` 里一起跑的，docs 在那边**已经**把
    // `context.siteConfig.markdown.parseFrontMatter` 解构走了（它读下来的是函数引用，
    // 之后再换属性只是换了一份没人用的），于是注入只对后跑的 mdx-loader 生效、
    // 侧边栏与 slug 那边压根看不见 —— 「配置写了却不生效」正是这么来的。
    loadContent: install,

    // 兜底：插件被单独 reload（`reloadSite()`）时只会重跑这一阶段。再包一次是幂等的
    // （记号见 `wrap.mts`），前一步跑过就交回同一个函数，不会套第二层。
    contentLoaded: install,
  };
}
