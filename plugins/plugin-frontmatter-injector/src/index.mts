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

为什么钩的是 `siteConfig.markdown.parseFrontMatter`、而不是别的三条路，四种路线与四个坑的
实测记录在 `./docs/internals.md`；这里只留接线非知道不可的那两条：

- 换掉 `markdown.parseFrontMatter` 是唯一一条「元数据与 MDX 产物同时变」的路
  （`markdown.preprocessor` 拿到的是原文、又不是插件能设的；改磁盘上的 md 会让 dev 反复重编译）；
- 一定要**包装**，不能覆盖：站点自己写的那一份可能正接在 CMS 上，吞掉它不会有任何报错。
*/
export default function frontMatterInjectorPlugin(
  context: LoadContext,
  { rules = defaultRules }: FrontMatterInjectorOptions = {},
): Plugin {
  const { markdown } = context.siteConfig;

  return {
    name: '@show-docs/docusaurus-plugin-frontmatter-injector',

    // 时机放在 `contentLoaded`：插件构造函数是被 `Promise.all()` 一起起跑的，
    // 构造函数跑完只说明「都起来了」，不说明「谁接在谁后面」。这一阶段所有插件都已初始化完，
    // 在此取一次当前的 `parseFrontMatter`，别人写过的那一份才接得上（口径见 `wrap.mts`）。
    contentLoaded() {
      // 空规则表 = 本插件自己关掉：连 `parseFrontMatter` 都不该被替换，
      // 站点那份保持原样（替换了也只是多一层透传，但这层没有意义，还会让人以为配置生效了）。
      if (rules.length === 0) {
        return;
      }

      markdown.parseFrontMatter = wrapParseFrontMatter(
        markdown.parseFrontMatter,
        rules,
      );
    },
  };
}
