import type { WordCount } from '../types/word-count.ts';

/**
「一个词」的两种来源，各数一种：CJK 一个字算一个，其余一段连续的字母数字算一个。

**码位表是明写的**（不像 `Intl.Segmenter` 那样按语言分词）：本站同时有中日韩与拉丁文本，
而那个分词器要按 locale 选，构建机上装的 ICU 版本换了、数出来的数就会漂。宁可把「什么算一个字」
写死在这里，也不让产物里的数跟着运行环境走。

**算进来的范围由调用方定**（`./content.mts` 交进来的就是剥掉头部 frontmatter 的那一份正文）：
代码块与表格都在里面，但 markdown 自己的语法符号（`#`、`|`、反引号、链接的圆括号）不是字母数字，
一类都不算 —— 数的是词，不是字符。
*/

/**
CJK 那一族：假名（`\u{3040}-\u{30FF}`，含长音符）、汉字（`\u{3400}-\u{4DBF}` 扩展 A、
`\u{4E00}-\u{9FFF}` 基本区、`\u{F900}-\u{FAFF}` 兼容表意）、谚文音节（`\u{AC00}-\u{D7AF}`）。
标点那几段（`\u{3000}-\u{303F}`、`\u{FF00}-\u{FFEF}`）不在内：一个「。」不是一个词。

那句 `u` 不是装饰：`\u{…}` 这种码点写法只在 `u` 模式下才是码点，否则那对花括号是量词。
*/
const CJK =
  /[\u{3040}-\u{30FF}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{F900}-\u{FAFF}\u{AC00}-\u{D7AF}]/gu;

/** 其余那一族：以字母或数字开头，后面可以跟撇号与连字符（`don't`、`web-page` 各算一个）。 */
const LATIN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/**
一份文本里两类词各多少个。

`split` 的段数减一是匹配次数（无捕获组的正则才会这样算，上面两把都没有捕获组）；
拉丁那一路先按 CJK 隔开再数，见下面那一句注释。
*/
export function countWords(text: string): WordCount {
  const cjk = text.split(CJK).length - 1;
  // 汉字换成空格再数其余那一种：`\p{L}` 也认汉字，不先隔开就是同一个字被数两遍。
  const latin = text.replaceAll(CJK, ' ').matchAll(LATIN).toArray().length;

  return { cjk, latin, words: cjk + latin };
}
