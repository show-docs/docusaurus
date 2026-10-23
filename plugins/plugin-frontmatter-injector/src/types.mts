/**
核心包对外 / 对内的公共类型，单独成文件是为了让规则表、匹配、接线三处不必互相 import。
*/

/**
一条注入规则。

`match` 决定「这条规则管哪些文件」，`frontMatter` 是「管到的文件要长成什么样」——
值写成函数时按「原值 → 新值」算，于是既能补默认值，也能按文件内容改写（见 `rules.mts` 的三个成品）。
*/
export interface FrontMatterRule {
  /** 规则名，只用于告警与排查，不参与判定 */
  name: string;
  /** 文件路径（绝对路径，正斜杠）命中它才算这条规则的地盘：字符串按后缀比 */
  match: RegExp | string;
  /** 要并进 frontmatter 的那几格 */
  frontMatter: Record<string, FrontMatterValue>;
}

/**
规则里一格的值：写死一个，或按「文件 → 值」算一个。

函数版里没有「原值」这个参数：键已经在了的格子根本不会被算（见 `applyRules`），
所以规则作者不必去想「原值是 `true`、字符串、还是对象」。要按原文推值就自己去问 `context`
（`filePath` 与此刻的 frontmatter 都在里面）。返回 `undefined` 表示这条规则对这份文件不表态。
*/
export type FrontMatterValue = unknown | ((context: RuleContext) => unknown);

/** 算值那一步看得到的东西：命中哪个文件、原文里原来那几格 */
export interface RuleContext {
  /** 文件绝对路径，正斜杠 */
  filePath: string;
  /** 解析器给的那份 frontmatter（调用方已确认是普通对象） */
  frontMatter: Record<string, unknown>;
}

/**
`markdown.parseFrontMatter` 的参数与返回。

形状抄的是 `@docusaurus/types` 的 `ParseFrontMatterParams` / `ParseFrontMatterResult`，
抄而不 import 是为了让本包的纯逻辑（`inject.mts` / `wrap.mts`）不必依赖那个包：
规则表与包装层跟「谁调它」无关，只有入口接线需要 `LoadContext`。
`defaultParseFrontMatter` 那一格是官方 loader 每次调用都带上的默认实现，形状按**官方原样**抄成两支：
一支只吃 `{filePath, fileContent}`（官方 `DefaultParseFrontMatter`），一支带着它自己（`ParseFrontMatter`）。
分两支不是洁癖 —— 合成一支会让包装层与官方签名判「不可赋值」（参数是逆变的）。
*/
export interface ParseFrontMatterParams {
  /** 文件绝对路径 */
  filePath: string;
  /** 文件原文（含 frontmatter 那一段） */
  fileContent: string;
}

/** 解析结果：`frontMatter` 是元数据，`content` 是去掉 yaml 头之后的正文 */
export interface ParseFrontMatterResult {
  frontMatter: Record<string, unknown>;
  content: string;
}

/** 默认实现：只吃原文，返回解析结果（官方 `DEFAULT_PARSE_FRONT_MATTER` 就是这一支） */
export type DefaultParseFrontMatter = (
  params: ParseFrontMatterParams,
) => Promise<ParseFrontMatterResult>;

/** 解析器本体：比默认实现多带一份「默认实现」 */
export type ParseFrontMatter = (
  params: ParseFrontMatterParams & {
    defaultParseFrontMatter: DefaultParseFrontMatter;
  },
) => Promise<ParseFrontMatterResult>;

/** 极简 logger 接口，默认 console */
export interface LoggerLike {
  warn?: (...args: unknown[]) => void;
  log?: (...args: unknown[]) => void;
}

/** 一次应用的结果，给日志与测试看 */
export interface ApplyResult {
  /** 命中并真的改了格的文件 */
  changed: string[];
  /** 每个文件实际改动了哪几格（键名） */
  changes: Record<string, string[]>;
}
