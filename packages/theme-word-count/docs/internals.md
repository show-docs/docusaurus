# theme-word-count 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、统计为什么读清单而不是扫目录、「一个词」的码位表为什么写死、生成模块的形状与它凭什么稳定，以及改动时该跑哪几条判据。使用者要看的（怎么触发、页面上有什么、有哪些局限）在 [`README.md`](../README.md)，这里不重复。

## 组成

| 文件                               | 编译吗              | 职责                                                                                                                                                                           |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.mts`                    | ✅ `src/` → `dist/` | 入口：`loadContent()` 交出一份组件与一条规则（`{ key: 'wordCount', match: 'boolean', component: 'word-count' }`）、`allContentLoaded()` 算出全站统计并铺成生成模块、给出层目录 |
| `src/content.mts`                  | ✅                  | 从 `allContent` 里各份 docs 实例的清单解回磁盘上的文件、逐页数一遍，再按「实例 + 版本」合一格                                                                                  |
| `src/count.mts`                    | ✅                  | 「一个词」的码位表与两种来源各数一种（CJK 按字、其余按词）                                                                                                                     |
| `src/stats-module.mts`             | ✅                  | 把统计渲染成那一份生成模块的文本（只有一句 `export const stats = <JSON>`）                                                                                                     |
| `types/word-count.d.ts`            | ❌（随包发的声明）  | 三份形状：`WordCount` / `WordCountGroup` / `WordCountStats`；`src/` 与 `theme/` 两侧都读它                                                                                     |
| `types/word-count-specifiers.d.ts` | ❌（随包发的声明）  | `declare module '@generated/theme-word-count/stats'`：浏览器侧那句 `import` 的类型从这来                                                                                       |
| `theme/WordCountPage/index.tsx`    | ❌ 站点编译         | 本层那一页：component-page 判中 `wordCount` 后整页换成它；它按路由上下文挑出这一页所在的实例，把那一份统计摆在官方 `DocItem` 前面                                              |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/`，本包就不编译第二遍；口径的产地在
[plugin-compile-source 的维护者文档](../../plugin-compile-source/docs/internals.md) 的「这一族构建包的编译口径」。

## 统计读的是清单，不是目录

`allContentLoaded({ allContent })` 拿到的是**所有插件加载完的那一份清单**。各 docs 实例在此之前已经把 `include` / `exclude`、草稿、版本化目录那些事算完了，剩下的 `docs` 那一列就是「这一份实例会渲染哪些页」。本包只把每一条的 `source`（`aliasedSitePath()` 写出来的 `@site/…`）用官方那一位 `aliasedSitePathToRelativePath` 解回磁盘上的文件。

于是「统计覆盖了哪些页」与「站点渲染了哪些页」天然是同一份口径：站点多一棵内容根、换一条 `include`、开一个版本，本包一行都不用改。另一条路（自己按 `siteConfig` 里的内容根三格扫目录）要跟着站点配置走，还会把草稿、`exclude` 那些判据抄第二份 —— `theme-git-badge` 的注入点更早（`loadContent()`，那时清单还不存在），所以它索性不按内容根筛，代价只是多判几个非页面的 markdown。

清单里的 `source` 不是 `@site/` 打头时官方那一位当场抛，本包不截字符串、不自己拼路径：宁可在构建里点名，也不要安静算出一条不存在的路径。

## 「一个词」的码位表写死在这里

`src/count.mts` 里两把正则就是全部规则，改它等于改全站数字的口径：

