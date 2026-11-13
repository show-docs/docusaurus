import type { MarkmapNode } from '@markmap/core';

/**
`buildMarkmapData()` 的产物。它被 post loader 序列化成 md 编译结果里的
`export const markmap`，再由 Docusaurus 挂到 MDX 组件上，最终由 MindChart 消费。
*/
export interface MarkmapData {
  /** 1.x 的结构化树：节点的标签是 mdast inline 节点，正文段落等落在 `notes` 里。 */
  root: MarkmapNode;
  /** 原样透传的 md frontmatter：站点键与 `markmap` 选项都在里面。 */
  frontmatter: Record<string, unknown>;
}
