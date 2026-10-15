/**
动态主题 specifier 的类型声明。

这些 specifier 由 `plugins/plugin-prev-layer-resolver` 在 webpack resolve 阶段改写，
磁盘上并不存在对应目录，因此 TypeScript 需要在这里告诉它「这些模块存在」。

收录口径 = **本仓库真的 import 过它**（`pnpm typecheck` / `pnpm lint:type` 各项目
的输入文件）：官方别名 `@theme/X` / `@theme-original/X` 被站点层 swizzle 用到，
链式的 `@theme-prev/X` 是这套方案本身。没人 import 的（如 `@theme-init/X`）不在这儿
占位 —— 那会让「声明还在」假装「还在用」，而它其实从未被任何源码引用过。

- `@theme/X`          → 最终生效的实现（全局赢家）
- `@theme-original/X` → 与 `@theme/X` 同一个文件
- `@theme-prev/X`     → 我下面最近一层提供的 X

语义详见 `../plugins/plugin-prev-layer-resolver/README.md`。默认导出钉成 `FunctionComponent`，props 收成
`Record<string, unknown>`：每层包裹的组件 props 由各自的主题层决定，透传形态（`{...props}`）
本来就不该假设它的形状 —— 用 `unknown` 会连 JSX 都渲染不了，用 `any` 则会把下游拼错的
prop 名一并放过。
*/
declare module '@theme/*' {
  const component: import('react').FunctionComponent<Record<string, unknown>>
  export default component
}

declare module '@theme-original/*' {
  const component: import('react').FunctionComponent<Record<string, unknown>>
  export default component
}

declare module '@theme-prev/*' {
  const component: import('react').FunctionComponent<Record<string, unknown>>
  export default component
}
