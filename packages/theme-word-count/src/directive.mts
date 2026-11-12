import type { WordCountScope } from '../types/word-count.ts';

/**
`::word-count` 这一条**叶指令**的语法与扫描，本包唯一一处认它的地方。

写法是标准 remark-directive 叶指令（两个冒号、自成一体、不吞后面的正文）：

- `::word-count` —— 缺省范围 `instance`（这一页所在的内容根）；
- `::word-count{scope="page"}` / `folder` / `site` / `instance` —— 换范围；四种之外的写法整行留着当正文（作者写错了看得见）。

它和「渲染」的分工：真正把它变成组件的是 `./remark/word-count.mts` 那个 remark 插件（站点把它
挂进各内容插件的 `remarkPlugins`）—— 它在**语法树**上插 mdx 组件节点，`md` / `mdx` 两种格式都
渲染，不再往文本里塞源码。这一份只管**统计侧**：数正文之前把指令行剥掉（它不是看得见的字），
以及扫出每页写了哪些范围（决定生成模块铺不铺每页 / 每目录明细）。两侧共用下面这一把
`WORD_COUNT_SCOPES`，认的范围不会分叉。
*/

/** 指令换成的组件绑定名与它那句 import：remark 插件据此在语法树上补，见 `./remark/word-count.mts`。 */
export const COMPONENT = '__WordCount';
export const IMPORT = `import ${COMPONENT} from '@theme/WordCount';`;

/** 四种范围；带 `{scope=…}` 但值不在这一列里的，整行不当指令。 */
export const WORD_COUNT_SCOPES: ReadonlySet<WordCountScope> =
  new Set<WordCountScope>(['page', 'folder', 'instance', 'site']);

/** 快路判据：绝大多数文件里没有这把指令，原样交回同一个字符串。 */
const KEYWORD = '::word-count';

/** 一行不带范围的叶指令（最多三格缩进；四格起是缩进代码块，不是指令）。 */
const DIRECTIVE = /^ {0,3}::word-count[ \t]*$/;

/**
带范围：`::word-count{scope="x"}`。`{}` 里只认 `scope` 这一把，引号可省；值取四种之一。
四种之外（拼错、写了别的键）整行不算指令、原样留着当正文 —— 比默默按缺省数更容易让作者发现。
*/
const SCOPED_DIRECTIVE =
  /^ {0,3}::word-count\{[ \t]*scope[ \t]*=[ \t]*['"]?(page|folder|instance|site)['"]?[ \t]*\}[ \t]*$/;

/** 一段围栏的起点（``` 或 ~~~，至少三个）。 */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
一段围栏的收尾：同形，但**不带信息串** —— CommonMark 里 ```` ```js ```` 这种行是围栏内的
正文，不是收尾；拿它当收尾会把围栏提前关掉，里面的指令示例被误当成指令。
*/
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/** `split('\n')` 留下的 `\r` 要当行尾处理，否则 CRLF 文件一行都匹配不上。 */
function stripEol(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

/** 一行叶指令的位置与它的范围。 */
type Directive = { index: number; scope: WordCountScope };

/**
文件里所有真指令的位置。

围栏里（``` 或 ~~~）与四格缩进的代码块里那些不是指令 —— 它们是示例正文。围栏收尾按
CommonMark 认：字符相同、长度不短于开头那一串、且不带信息串。
*/
function scanDirectives(lines: readonly string[]): Directive[] {
  const found: Directive[] = [];
  /** 当前所在的围栏（开头那一串）；`undefined` = 不在围栏里。 */
  let fence: string | undefined;

  for (const [index, line] of lines.entries()) {
    const body = stripEol(line);

    if (fence !== undefined) {
      const closing = CLOSING_FENCE.exec(body)?.[1];

      if (
        closing !== undefined &&
        closing[0] === fence[0] &&
        closing.length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }

    const opening = FENCE.exec(body)?.[1];

    if (opening !== undefined) {
      fence = opening;
      continue;
    }

    const scoped = SCOPED_DIRECTIVE.exec(body)?.[1] as
      WordCountScope | undefined;

    // 带 scope 的按那一条判；裸行按缺省 instance。两者都不是 = 不是指令，原样留着。
    if (scoped === undefined && !DIRECTIVE.test(body)) {
      continue;
    }

    found.push({ index, scope: scoped ?? 'instance' });
  }

  return found;
}

/**
统计正文用的那一份：把指令行整行剥掉（它不是看得见的字），其余原样。

口径与范围扫描共用同一个扫描器；围栏里那几行照旧留在正文里 —— 那是示例，看得见。
*/
export function withoutWordCountDirectives(fileContent: string): string {
  if (!fileContent.includes(KEYWORD)) {
    return fileContent;
  }

  const lines = fileContent.split('\n');
  const dropped = new Set(scanDirectives(lines).map(({ index }) => index));

  return lines.filter((_, index) => !dropped.has(index)).join('\n');
}

/**
文件里那几条指令各是什么范围（没有指令就是空数组）。

统计侧用它判「这一页的明细要不要铺进浏览器」：只有写了 `page` / `folder` 的页才需要每页 /
每目录那一格，`instance` / `site` 读的是配置期合好的总数。与剥指令共用同一个扫描器、看同一份原文。
*/
export function directiveScopes(fileContent: string): WordCountScope[] {
  return fileContent.includes(KEYWORD)
    ? scanDirectives(fileContent.split('\n')).map(({ scope }) => scope)
    : [];
}