- **CJK 按字**：假名（`\u3040-\u30ff`，含长音符）、汉字（扩展 A `\u3400-\u4dbf`、基本区 `\u4e00-\u9fff`、兼容表意 `\uf900-\ufaff`）、谚文音节 `\uac00-\ud7af`。这几段是明写的，不用 `Intl.Segmenter` —— 那个分词器按 locale 选，构建机上装的 ICU 版本换了，产物里的数就会漂。
- **其余按词**：`[\p{L}\p{N}][\p{L}\p{N}'’-]*`，以字母或数字开头，后面可带撇号与连字符，所以 `don't`、`web-page` 各算一个。数之前先把 CJK 换成空格，否则 `\p{L}` 认汉字，同一个字被数两遍。
- **中日韩标点不算**：`\u3000-\u303f`、`\uff00-\uffef` 那两段不在 CJK 类里，一个「。」不是一个词。
- **表外的汉字走拉丁那一路**：码位段只列常用那几段，扩展 B（平面 2，`CJK Unified Ideographs Extension B`）不在 CJK 类里，但带 `u` 标记的 `\p{L}` 认它，于是落进拉丁那一路 —— 结果还是一个词，与按字同一个数。真正会被数成「一段」的是表外那族连着写的多个字，本站没有那种内容。
- **markdown 语法符号自然不算**：`#`、`|`、反引号、链接的圆括号既不是字母也不是数字，两把正则都落不到它们身上。代码块与表格的**内容**因此在统计里（那是选定的口径，见 README 的「计数口径」），但那些符号本身一个词都不是。
- **frontmatter 不数**：正文由 `parseMarkdownFile()` 交回，那一段 YAML 已经剥掉了。用的解析器是 `siteConfig.markdown.parseFrontMatter`，也就是站点渲染这一页时那一份 —— 别的层包住它时，「剥掉的那一段」与「页面开头看不见的那一段」还是同一件事。标题行（`# 标题`）在正文里，照数。

CJK 那把带 `u` 标记，而 `\u{…}` 的写法是配套的：去掉 `u` 标记，花括号会被当成量词，那一类当场变形状。

## 数算在配置期，铺成生成模块

`allContentLoaded` 是配置期唯一「所有插件的 content 都已到齐」的点（机制层铺那张规则表用的也是它），客户端打包在它之后，所以本包写进 `.docusaurus/` 的那一份赶得上第一次打包，数字因此在静态 HTML 里。`postBuild` 跑在 HTML 已经写完之后，那时算出来的数只赶得上下一轮构建。

生成模块只有那一句 `export const stats = <JSON>`，没有日期、没有 git 状态：同一份内容两次构建产物一样。浏览器侧读它的地址由 webpack 那条 `@generated` 别名给出，那一串路径必须与 `src/index.mts` 里 `STATS_FILE` 一致，它的类型来自 `types/word-count-specifiers.d.ts`。

数字在页面上直接写出来，不加千分位格式化：静态渲染与服务端注水要拼出同一个字符串，少一处格式化就少一处能漂的地方。

## 分组按「实例 + 版本」

`groups` 的键是 `实例 id\0版本显示名`，显示名没写时官方用版本名顶上（`version.label ?? version.versionName` 那一句）。本站两份实例因此各占一格（`default` 与 `themes`），不必读站点配置里那三格转述。同一份实例开了多个版本就占几格。

格子的顺序跟着清单走（实例、版本），所以同一份内容根每次都是同一份产物；`pages` 是那一格里数到的页数，不另数一遍。

## 这一页怎么知道自己在哪一格

`WordCountPage` 在渲染期调 `useRouteContext()`，拿到的 `plugin.id` 就是这一页所属的 docs 实例：

- **路由上下文是 Docusaurus 自己挂的**：每棵插件路由树的顶上有一份 `__context`（本站生成物里是 `routesChunkNames` 的 `/-50b` 与 `/themes-1f2` 那两条），值是 `{ name: 'docusaurus-plugin-content-docs', id: <实例 id> }`；子路由继承它（`mergeContexts` 只把父层的 `plugin` 往下带），所以任意一篇文档的组件里读到的都是自己那棵树的实例。
- **它与配置期分组用的键同源**：`aggregateAllContent` 按 `plugin.options.id` 分组，`toPluginRoute` 写进路由上下文的也是 `plugin.options.id`。两侧不各写一份映射，也不发「页面 → 格」的表 —— 那份表要么随页数线性长大，要么得把同一个 id 抄第二遍。
- **它只能到实例，到不了版本**：所以版本化的实例显示的是各版本合计。以后要「只显示这一页所在版本」，给每格多存一个 `versionName`（`content.metadata.version` 就是同一个值）再比一下即可，判据本身不用动。
- **不 `useDoc()`**：它读 `DocProvider`，而那个 Provider 在官方 `DocItem` 里面；统计块渲染在 `DocItem` 之上，调用会直接抛 `ReactContextError('DocProvider')`。
- **不按 `pathname` 前缀猜**：运行时拿不到实例的 `routeBasePath`，slug、版本路径与尾斜杠都得自己归一，比路由上下文弱。
- **挑不出格就退回整份统计**：路由不是 docs、或者分组里没有这个实例时，页面回到「全站」视图。`@theme/DocItem` 只有 docs 用，这条分支理论上到不了，留着是不让一个边界把页面弄空。

