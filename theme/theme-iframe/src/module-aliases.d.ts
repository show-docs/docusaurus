/// <reference types="@docusaurus/module-type-aliases" />

// `@docusaurus/router`、`@docusaurus/useIsBrowser`、`*.module.css` 这些 import 只在 webpack
// 构建期存在，磁盘上没有对应文件 —— 类型由官方的 `@docusaurus/module-type-aliases` 说明。
// 这一份只覆盖本包（构建项目的 `include: src` 收到它），不动仓库根的 tsconfig 口径。
