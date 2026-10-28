/**
`@generated/theme-component-page/registry` 的类型声明。

这一格由本包在配置期生成到 Docusaurus 的生成目录（`.docusaurus/`），磁盘上**要到站点装载过
插件之后**才有那份文件，而类型检查跑在打包之前 —— 于是这里要告诉 TS「这个模块存在」，
口径同 `@theme/*` 那一族（见 `packages/plugin-prev-layer-resolver/types/theme-specifiers.d.ts`）。

形状只在这一份里写：生成它的那段文本在 `src/registry-module.mts`，读它的那份
`theme/DocItem` 与本包 `lib/` 都从这里取类型，不再有「两侧各写一份」。
*/
declare module '@generated/theme-component-page/registry' {
  /**
  站点配置里那一列清单归一化之后的样子：条目数据 + 那条 `component` 说明符解析出来的组件。
  顺序 = 命中优先级。
  */
  export const pages: readonly (import('./component-page.ts').ComponentPageEntry & {
    Component: import('react').ComponentType<
      import('./component-page.ts').ComponentPageProps
    >
  })[]
}
