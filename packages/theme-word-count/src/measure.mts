import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { escapeMarkdownHeadingIds } from '@docusaurus/utils';

import type { WordCount, WordCountScope } from '../types/word-count.ts';

import { EMPTY } from './aggregate.mts';
import { walkAst } from './ast.mts';
import { countWords } from './count.mts';
import { WORD_COUNT_SCOPES } from './directive.mts';
import type { MarkdownFormat } from './format.mts';

/**
一页的明细：把正文解析成语法树，按节点类型各数一遍。

**为什么读语法树**：标题、代码围栏、表格、链接这些结构只在树上有形状；拿正则扫原文，围栏
里的一行 `# 不是标题` 会被当成标题，链接地址里的字母又会被当成词。站点的文档本来就要按 MDX
编译，这里用同一族解析器（remark + MDX + GFM + frontmatter）读一遍，判据与渲染那一侧同源。

**数的是哪几段**：`text` 与 `inlineCode` 算词也算字符；`code` 算词、算字符、另外记段与行数；
frontmatter 只在 `frontmatter` 那一行报数量，正文一个字都不进（它本来就不是正文）。
链接地址、JSX 属性、`import` 行都不是 `text`，所以不进词数 —— 这是与「按原文正则扫」的差别，
在 README 的「计数口径」里写明。
*/

/** 图表围栏的语言名：这两族算「描述性图表」，不算代码段。 */
const GRAPH_LANGS = new Set(['mermaid', 'kroki']);

/**
一棵语法树里本包看得懂的那几格。

不引 `mdast` 的类型：本包只在内部走树，交出去的是 `WordCount`；为几个字段再引一份类型包，
产物里就多一个别人也得装的依赖。字段都按 remark 的标准形状取，`!` 是对「这一种节点必有这一格」
的断言（`text` 必有 `value`、`link` 必有 `url`、`heading` 必有 `children`）。
*/
type Node = {
  type: string;
  value?: string;
  lang?: string | null;
  url?: string;
  depth?: number;
  name?: string;
  attributes?: Record<string, string | null>;
  children?: readonly Node[];
};

/** 标题分级那一格：`h1` 到 `h6`，按 `depth` 查，避免每个分支抄一次。 */
const HEADINGS: Record<number, keyof WordCount> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

/**
两条解析流水线，只建一次：每份文件都新建一条流，白白多一层开销。

站点按 `markdown.format` / 页面 `format` 用哪条编译，这里就用哪条数 —— 判据与渲染同源，
连指令也一起挂 `remark-directive`：`::word-count` 在语法树上就是 `leafDirective`（不是 `text`），
于是「指令不算词」不再是自己数出来的正则，而是和渲染同一份解析给的结构。

- `mdx`：挂 `remarkMdx`，`{…}` 成 `mdxTextExpression`、`<Tag>` 成 `mdxJsx…`、`import` 成
  `mdxjsEsm`，都不是 `text`，不进词数。
- `md`：不挂 `remarkMdx`，退成 CommonMark —— 同一份 `{…}` 是文字、`<Tag>` 是 `html`，与站点
  按 md 编译那一遍同形。
*/
const mdxParser = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .use(remarkDirective)
  .use(remarkFrontmatter)
  .use(remarkGfm);

const mdParser = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkFrontmatter)
  .use(remarkGfm);

/* eslint-disable no-param-reassign -- 走树时把同一份计数往下传就是这一层的算法：每个节点只加自己
那一格，逐层返回新对象等于每个节点复制一次这 22 个字段。 */
/** 文字与行内代码：两把尺都加；`value` 是这一段的原文。 */
function addText(counts: WordCount, value: string): void {
  const { cjk, latin, words } = countWords(value);

  counts.cjk += cjk;
  counts.latin += latin;
  counts.words += words;
  counts.characters += value.length;
}

