/**
`@generated/theme-component-page/registry` 与 `…/frame-registry` 那两份的类型声明。

这两格由本包在配置期生成到 Docusaurus 的生成目录（`.docusaurus/`），磁盘上**要到站点装载过
插件之后**才有那两份文件，而类型检查跑在打包之前 —— 于是这里要告诉 TS「这两个模块存在」，
口径同 `@theme/*` 那一族（见 `packages/plugin-prev-layer-resolver/types/theme-specifiers.d.ts`）。

形状只在这一份里写：生成它们的文本在 `src/registry-module.mts`，读它们的 `theme/DocItem` 与
`theme/ComponentFramePage` 都从这里取类型，不再有「两侧各写一份」。

**按 `render` 分成两份**：文档页那份只 `import` `page` 那一侧的组件（所以只有那些条目带
`Component`），框内那份只 `import` `iframe` 那一侧的。一张表、两种落点各站一侧，就不会出现
「父文档为了判一条框内规则，把渲染器那几 MB 拖进入口 chunk」。
*/
declare module '@generated/theme-component-page/registry' {
  /**
  表里的一条：一条补明缺省的规则，`page` 那一侧还带上它那个组件。

  `component` 那一格在两侧都是**登记名**：这一份把它铺成真的组件，`frame-registry` 那一份按它
  查组件。表的**顺序 = 命中优先级**（怎么排出来的记在 `src/contribute.mts`）。
  */
  export const rules: readonly (
    | (import('./component-page.ts').ComponentPageRule & {
        render: 'page'
        Component: import('react').ComponentType<
          import('./component-page.ts').ComponentPageProps
        >
      })
    | (import('./component-page.ts').ComponentPageRule & {
        render: 'iframe'
        Component?: undefined
      })
  )[]
}

declare module '@generated/theme-component-page/frame-registry' {
  /**
  框内那份文档读的那一份：登记名 → 组件。

  组件的入参类型比 `page` 那一侧宽（`Record<string, unknown>`）：框里那一份数据是外层
  postMessage 送进来的，形状由消息校验保证（`lib/frame-messages.ts` 的 `isFrameInit`），
  它不经过父页的 React 树，也就没有 `content` 那一格。
  */
  export const components: readonly {
    id: string
    Component: import('react').ComponentType<Record<string, unknown>>
  }[]
}