## 这一页为什么不用共用的视图外壳

`theme-markmap` / `theme-erd` / `theme-diff` 三条视图层共用 `packages/theme-component-page/lib/view-layer-shell.tsx`（错误边界 + `Suspense` + 放宽容器那段 CSS）。本包的 `WordCountPage` 三份都不需要：数在配置期就算好了，读它只是一句对象取值，没有会失败的第三方初始化，也没有要等下载的 chunk；那一段宽度补丁会把 `.container` 放开到整栏，而这一页要的正是文档那一栏的正常宽度。

因此它不进那份共用外壳，`test/view-layer-copies.test.mts` 那三条视图层的清单也不含本包。

## 失败落点

配置期只有一种失败，且是故意的；渲染期只有一条回退，且理论上到不了：

| 情况                                                   | 落点                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| 清单里那一份文件在磁盘上读不到（或头部 YAML 解析不了） | 构建抛错，点名那一份文件                                |
| 站点里没有 docs 实例（`allContent` 里没有清单可读）    | 三个数都是 0，页面显示「站点里还没有加载到任何文档」    |
| 这一页的路由不属于 docs，或分组里挑不出它所在的实例    | 退回全站视图；`@theme/DocItem` 只有 docs 用，这条到不了 |
| 站点没注册 `theme-component-page`                      | 不检查。`loadContent()` 交出的那一份没人接，数字不出现  |

第一格不兜底：那一份文件本来就已经被 docs 实例加载过一次，走到这里读不到说明磁盘与清单对不上了。安静少数是这类统计最难发现的错，宁可红。

## 用例与红线

- 构建期判据：`test/word-count.test.mts` —— 两把码位表的边界（纯 CJK / 纯拉丁 / 混排 / 空串、标点、`don't` 这类带分隔符的一个词）、`@site/` 地址反解、非 docs 实例的 content、`label` 与 `versionName` 两种落点、同一格重复出现与新开一格、多实例分组，以及 `allContentLoaded()` 真的往一个临时 `generatedFilesDir` 写出那份模块。`src/` 全份挂在覆盖率红线上（`vitest.config.mts` 的 `coverage.include` 盖住每个包的 `src/`）。
- 交给 component-page 的那一把键：`tools/scripts/verify-chain.mts` 第 3 节从 `.docusaurus/theme-component-page/registry.ts` 回读，认的是「`wordCount` 这条在表里、`render=page`、组件说明符解析成 `@theme/WordCountPage`」——少交出那一条或键名漂了，那里就红。
- 页面上那一格：`test/e2e/features/word-count.feature`（步骤在同名 `steps/word-count.steps.mts`）。**不**断言具体数字 —— 本站的内容根每加一页文档，总数就变。两棵内容根各有一页命中（`/theme-word-count/docs/word-count-demo` 在 `default`、`/themes/` 在 `themes`），各断言「那一块在、只写自己那个实例、不出现另一个实例、正文仍在」；挑错时页面会退回全站合计，两个 id 都会露在块里，所以「不出现另一个」正好把那两种症状一起兜住。另有一条反向：没写 `wordCount` 的页面这一格不出现。
- 入口交出的那一格：`test/package-entries.test.mts` 钉名字、层目录两格、以及 `loadContent()` 交回的 `{ components, rules }` 形状。本包也在 `test/view-layer-copies.test.mts` 那份「带源码层的包」清单里 —— 那一格钉的是「不许在本包入口再补一条 TS 源码编译规则」。
- 站点自己那份配置里的说明在 `docusaurus.config.mjs` 的 `plugins` 清单里（为什么这一层不必转述内容根那三格）。
