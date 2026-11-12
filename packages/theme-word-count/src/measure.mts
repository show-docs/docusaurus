import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { escapeMarkdownHeadingIds } from '@docusaurus/utils';

import type { WordCount } from '../types/word-count.ts';

import { EMPTY } from './aggregate.mts';
import { countWords } from './count.mts';

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

/** 解析器只建一次：每份文件都新建一条流，白白多一层开销。 */
const parser = unified()
  .use(remarkParse)
  .use(remarkMdx)
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

/** 一棵子树走一遍：先记这一格，再走子节点。 */
function walk(node: Node, counts: WordCount): void {
  switch (node.type) {
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

  const children = node.children ?? [];

  for (const child of children) {
    walk(child, counts);
  }
}
/* eslint-enable no-param-reassign */

/**
一份文件的全部明细。

`content` 是**剥掉 `:::word-count` 之后**的原文（frontmatter 还在，`yaml` 那一格由树上报）；
`draft` 来自站点那份 frontmatter 解析器的结果，明细里单独记一格。

解析前先走一句 `escapeMarkdownHeadingIds`：站点把正文交给 MDX 时，预处理器做的第一步就是它
（经典写法的 `{#id}` 不转义会当场解析失败）。这里读的是同一份转义后的文字，标题 id 才认得出来，
正文其余字符也与站点编译的那一份一致。
*/
export function measureMarkdown(content: string, draft: boolean): WordCount {
  const counts: WordCount = {
    ...EMPTY,
    pages: 1,
    drafts: draft ? 1 : 0,
  };

  walk(parser.parse(escapeMarkdownHeadingIds(content)) as Node, counts);

  return counts;
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
): WordCount {
  const { cjk, latin, words } = countWords(content);

  return {
    ...EMPTY,
    cjk,
    characters: content.length,
    drafts: draft ? 1 : 0,
    frontmatter: frontmatter ? 1 : 0,
    latin,
    pages: 1,
    words,
  };
}
