/// <reference types="@docusaurus/module-type-aliases" />

// `@docusaurus/useIsBrowser` 与本包那份 `*.css` 这两类 import 只在 webpack 构建期存在，
// 磁盘上没有对应文件 —— 类型由官方的 `@docusaurus/module-type-aliases` 说明。
// `theme/` 与 `components/` 不进本包的构建项目（它们由站点侧的 Docusaurus 编译），
// 所以这一份由仓库根 `tsconfig.json` 的默认 include（`**/*`）收到，补的正是 `pnpm lint:type` 的口径。
