import type { MarkdownConfig } from '@docusaurus/types';

import type { WordCountScope } from '../types/word-count.ts';

/** 官方 `markdown.preprocessor` 那一格的形状（`@docusaurus/types` 没把那个别名再导出）。 */
type MarkdownPreprocessor = NonNullable<MarkdownConfig['preprocessor']>;

/**
正文里那一行 `:::word-count`：本包唯一一处认它的地方。

它不是 remark 指令 —— Docusaurus 的 `markdown` 配置里没有给主题层留 `remarkPlugins`
（那几格按内容插件各配各的），所以主题包拿不到真正的指令解析。能零配置挂上的只有
`markdown.preprocessor`：MDX 编译前对**文件原文**跑一遍，本包就在这一步把指令换成
`<__WordCount scope="…" />`，并在文首（frontmatter 之后）补一句 `import`。

写这一行的人只关心「块出现在哪儿」：md 里任意位置写一行即可，不需要 import。

范围写在指令后面：`:::word-count page`（本页）、`folder`（本文件夹，含子目录）、
`instance`（所在内容根，缺省）、`site`（全站）。不认的范围原样留下，与不认识的行同一种落点。
*/

/** 一行 `:::word-count`（最多三格缩进：四格起是缩进代码块），不写范围时是 `instance`。 */
const DIRECTIVE = /^ {0,3}:::word-count[ \t]*$/;

/** 带范围的那几种写法；四种之外（例如拼错）不算指令。 */
const SCOPED_DIRECTIVE =
  /^ {0,3}:::word-count[ \t]+(page|folder|instance|site)[ \t]*$/;

/** 一行容器式收尾 `:::`：只有紧跟指令那一行才吃掉。 */
const CLOSER = /^ {0,3}:::[ \t]*$/;

/** 一段围栏的起点（``` 或 ~~~，至少三个）。 */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** 快路判据：绝大多数文件里没有这把指令，原样交回同一个字符串。 */
const KEYWORD = ':::word-count';

/**
指令换成的那一个组件名。带 `__` 前缀是给「这是本包生成的绑定」留一个记号：
作者自己 import 一个叫 `WordCount` 的组件也不会跟这里撞名。
*/
const COMPONENT = '__WordCount';

/** 补在文首那一句 import：`@theme/WordCount` 跟着层栈走，站点 swizzle 就换掉它。 */
const IMPORT = `import ${COMPONENT} from '@theme/WordCount';`;

/** 指令换成的那一行。范围显式写上（缺省也写成 `instance`），组件那一侧只有一条读法。 */
function replacement(scope: WordCountScope): string {
  return `<${COMPONENT} scope="${scope}" />`;
}

/** 包过的那份预处理器上留的记号，用来判「是不是已经是我」。 */
export const WRAPPED = Symbol.for('@show-docs/docusaurus-theme-word-count');

/** 一条指令在文件里的位置：`closer` 是紧跟的那一行容器式收尾（有才吃）。 */
type Directive = { index: number; closer?: number; scope: WordCountScope };

/** `split('\n')` 留下的 `\r` 要当行尾处理，否则 CRLF 文件一行都匹配不上。 */
function stripEol(line: string): { body: string; ending: string } {
  return line.endsWith('\r')
    ? { body: line.slice(0, -1), ending: '\r' }
    : { body: line, ending: '' };
}

