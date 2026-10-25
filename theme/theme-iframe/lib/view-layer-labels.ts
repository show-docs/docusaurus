/**
一条视图层自己的说法：失败提示与控制台那一行说的都是本层的话。

数据只在这里 —— 它要被两个 `.tsx` 引（兜底与那一格外壳），落成 `.ts` 之后
`react-refresh` 那条「一个文件只导出组件」的规则不用再为它开例外。
*/
export interface ViewLayerLabels {
  /** 控制台那一行的前缀，就是包名（如 `theme-markmap`）。 */
  name: string;
  /** 失败提示的标题。 */
  title: string;
  /** 失败提示的正文。 */
  description: string;
}
