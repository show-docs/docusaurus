import type { LoadContext, ParseFrontMatter, Plugin } from '@docusaurus/types';

/** 官方 `parseFrontMatter` 的解析结果 */
type Parsed = Awaited<ReturnType<ParseFrontMatter>>;

/**
一条注入规则：`match` 管哪些文件，`frontMatter` 要给它们补哪几格。

值写成函数时按「文件 → 值」现算，返回 `undefined` 表示这份文件不表态（那一格不写）。
函数拿不到原值：键已经在了的格子根本不会被算（见 {@link applyRules}）。
*/
export interface FrontMatterRule {
  /** 只用于排查，不参与判定 */
  name: string;
  /** 文件路径（已归一成正斜杠）：字符串按后缀比，正则原样交给 `test` */
  match: RegExp | string;
  /** 要并进 frontmatter 的那几格 */
  frontMatter: Record<string, unknown | ((context: RuleContext) => unknown)>;
}

/** 算值那一步看得到的东西 */
export interface RuleContext {
  /** 文件绝对路径，正斜杠 */
  filePath: string;
  /** 解析器给的那份 frontmatter */
  frontMatter: Parsed['frontMatter'];
}

const PLUGIN_NAME = '@show-docs/docusaurus-plugin-frontmatter-injector';

/** 包过的那份解析器上留的记号，用来判「是不是已经是我」 */
const WRAPPED = Symbol.for(PLUGIN_NAME);

export const defaultRules: FrontMatterRule[] = [
  {
    name: 'testing',
    match: '.md',
    frontMatter: { testing: true },
  },
];

/** 只有普通对象才「能往里写」：`parseFrontMatter` 是站点可插的，返回数组/`null` 都不奇怪 */
function isPlainObject(value: unknown): value is Parsed['frontMatter'] {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 路径归一成正斜杠：规则表只面对一种分隔符，`/\/docs\//` 这种正则才不至于在 Windows 上失灵 */
function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

/**
按规则表给一份 frontmatter 补值，**就地**改传进来的那个对象。

只补不覆盖：键已经在了就原样留着，算值那一步也不跑 —— 否则规则表就成了「谁来都能改
站点写过的东西」。用 `Object.hasOwn` 而不是 `in`，原型链上的名字（`constructor`）不该
算「这一页写过了」。
*/
export function applyRules(
  { filePath, frontMatter }: RuleContext,
  rules: FrontMatterRule[],
): void {
  for (const rule of rules) {
    const hit =
      rule.match instanceof RegExp
        ? rule.match.test(filePath)
        : filePath.endsWith(rule.match);

    if (!hit) {
      continue;
    }

    for (const [key, make] of Object.entries(rule.frontMatter)) {
      if (Object.hasOwn(frontMatter, key)) {
        continue;
      }

      const value =
        typeof make === 'function' ? make({ filePath, frontMatter }) : make;

      // 算出来是 `undefined` 就当这条规则对这份文件不表态：不写键 ——
      // 否则 frontmatter 上会多出一格 `key: undefined`，`Object.keys` 数得着、
      // `JSON.stringify` 又看不见，最难查的那类。
      if (value === undefined) {
        continue;
      }

      // eslint-disable-next-line no-param-reassign -- 入参就是被 apply 的那份 frontmatter
      frontMatter[key] = value;
    }
  }
}

/**
把注入套在 `base` 外面，返回一个新函数。

**包装，不是覆盖**：`base` 先跑（站点自己接 CMS 的那份照旧生效），注入叠在它的结果上。
**参数原样透传**：入参的形状是官方 `ParseFrontMatter` 定的（含 `defaultParseFrontMatter`），
不去碰它、也不抓闭包里那份 —— 抓了会让「两处版本错位」变成两份 frontmatter。
**不看结果长什么样**：写进去的值合不合规矩是消费方 schema 的事（见 README「使用约束」）。

`reloadSite()` 会把插件重跑一遍，同一份解析器套两层意味着每条规则被算两次，所以带记号：
见到记号直接交回同一个函数。
*/
export function wrapParseFrontMatter(
  base: ParseFrontMatter,
  rules: FrontMatterRule[],
): ParseFrontMatter {
  if ((base as { [WRAPPED]?: true })[WRAPPED] === true) {
    return base;
  }

  const wrapped: ParseFrontMatter = async (params) => {
    const parsed = await base(params);
    const { frontMatter } = parsed;

    // 不是普通对象时原样交回：那种时候往里写不是「注入」，是把别人的返回值改坏
    if (!isPlainObject(frontMatter)) {
      return parsed;
    }

    // 在拷贝上补：既不动 base 的返回值，下游按引用比较也看得见「变了」。`content` 一个字
    // 都不碰 —— 注入的是元数据，正文是用户写的页面。
    const next = { ...frontMatter };

    applyRules(
      { filePath: normalizePath(params.filePath), frontMatter: next },
      rules,
    );

    return { ...parsed, frontMatter: next };
  };

  return Object.assign(wrapped, { [WRAPPED]: true as const });
}

export interface FrontMatterInjectorOptions {
  /** 规则表；不传用 {@link defaultRules}，传 `[]` 等于本插件什么都不做 */
  rules?: FrontMatterRule[];
}

/**
按规则给 md 注入 frontmatter，注入会走完官方那条解析路径落进编译产物。

两件事是接线非知道不可的（取舍与证据在 `./docs/internals.md`）：

- 换掉 `markdown.parseFrontMatter` 是唯一一条「元数据与 MDX 产物同时变」的路；
- 一定要**包装**，不能覆盖：站点自己写的那一份可能正接在 CMS 上，吞掉它不会有任何报错。
*/
export default function frontMatterInjectorPlugin(
  context: LoadContext,
  { rules = defaultRules }: FrontMatterInjectorOptions = {},
): Plugin {
  const { markdown } = context.siteConfig;

  /**
  把注入包上去，只包一次。

  时机必须是 `loadContent()`，不能晚到 `contentLoaded()`：docs 插件在它**自己的**
  `loadContent()` 里就把 `parseFrontMatter` 解构走了，之后再换属性只是换了一份没人用的。
  `reloadSite()` 兜底会重跑这一阶段，幂等记号在 `wrapParseFrontMatter` 里。

  赋值不做类型体操：`markdown` 是本站点配置那一份，`parseFrontMatter` 就是官方的
  `ParseFrontMatter`（校验期 Joi `default()` 已经把它填成函数）。
  */
  const install = () => {
    // 空规则表 = 本插件自己关掉：连 `parseFrontMatter` 都不该被替换
    if (rules.length === 0) {
      return;
    }

    markdown.parseFrontMatter = wrapParseFrontMatter(
      markdown.parseFrontMatter,
      rules,
    );
  };

  return {
    name: PLUGIN_NAME,
    loadContent: install,
    // 插件被单独 reload（`reloadSite()`）时会重跑这一阶段
    contentLoaded: install,
  };
}