/**
文件里所有真指令的位置。

围栏里（``` 或 ~~~）与四格缩进的代码块里那些不是指令 —— 它们是示例正文。围栏按
CommonMark 那一条认：字符相同、长度不短于开头那一串才算收尾。
*/
function scanDirectives(lines: readonly string[]): Directive[] {
  const found: Directive[] = [];
  /** 当前所在的围栏（开头那一串）；`undefined` = 不在围栏里。 */
  let fence: string | undefined;
  /** 上一条指令把这行收尾吃掉了。 */
  let swallow = false;

  for (const [index, line] of lines.entries()) {
    if (swallow) {
      swallow = false;
      continue;
    }

    const { body } = stripEol(line);

    if (fence !== undefined) {
      const closing = FENCE.exec(body)?.[1];

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

    const scope = SCOPED_DIRECTIVE.exec(body)?.[1] as
      WordCountScope | undefined;

    // 不认的范围（例如拼错）既不匹配带范围的那一条、也不匹配不带范围的那一条，原样留下。
    if (scope === undefined && !DIRECTIVE.test(body)) {
      continue;
    }

    const next = lines[index + 1];
    const hasCloser = next !== undefined && CLOSER.test(stripEol(next).body);

    found.push({
      index,
      scope: scope ?? 'instance',
      ...(hasCloser && { closer: index + 1 }),
    });
    swallow = hasCloser;
  }

  return found;
}

/**
frontmatter 之后那一行：MDX 只认文件最开头那段 `---`，import 插在它前面会把那一段
变成一条分隔线。没有 frontmatter 就插在第 0 行。
*/
function headerEnd(lines: readonly string[]): number {
  if (stripEol(lines[0]!).body !== '---') {
    return 0;
  }

  const closing = lines.findIndex(
    (line, index) => index > 0 && stripEol(line).body === '---',
  );

  return closing === -1 ? 0 : closing + 1;
}

/**
把 `:::word-count` 换成 `<__WordCount scope="…" />`，并在文首补一句 import。

没写指令的文件原样交回同一个字符串（不重排行尾、不碰别的行）；写了的文件里，
指令那一行由组件顶替，紧跟的容器式收尾 `:::` 一并吃掉。
*/
export function rewriteWordCountDirectives(fileContent: string): string {
  if (!fileContent.includes(KEYWORD)) {
    return fileContent;
  }

  const lines = fileContent.split('\n');
  const directives = scanDirectives(lines);

  if (directives.length === 0) {
    return fileContent;
  }

  const dropped = new Set<number>();

  for (const { closer, index, scope } of directives) {
    if (closer !== undefined) {
      dropped.add(closer);
    }

    const { ending } = stripEol(lines[index]!);

    lines[index] = `${replacement(scope)}${ending}`;
  }

  const output = lines.filter((_, index) => !dropped.has(index));

  // 补上去的那一行跟着文件自己的行尾走：CRLF 文件里插一行 LF 会混出两种结尾。
  output.splice(
    headerEnd(lines),
    0,
    `${IMPORT}${fileContent.includes('\r\n') ? '\r' : ''}`,
  );

  return output.join('\n');
}

/**
统计正文时用的那一份：指令（与它的收尾）是看不见的语法，不算词。

口径与改写共用同一个扫描器，围栏里那几行照旧留在正文里 —— 那是示例，看得见。
*/
export function withoutWordCountDirectives(fileContent: string): string {
  if (!fileContent.includes(KEYWORD)) {
    return fileContent;
  }

  const lines = fileContent.split('\n');
  const directives = scanDirectives(lines);

  if (directives.length === 0) {
    return fileContent;
  }

  const dropped = new Set(
    directives.flatMap(({ closer, index }) =>
      closer === undefined ? index : [index, closer],
    ),
  );

  return lines.filter((_, index) => !dropped.has(index)).join('\n');
}

/**
包装：站点自己那份预处理器先跑，本包在它的结果上认指令。

`reloadSite()` 会把插件重跑一遍，同一份预处理器套两层等于扫两次，所以带记号：
见到记号直接交回同一个函数。站点没配预处理器时也挂一份，本层才有入口。
*/
export function wrapPreprocessor(
  base: MarkdownPreprocessor | undefined,
): MarkdownPreprocessor {
  return base !== undefined && (base as { [WRAPPED]?: true })[WRAPPED] === true
    ? base
    : Object.assign(
        ({ fileContent, filePath }: Parameters<MarkdownPreprocessor>[0]) =>
          rewriteWordCountDirectives(
            base === undefined ? fileContent : base({ fileContent, filePath }),
          ),
        { [WRAPPED]: true as const },
      );
}

/** 把包装挂到站点那份 markdown 配置上；重复调用是同一份包装。 */
export function installPreprocessor(markdown: MarkdownConfig): void {
  // 主题包零配置唯一的入口就是改站点这一格：mdx-loader 在 `configureWebpack()` 里读的是同一个对象
  // eslint-disable-next-line no-param-reassign
  markdown.preprocessor = wrapPreprocessor(markdown.preprocessor);
}
