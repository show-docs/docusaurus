import type { WordCountScope } from '../types/word-count.ts';

/**
`::word-count` 这一族共用的常量 —— 渲染与计数两侧都从这里取，保证「叫什么、认哪些范围」只有一份来源。

指令的「识别」不再靠这里的正则：渲染侧（`./remark/word-count.mts`）与计数侧（`./measure.mts`）都让
`remark-directive` 把 `::word-count` 解析成语法树上的 directive 节点，再按节点名 / `attributes.scope`
处理。所以这一格只剩三样常量：
*/

/** 指令换成的组件绑定名与它那句 import。`__` 前缀是给「本包生成」留记号，作者自己的 `WordCount` 不撞名。 */
export const COMPONENT = '__WordCount';
export const IMPORT = `import ${COMPONENT} from '@theme/WordCount';`;

/**
四种范围 —— **唯一来源**。渲染侧（`{scope}` 不在这里就当缺省 `instance`）与计数侧（记 `usage`）都用这把
Set 判合法；加第五种范围只改这里一处。
*/
export const WORD_COUNT_SCOPES: ReadonlySet<WordCountScope> =
  new Set<WordCountScope>(['page', 'folder', 'instance', 'site']);
