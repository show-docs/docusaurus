import type {
  ApplyResult,
  FrontMatterRule,
  ParseFrontMatterResult,
  RuleContext,
} from './types.mts';

/**
这样一份 frontmatter 才算「能往里写」：普通对象。

`parseFileContentFrontMatter()` 交回来的就是普通对象，但 `markdown.parseFrontMatter`
是站点可插的，谁都能接在后面 —— 接一个返回 `undefined` 的、返回数组的都不奇怪。
判型放在这里，省得下游每处各写一遍，也免得 `Object.assign` 对着 `undefined` 抛。
*/
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
`filePath` 命中 `match` 了吗。

字符串按后缀比，且**串本身就是整段**：`'.md'` 命中 `a/b.md`，但不命中 `a/b.md.bak`。
这条口径看着窄，是为了让规则表写起来不会意外扫到预览文件那类东西（`x.md.orig`）。
*/
export function matchesFile(filePath: string, match: RegExp | string): boolean {
  return match instanceof RegExp
    ? match.test(filePath)
    : filePath.endsWith(match);
}

/**
按规则表给一份 frontmatter 补值，**就地**改传进来的那个对象。

只补不覆盖：某个键已经在了就原样留着，算值那一步也不会被调用 —— 否则「规则表」会变成
「谁来都能改站点写过的东西」，调一次规则就把一页的 `title` 换掉，没有哪个调用方想要。
算出来是 `undefined` 的那一格也不写，规则作者可以用它表示「这份文件我不表态」。

要一份新的、不动入参的结果，用 {@link injectFrontMatter}。
*/
export function applyRules(
  { filePath, frontMatter }: RuleContext,
  rules: FrontMatterRule[],
): ApplyResult {
  const touched: string[] = [];

  for (const rule of rules) {
    if (!matchesFile(filePath, rule.match)) {
      continue;
    }

    for (const [key, make] of Object.entries(rule.frontMatter)) {
      // 用 `Object.hasOwn` 而不是 `in`：原型链上的名字（`constructor` 这种）不该算
      // 「这一页写过了」，否则 `constructor: 'x'` 这条规则永远补不上。
      // 而 `key: undefined` 算「已经有了」—— 那是一个值，不是缺席。
      if (Object.hasOwn(frontMatter, key)) {
        continue;
      }

      const value =
        typeof make === 'function' ? make({ filePath, frontMatter }) : make;

      // 算出来是 `undefined` 就当这条规则对这份文件不表态：不写键，也不计入改动 ——
      // 否则 frontmatter 上会多出一格 `key: undefined`，下游 `Object.keys` 数得着、
      // `JSON.stringify` 又看不见，最难查的那类。
      if (value === undefined) {
        continue;
      }

      // 就地改调用方给的那份：这个函数的名字就叫 apply，改的正是它的入参。
      // eslint-disable-next-line no-param-reassign -- 入参就是被 apply 的那份 frontmatter
      frontMatter[key] = value;
      touched.push(key);
    }
  }

  return touched.length > 0
    ? { changed: [filePath], changes: { [filePath]: touched } }
    : { changed: [], changes: {} };
}

/**
套在一次解析结果上：`frontMatter` 是新的，`content` 原样交回。

`content` 一个字都不碰 —— 注入的是元数据，正文是原文，改它等于悄悄改掉用户写的页面。
`frontMatter` 不是普通对象时整个结果原样交回：那种时候往里写不是「注入」，是把别人的返回值改坏。
*/
export function injectFrontMatter(
  parsed: ParseFrontMatterResult,
  { filePath, rules }: { filePath: string; rules: FrontMatterRule[] },
): ParseFrontMatterResult {
  if (!isPlainObject(parsed.frontMatter)) {
    return parsed;
  }

  const frontMatter = { ...parsed.frontMatter };
  const { changed } = applyRules({ filePath, frontMatter }, rules);

  return changed.length > 0 ? { content: parsed.content, frontMatter } : parsed;
}
