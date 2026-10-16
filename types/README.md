# types

`@theme` 系 specifier 的**类型声明**（`plugin-prev-layer-resolver.d.ts`）。这些模块由 webpack
的 resolve 阶段改写，磁盘上没有对应目录，所以 TypeScript 需要在这里被告知「它们存在」。

收录口径 = **本仓库真的 import 过它**（`pnpm lint:type` 各项目的输入文件）。没人 import 的 specifier 不在这儿占位：声明还在会假装「还在用」。

| 声明                | 来源            | 语义                       |
| ------------------- | --------------- | -------------------------- |
| `@theme/X`          | Docusaurus 自带 | 最终生效的实现（全局赢家） |
| `@theme-original/X` | Docusaurus 自带 | 与 `@theme/X` 同一个文件   |
| `@theme-prev/X`     | 本仓库方案      | 我下面那一层提供的 X       |

## 为什么官方那两个也在「补丁」文件里

它们**不是**补丁，是这份文件的本体：项目的 `node_modules` 布局让 `tsc` 解析不到
`@docusaurus/theme-classic`，站点自己的 swizzle（`src/theme/**`）就靠这里拿类型。
所以 `@theme-prev` 那三条将来怎么变，这个文件都不能跟着链式方案一起删。

## 谁在引用它

被两处 `files` 直接列入：`tsconfig.demo.json`、`tsconfig.test.json`（它们的 `include` 够不到仓库根）。
其余消费方走仓库根 `tsconfig.json` 的默认 include（`**/*`）：站点自己的 swizzle（`src/theme/**`）
与主题包里**未编译**的层和组件（`theme/*/theme/**`、`theme/*/components/**`）—— 三个构建项目的
`include: ["src"]` 现在都没有要别名的文件，所以那份 `files` 已经跟着删了。
删掉这个文件，`pnpm typecheck` 与 `pnpm lint:type` 都会红 —— 不是「没人用的类型补充」。

默认导出统一是 `FunctionComponent<Record<string, unknown>>`：每层包裹的组件 props
各不相同，在这里做约束等于把「链式覆盖」这个运行时能力错误地类型化。语义详见 [plugin-prev-layer-resolver 的 README](../plugins/plugin-prev-layer-resolver/README.md)。
