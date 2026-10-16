import type { CSSItem, IPureNode, JSItem } from 'markmap-common';
import type { IFeatures, IMarkmapJSONOptions } from 'markmap-lib';

// markmap-lib 声明的 frontmatter 只有 `title` / `markmap` 两个键，但它实际是
// **原样透传** md 的 yaml frontmatter（`draft` 这类站点键也在里面），所以这里按
// 运行时真相把形状补全，而不是假装那些键不存在。
export interface MarkmapFrontmatter {
  title?: string;
  draft?: string;
  /** `true` 只是开关；写成对象时它同时是导图的渲染选项 */
  markmap?: Partial<IMarkmapJSONOptions> | boolean;
}

/**
`buildMarkmapData()` 的产物。它被 post loader 序列化成 md 编译结果里的
`export const markmap`，再由 Docusaurus 挂到 MDX 组件上，最终由 MindChart 消费。
*/
export interface MarkmapData {
  root: IPureNode;
  features: IFeatures;
  styles?: CSSItem[];
  scripts?: JSItem[];
  frontmatter?: MarkmapFrontmatter;
}
