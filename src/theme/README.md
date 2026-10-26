# src/theme

站点 swizzle（`.tsx`），用 `@theme-prev` 链在插件主题之上。

`src/theme` 是层栈最外层的**哨兵槽位**，所以这里的 `@theme-prev/DocCardList` = `theme-c`；
`theme-c` 里的 `@theme-prev` 又指向 `theme-b`……链路由此成立，整条链一共四层。

| 文件                    | 内容                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `DocCardList/index.tsx` | 链式覆盖的最外层：包裹 `@theme-prev/DocCardList`（= theme-c 的卡片列表） |

这一格挂在 `DocCardList` 上而不是另开一根 `Logo` 链，是因为「同一个组件被多层同时保留」只需要
一处真渲染：卡片列表在主页的正文区，套在它外面的标记肉眼可见（`[SITE] [C] [B] [A]`，四层各有一道
彩色虚线），浏览器与构建产物两头都取得到证据（`pnpm verify:chain` / `pnpm test:e2e`）。
站点层那道边框的样式在站点的 `src/css/custom.css`（由 `docusaurus.config.mjs` 里 preset-classic
的 `theme.customCss` 点名收进样式表管线）；里面那三层各自带着自己的样式表，
见 [`tools/README.md`](../../tools/README.md)。

官方 `@theme-original` 的语义没有被本机制改动，也仍然只在最外层安全；那条事实的产地是
`test/layers.test.mts` 与 packages/plugin-prev-layer-resolver/README.md，这里不再用一份 swizzle
重复演示它。
