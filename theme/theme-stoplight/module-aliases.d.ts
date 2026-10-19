/// <reference types="@docusaurus/module-type-aliases" />

// `@docusaurus/useIsBrowser`、`*.css`（本包那份版式，以及 `@stoplight/elements/styles.min.css`）
// 这些 import 只在 webpack 构建期存在，磁盘上没有对应文件 —— 类型由官方的
// `@docusaurus/module-type-aliases` 说明（`*.css` 的默认导出就是 `string`）。
// `theme/` 与 `components/` 不进本包的构建项目（它们由站点侧的 Docusaurus 编译），
// 所以这一份由仓库根 `tsconfig.json` 的默认 include（`**/*`）收到，补的正是 `pnpm lint:type` 的口径。

// Elements 那份样式表**不是**打进 bundle 的 css，而是它单独一个产物的地址：`src/index.mts`
// 给它配了 `asset/resource`。类型上官方那条 `*.css` 已经交回 `string`，正好对得上，
// 但「这个 string 是地址而不是别的东西」是构建规则给的，不是类型给的 —— 两边为什么必须配套，
// 记在 `components/stoplight-ui.tsx` 上面那段与包 README 的「样式」一节。
