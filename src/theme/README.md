# src/theme

站点 swizzle（`.tsx`），用 `@theme-prev` 链在插件主题之上。

`src/theme` 是层栈最外层的**哨兵槽位**，所以这里的 `@theme-prev/DocCardList` = `theme-c`；
`theme-c` 里的 `@theme-prev` 又指向 `theme-b`…… 链路由此成立，整条链一共四层。

| 文件                                | 内容                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `DocCardList/index.tsx`             | 链式覆盖的最外层：包裹 `@theme-prev/DocCardList`（= theme-c 的卡片列表） |
| `DocSidebarItem/Link/index.tsx`     | 侧边栏的文档条目那一行：末尾挂「新建 / 更新」徽标                        |
| `DocSidebarItem/Category/index.tsx` | 侧边栏的分类那一行（每个包那一行）：同样挂徽标                           |

这一格挂在 `DocCardList` 上而不是另开一根 `Logo` 链，是因为「同一个组件被多层同时保留」只需要
一处真渲染：卡片列表在主页的正文区，套在它外面的标记肉眼可见（`[SITE] [C] [B] [A]`，四层各有一道
彩色虚线），浏览器与构建产物两头都取得到证据（`pnpm verify:chain` / `pnpm test:e2e`）。
站点层那道边框的样式在站点的 `src/css/custom.css`（由 `docusaurus.config.mjs` 里 preset-classic
的 `theme.customCss` 点名收进样式表管线）；里面那三层各自带着自己的样式表，
见 [`tools/README.md`](../../tools/README.md)。

## 侧边栏徽标：把「新建 / 更新」画到 SidebarItem 上

「新建 / 更新」由 **git** 判，判据是这一页的两个时刻：只提交过一次且最近动过 = 新建，
最近动过 = 更新过。站点把它写进官方唯一一条 frontmatter → 侧边栏的通道：
`sidebar_custom_props`。官方把它原样抄到侧边栏项的 `customProps` 上
（`plugin-content-docs/lib/props.js`），站点层再把标签文字换成「带徽标的样子」。

**载体**就是那一条通道：**发布出去的注入器包不动** —— 规则表由站点自己给
（`docusaurus.config.mjs` 里给注入器加一条规则，把徽标种类写进那一格）。

**判据**是 **git**，不是标签：站点那条规则自己算 —— 拿注入器包导出的 `timesOf`（一份文件的两个
时刻）与 `isRecent`（最近动过没有），判出「只提交过一次且最近动过 = 新建」「最近动过 = 更新过」。

**为什么不读标签**：站点**不再注入** git 标签（注入器缺省那条 `tags` 规则不在站点的规则表里），
「新建 / 更新」眼下只有这一枚徽标在说。徽标要是读标签，就得靠页面写 `tags: [git-new]` 才能钉死，
而那会在正文里多出一颗芯片、还多一个标签页。徽标与标签因此彻底解耦：标签归标签，徽标归徽标。

**锚点用页面自己的一把键**：frontmatter 里写 `git_badge: new` / `git_badge: update` 就由页面说了算
（页面写的这一格说了算，不写才由 git 判）。它**不是标签** —— 写它不会在正文里多出芯片，也不进标签页。
e2e 的两枚锚点就是这么钉住的（差异视图示例页写 `git_badge: update`，关系图示例页写 `git_badge: new`）：
git 判出来的那两个随提交变，CI 的 checkout 又是新的。

**位置**是纯色点：绿=新建、橙=更新。不带文字（抄 `packages/tags.yml` 里的 label 就是第二份
要跟着漂的文案），也不带链接（不是 `/tags/` 链接，所以「页面上每一处 `/tags/` 链接都在文章末尾
那一格」那条断言不受影响）。一格一个点：新建蕴含更新，两个都在时只画新建那个。

**哪些格子带得上**：文档条目（主页那一格、各包 `docs/` 里的那些页）与分类那一行（每个包那一行
—— 分类项的 `customProps` 取的是它链的那一页的，也就是那个包的 README）。

**为什么换的是 `label` 而不是另插一个元素**：官方那一份把整个 `<li>` / `<a>` 当自己的根渲染，
从外面插不进 `<a>` 里面；而 `label` 是渲染进一个 `<span>` 的，React 节点渲染得进去。走这条路
就不用照抄官方那两份组件 —— 照抄要连它们的 CSS module 一起抄，而 CSS 文件不在官方别名表里。

徽标的形状在 `src/components/sidebar-badge.tsx`（它放在 `src/theme` **外面**：那一格是站点
swizzle 的目录，放进去就成了一层主题），样式在站点的 `src/css/custom.css`。浏览器里由
`test/e2e/features/sidebar-badge.feature` 钉（两种徽标各一条场景）。
