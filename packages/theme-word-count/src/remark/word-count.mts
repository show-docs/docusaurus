import type { WordCountScope } from '../../types/word-count.ts';
import { walkAst } from '../ast.mts';
import { COMPONENT, IMPORT, WORD_COUNT_SCOPES } from '../directive.mts';

/**
把 `::word-count` 叶指令在**语法树**上换成组件 —— 让这一格在 `md` 与 `mdx` 两种格式下都渲染。

为什么落在语法树、而不是像旧版那样往文本里塞源码：`markdown.format: 'md'`（以及 `detect` 下的
`.md`）不解析源码里的 `import` / `<X/>`，旧的文本注入在这种页面上会把那两行裸露成正文。但 MDX
编译器对**插件造出来的** `mdxJsxFlowElement` / `mdxjsEsm` 节点一视同仁（`format:'md'` 那条流水线
专门给这几类节点配了 rehype-raw 的 `passThrough`），照旧出成真组件 —— Docusaurus 自己的 `:::note`
也是这么在 md 里渲染的。

站点把它挂进各内容插件的 `remarkPlugins`（Docusaurus 没给主题层留全局挂载点，见本包
`docs/internals.md`）：

```js
import { remarkWordCount } from '@show-docs/docusaurus-theme-word-count/remark';
// 每棵 docs 内容根的选项里：remarkPlugins: [remarkWordCount]
```

`::word-count{scope="page"}` 的 scope 落在指令的 `attributes` 上（remark-directive 已把引号剥掉），
四种之外的值或没写按缺省 `instance`。认的范围与 `../directive.mts` 共用同一把 `WORD_COUNT_SCOPES`。
只处理本包这一把指令名，别的指令一律不碰；多条指令只在根上补**一条** import。
*/

/** remark-directive 的三种指令节点（叶 / 容器 / 行内），word-count 可能落成其中任一种。 */
const DIRECTIVE_TYPES = new Set([
  'leafDirective',
  'containerDirective',
  'textDirective',
]);

interface DirectiveNode {
  type: string;
  name?: string;
  attributes?: Record<string, string | null>;
  children?: Node[];
}

type Node = DirectiveNode & { [key: string]: unknown };

function jsxAttribute(scope: WordCountScope): {
  type: string;
  name: string;
  value: string;
} {
  return { type: 'mdxJsxAttribute', name: 'scope', value: scope };
}

/** 把一条 word-count 指令换成组件节点：行内（textDirective）用 Text，块级（叶 / 容器）用 Flow。 */
function componentNode(directive: DirectiveNode): Record<string, unknown> {
  const raw = directive.attributes?.scope;
  const scope: WordCountScope =
    raw !== undefined && WORD_COUNT_SCOPES.has(raw as WordCountScope)
      ? (raw as WordCountScope)
      : 'instance';

  return {
    type:
      directive.type === 'textDirective'
        ? 'mdxJsxTextElement'
        : 'mdxJsxFlowElement',
    name: COMPONENT,
    attributes: [jsxAttribute(scope)],
    children: [],
  };
}

/**
补在根上的那句 import：手搭一个最小 `mdxjsEsm` 节点，estree 形状照 MDX 解析器产出的那份
（`format:'md'` 也认它，故两种格式都会真的发出这条 import）。
*/
function importNode(): Record<string, unknown> {
  return {
    type: 'mdxjsEsm',
    value: `${IMPORT};`,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        comments: [],
        body: [
          {
            type: 'ImportDeclaration',
            specifiers: [
              {
                type: 'ImportDefaultSpecifier',
                local: { type: 'Identifier', name: COMPONENT },
              },
            ],
            source: {
              type: 'Literal',
              value: '@theme/WordCount',
              raw: "'@theme/WordCount'",
            },
          },
        ],
      },
    },
  };
}

/** 是不是本包那把指令。 */
function isWordCount(node: Node): boolean {
  return DIRECTIVE_TYPES.has(node.type) && node.name === 'word-count';
}

/* eslint-disable no-param-reassign -- unified 的 remark 插件就地改这棵 mdast 树就是它的算法本身：
每个节点只改写自己那一格，逐层复制整棵树等于白拷贝。走树用 ../ast.mts 的 walkAst（与 measure 同一份）。 */
function transform(tree: Node): void {
  let count = 0;

  walkAst<Node>(tree, (node, index, parent) => {
    if (!isWordCount(node)) {
      return;
    }

    parent.children![index] = componentNode(node) as Node;
    count += 1;

    // 换出来的是空组件：它原来的正文不再渲染，也不必再下钻（与计数侧同一剪枝）
    return false;
  });

  // 没换过任何指令就不动这棵树；换过才补一句 import（此时根必带 children）
  if (count === 0) {
    return;
  }

  tree.children!.unshift(importNode() as Node);
}
/* eslint-enable no-param-reassign */

export function remarkWordCount(): (tree: Node) => void {
  return transform;
}
