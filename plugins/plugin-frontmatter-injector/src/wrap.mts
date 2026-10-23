import { injectFrontMatter } from './inject.mts';
import type { FrontMatterRule, ParseFrontMatter } from './types.mts';

/** 包装过的那一个解析器上留的记号，用来判「是不是已经是我」 */
const WRAPPED = Symbol.for('@show-docs/docusaurus-plugin-frontmatter-injector');

/** 带记号的解析器：`wrapParseFrontMatter` 交出去的就是它 */
export interface WrappedParseFrontMatter extends ParseFrontMatter {
  /** 恒 `true`，只用来认亲 */
  [WRAPPED]: true;
}

/** 判「这份解析器是不是已经包过了」，不碰它的签名 */
function isWrapped(parse: ParseFrontMatter): parse is WrappedParseFrontMatter {
  return (parse as Partial<WrappedParseFrontMatter>)[WRAPPED] === true;
}

/**
把注入套在 `base` 外面，返回一个新函数。

**包装，不是覆盖**：`base` 先跑，注入在它的结果上叠一格。于是站点自己在
`markdown.parseFrontMatter` 里写的那一份（接 CMS、改写 slug 之类）照旧生效 ——
反过来说，任何「直接替换 `siteConfig.markdown.parseFrontMatter`」的插件都会把别人那一份吞掉，
这也正是本插件在 `contentLoaded` 里再取一次当前值的原因（见 `index.mts`）。

**参数原样透传**，不去碰 `defaultParseFrontMatter`：调用方带进来的那份默认实现是给 `base`
用的底，包装层只负责在 `base` 的结果上叠一格。抓闭包里那份、或者在这里替它兜一个默认值，
都会让「两处版本错位」变成两份不同的 frontmatter —— 前端一份、侧边栏一份，查起来极贵。
*/
export function wrapParseFrontMatter(
  base: ParseFrontMatter,
  rules: FrontMatterRule[],
): ParseFrontMatter {
  // 已经有记号就不再套一层：`reloadSite()` 会把插件重跑一遍，同一份解析器被套两次
  // 意味着每条规则被算两次（对补默认值无害，对「按原值改写」那类规则就不是了）。
  if (isWrapped(base)) {
    return base;
  }

  const wrapped: ParseFrontMatter = async (params) => {
    const parsed = await base(params);

    return injectFrontMatter(parsed, {
      filePath: normalizePath(params.filePath),
      rules,
    });
  };

  return Object.assign(wrapped, { [WRAPPED]: true as const });
}

/**
路径归一成正斜杠。

规则表的 `match` 里写的是 `'.md'` 这种后缀，`'.md'` 在 Windows 上也命中；但写成
`/\/docs\//` 那种正则的人不会想到另一套分隔符，所以在比较之前统一一次，规则表只面对一种写法。
*/
export function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}