/**
标题末尾显式写的 id。站点上两种写法都在用：

- 经典写法 `## 标题 {#custom-id}`：MDX 解析器不认裸的 `{#…}`（会报「Could not parse
  expression with acorn」），Docusaurus 的预处理器先用 `escapeMarkdownHeadingIds` 把它转成
  `\{#…}`，解析回来后这个文字节点的 `value` 又是不带反斜杠的 `{#custom-id}`。下面
  `measureMarkdown` 用的就是同一句转义，所以这里按转义后的形状认。
- MDX 注释写法：一个 `{/*` 开头、星号加斜杠收尾的注释里写 `#custom-id`，解析成一格
  `mdxTextExpression`，`value` 是注释体那一串（`/* #custom-id` 再加上收尾的星号与斜杠）。

只认最后一个子节点（`{#…}` 一定在标题末尾），所以标题以行内代码收尾时那些格子里的 `{#…}`
不算 —— 与 Docusaurus 那一侧的判据同形。
*/
function hasExplicitId(node: Node): boolean {
  // 空标题（`## `）是合法 markdown：children 是空数组，没有最后一个子节点
  const last = node.children!.at(-1);

  if (last === undefined) {
    return false;
  }

  return last.type === 'text'
    ? /\s*\{#[^}]+\}$/.test(last.value!)
    : last.type === 'mdxTextExpression' &&
        /^\/\*\s*#\S+\s*\*\/$/.test(last.value!);
}

/** 按节点类型数这一格；逐节点的走树交给 `./ast.mts` 的 `walkAst`。`scopes` 顺带记下这一页写了哪些指令范围。 */
function countNode(
  node: Node,
  counts: WordCount,
  scopes: WordCountScope[],
): void {
  switch (node.type) {
    case 'leafDirective':
    case 'containerDirective':
    case 'textDirective': {
      // `::word-count` 在语法树里是 directive 节点，不是 `text` → 天然不进词数；这里只记下它的范围。
      // scope 不在四种里（含没写）按缺省 instance —— 与渲染侧同一条规则，不再刻意分叉。
      if (node.name === 'word-count') {
        const raw = node.attributes?.scope;
        scopes.push(
          raw !== undefined && WORD_COUNT_SCOPES.has(raw as WordCountScope)
            ? (raw as WordCountScope)
            : 'instance',
        );
      }
      break;
    }
    case 'text':
    case 'inlineCode': {
      addText(counts, node.value!);
      break;
    }
    case 'code': {
      addText(counts, node.value!);

      const lang = node.lang ?? '';

      if (GRAPH_LANGS.has(lang)) {
        counts.graphs += 1;
      } else {
        counts.codeBlocks += 1;
        counts.codeLines += node.value!.split('\n').length;
      }
      break;
    }
    case 'yaml': {
      // frontmatter：报数量，但那一段不是正文，词与字符都不加
      counts.frontmatter += 1;
      break;
    }
    case 'heading': {
      counts[HEADINGS[node.depth!]!] += 1;

      if (hasExplicitId(node)) {
        counts.headingIds += 1;
      }
      break;
    }
    case 'table': {
      counts.tables += 1;
      break;
    }
    case 'image': {
      counts.images += 1;
      break;
    }
    case 'link': {
      if (/^https?:/i.test(node.url!)) {
        counts.externalLinks += 1;
      } else {
        counts.internalLinks += 1;
      }
      break;
    }
    case 'linkReference': {
      // 引用式链接的目标写在别处；不顺着定义表再解一次，按内部链接记（与参考实现同口径）
      counts.internalLinks += 1;
      break;
    }
    case 'blockquote': {
      counts.blockquotes += 1;
      break;
    }
    default: {
      break;
    }
  }
}
/* eslint-enable no-param-reassign */

/**
一份文件的全部明细。

`content` 是这一页的**原文**（frontmatter 还在，`yaml` 那一格由树上报；`::word-count` 是指令节点，
不进词数）；`draft` 来自站点那份 frontmatter 解析器的结果，明细里单独记一格；`format` 是这一页按哪一族语法
编译（`md` / `mdx`，判法见 `./format.mts`）—— `md` 走 CommonMark、`mdx` 挂 `remarkMdx`，两条流水线
的差别只在 `{…}` / `<Tag>` / `import` 成不成 `text`。

解析前先走一句 `escapeMarkdownHeadingIds`：MDX 把标题末尾的 `{#id}` 当表达式，不转义会当场解析
失败，站点交 MDX 时预处理器第一步就是它。`md`（CommonMark）那一路这一步是无害的（`\{` 的反斜杠
被当转义吃掉，`{#id}` 仍是标题末尾的文字），所以两条共用同一份预处理，标题 id 才认得出来。
*/
export function measureMarkdown(
  content: string,
  draft: boolean,
  format: MarkdownFormat,
): { count: WordCount; scopes: WordCountScope[] } {
  const counts: WordCount = {
    ...EMPTY,
    pages: 1,
    drafts: draft ? 1 : 0,
  };
  const scopes: WordCountScope[] = [];

  const tree = (format === 'md' ? mdParser : mdxParser).parse(
    escapeMarkdownHeadingIds(content),
  );

  walkAst(tree as Node, (node) => countNode(node, counts, scopes));

  return { count: counts, scopes };
}

/**
不是 markdown 的那几份文档（本站是 `.dbml` 那一份）：没有语法树可走，整份正文按文字数。

它们走的是站点自己的 loader，不按 MDX 编译；硬套 MDX 解析器会当场报 acorn 错（DBML 的
`Table … {` 在 MDX 眼里是一个表达式），于是构建整棵内容根都红。结构那几行（标题、代码段、链接）
记 0，词、字符与页数照数 —— 这一页也是清单里的文档，不能从合计里安静消失。
`content` 与 `frontmatter` 来自站点那份 frontmatter 解析器：正文已经不含头部 YAML，
`frontmatter` 那一行按「有没有剥掉过」记。
*/
export function measureText(
  content: string,
  draft: boolean,
  frontmatter: boolean,
): { count: WordCount; scopes: WordCountScope[] } {
  const { cjk, latin, words } = countWords(content);

  return {
    count: {
      ...EMPTY,
      cjk,
      characters: content.length,
      drafts: draft ? 1 : 0,
      frontmatter: frontmatter ? 1 : 0,
      latin,
      pages: 1,
      words,
    },
    // 非 markdown 的文档不经指令，范围那一列恒空
    scopes: [],
  };
}
