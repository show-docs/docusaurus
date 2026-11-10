/**
`@generated/theme-word-count/stats` 那一份的类型声明。

这份文件由本包在配置期生成到 Docusaurus 的生成目录（`.docusaurus/`），磁盘上**要到站点装载过
本包之后**才有那一份，而类型检查跑在打包之前 —— 于是这里要告诉 TS「这个模块存在」，
口径同 `@theme/*` 那一族（见 `packages/plugin-prev-layer-resolver/types/theme-specifiers.d.ts`）。

形状只在 `./word-count.d.ts` 里写：产出它的文本在 `../src/stats-module.mts`，读它的是
`../theme/WordCountPage`，两侧都从这里取类型。
*/
declare module '@generated/theme-word-count/stats' {
  export const stats: import('./word-count.ts').WordCountStats
}
