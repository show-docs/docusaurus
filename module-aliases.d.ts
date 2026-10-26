/// <reference types="@docusaurus/module-type-aliases" />

// `@docusaurus/router`、`@docusaurus/useIsBrowser`、`*.module.css` 这些 import 只在 webpack
// 构建期存在，磁盘上没有对应文件 —— 类型由官方的 `@docusaurus/module-type-aliases` 说明。
//
// 一份就够，放在仓库根：`/// <reference types>` 与它带进来的 `declare module` 都是整个
// program 范围的，不分目录。两个 program 各从一个入口拿到它：
//
// - 根 `tsconfig.json`（`pnpm lint:type`）：默认 include `**/*`，这一份顺手收进来；
// - `tsconfig.test.json`（`pnpm typecheck`）：include 只列 test / src / packages / scripts，
//   这一份不在其中，所以在它的 `files` 里点名。
//
// 各包自己的构建项目（`tsconfig.build.json`）只收 `src/`，那里没有这些构建期 import，
// 用不到这一份。
