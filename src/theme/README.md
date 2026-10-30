# src/theme

站点 swizzle（`.tsx`），用 `@theme-prev` 链在插件主题之上。

`src/theme` 是层栈最外层的**哨兵槽位**，所以这里的 `@theme-prev/DocCardList` = `theme-c`；
`theme-c` 里的 `@theme-prev` 又指向 `theme-b`…… 链路由此成立，整条链一共四层。

| 文件                    | 内容                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `DocCardList/index.tsx` | 链式覆盖的最外层：包裹 `@theme-prev/DocCardList`（= theme-c 的卡片列表） |

这一格挂在 `DocCardList` 上而不是另开一根 `Logo` 链，是因为「同一个组件被多层同时保留」只需要
一处真渲染：卡片列表在主页的正文区，套在它外面的标记肉眼可见（`[SITE] [C] [B] [A]`，四层各有一道
彩色虚线），浏览器与构建产物两头都取得到证据（`pnpm verify:chain` / `pnpm test:e2e`）。
站点层那道边框的样式在站点的 `src/css/custom.css`（由 `docusaurus.config.mjs` 里 preset-classic
的 `theme.customCss` 点名收进样式表管线）；里面那三层各自带着自己的样式表，
见 [`tools/README.md`](../../tools/README.md)。

## 这一层为什么不再管侧边栏徽标

侧边栏那枚「新建 / 更新」徽标（**git** 判：只提交过一次且最近动过 = 新建，最近动过 = 更新过）
归 `themes/theme-git-badge` 那一层管了 —— 判据、载体、画法、样式全在包里。

**为什么不能留在站点层**：官方别名 `@theme/DocSidebarItem/Link` 是**全局赢家**，主题路径按
「fallback → preset 主题 → 用户插件 → 站点 `src/theme`」枚举，**后者覆盖前者**。站点层若提供
这一格，它就压过插件层 —— 徽标那一层再好看也轮不到它。所以两格只能二选一，本仓选了「让包里
那一层接管」，站点层不再 swizzle `DocSidebarItem/*`。

理由与证据（载体是哪条通道、为什么换 `label` 而不是另插一个元素、层栈顺序怎么定的）在
[`themes/theme-git-badge/docs/internals.md`](../../themes/theme-git-badge/docs/internals.md)。

**判据用 git**；页面自己钉徽标用的是 `git_badge: new` / `git_badge: update`，写它只改侧边栏
那一格，正文里不会多出任何东西。
