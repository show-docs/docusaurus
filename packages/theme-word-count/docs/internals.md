# theme-word-count 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、`:::word-count` 为什么走预处理器而不是 remark 插件、统计为什么读清单而不是扫目录、四种范围各从哪儿取数、「一个词」的码位表为什么写死、生成模块的形状与它凭什么稳定，以及改动时该跑哪几条判据。使用者要看的（怎么触发、页面上有什么、有哪些局限）在 [`README.md`](../README.md)，这里不重复。

## 组成

| 文件                               | 编译吗              | 职责                                                                                                                                                 |
| ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                    | ✅ `src/` → `dist/` | 入口：`loadContent()` 把预处理器包到站点那份 `markdown.preprocessor` 上、`allContentLoaded()` 算出全站统计并铺成生成模块、给出层目录                 |
| `src/directive.mts`                | ✅                  | `:::word-count [page\|folder\|instance\|site]` 的扫描与改写：指令换成 `<__WordCount scope="…" />`、文首补一句 import；统计侧剥掉指令的那一份也在这里 |
| `src/content.mts`                  | ✅                  | 从 `allContent` 里各份 docs 实例的清单解回磁盘上的文件、逐页数一遍，按「实例 + 版本」合一格，并把每页那一份按 `@site/…` 地址记进 `docs`              |
| `src/count.mts`                    | ✅                  | 「一个词」的码位表与两种来源各数一种（CJK 按字、其余按词）                                                                                           |
| `src/stats-module.mts`             | ✅                  | 把统计渲染成那一份生成模块的文本（只有一句 `export const stats = <JSON>`）                                                                           |
| `types/word-count.d.ts`            | ❌（随包发的声明）  | 四份形状：`WordCount` / `WordCountGroup` / `WordCountStats` / `WordCountScope`；`src/` 与 `theme/` 两侧都读它                                        |
| `types/word-count-specifiers.d.ts` | ❌（随包发的声明）  | `declare module '@generated/theme-word-count/stats'`：浏览器侧那句 `import` 的类型从这来                                                             |
| `theme/WordCount/index.tsx`        | ❌ 站点编译         | 指令换出来的那一块：按 `scope` 挑本页 / 本文件夹 / 所在实例 / 全站那一份，摆成一块 `Admonition`                                                      |
| `theme/WordCount/scope.ts`         | ❌ 站点编译         | `page` / `folder` 的取数与求和（纯函数，`test/word-count.test.mts` 直接钉「含子目录」）                                                              |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/`，本包就不编译第二遍；口径的产地在
[plugin-compile-source 的维护者文档](../../plugin-compile-source/docs/internals.md) 的「这一族构建包的编译口径」。

## 指令走预处理器，不是 remark 插件

Docusaurus 的 `markdown` 配置里**没有** `remarkPlugins` 那一格：remark 插件按内容插件各配各的（docs / blog / pages 各有一列），主题包拿不到别的插件的选项，也改不了站点那份 `siteConfig.plugins`。主题层零配置能碰的全局 markdown 钩子只有 `markdown.preprocessor` —— mdx-loader 在 MDX 编译前拿文件原文调它一次（`@docusaurus/mdx-loader/lib/preprocessor.js`）。

于是改写分两步（`src/directive.mts`）：

1. **认行**：`^ {0,3}:::word-count[ \t]*$`，或者带范围的那一条 `^ {0,3}:::word-count[ \t]+(page|folder|instance|site)[ \t]*$`。范围只认这四个词，写错（`pages`、`PAGE`、多写一段）时两条都不匹配，整行原样留下。四格缩进是缩进代码块，围栏（``` / ~~~）里的同形文字是示例 —— 扫描器自己维护围栏状态，按 CommonMark 那条收紧：字符相同、长度不短于开头那一串才算收尾。紧跟一行 `:::` 一并吃掉（容器式写法）。行尾 `\r` 单独拆出来，CRLF 文件不会被整份跳过。
2. **换行**：指令那一行换成 `<__WordCount scope="<那一格>" />`（没写范围就写 `instance`），并在 frontmatter 之后（没有 frontmatter 就是第 0 行）插一句 `import __WordCount from '@theme/WordCount';`。范围显式写进组件：浏览器那一侧只有一条读法，不必再猜「没写是什么」。ESM 与 JSX 都只在 MDX 文件里成立，所以这一份文件必须按 MDX 解析：站点把 `markdown.format` 配成 `'md'` 时，`@mdx-js/mdx` 把这两行各铺成一个段落（实测），页面上多出两句可见文字、块不出现（README 的「已知限制」）。

**为什么补 import，而不是把组件登记进全局 `theme/MDXComponents`**：后者要求本层覆盖（swizzle）`@theme/MDXComponents` 那一格。站点如果自己 swizzle 了同一格，全局赢家换成站点那份，本层登记的那一个组件名就没了，而指令换出来的 `<WordCount />` 会在渲染期变成「Element type is invalid」—— 构建全绿、页面崩，症状与原因隔着一整层。每页一句 import 自成一体：不依赖任何别的层，站点换掉 `src/theme/WordCount` 也能生效。

绑定名带 `__` 前缀（`__WordCount`）是给「本包生成」留一个记号：作者自己 import 一个叫 `WordCount` 的组件不会撞名；真撞了也是编译期重复声明，不是安静的渲染错。

**站点自己那份预处理器照跑**：包装按「先 base、后本层」调用（`wrapPreprocessor`），所以站点那份先按原样处理文件，本层在它的结果上认指令。函数上带 `Symbol.for('@show-docs/docusaurus-theme-word-count')` 记号，`reloadSite()` 重跑插件时不会套第二层。

**统计侧剥的是同一个扫描器**：`withoutWordCountDirectives()` 只去掉指令（与收尾）那几行，围栏里的示例照旧留在正文里。于是「指令算不算词」与「哪些行是指令」只有一份判断，不会出现改写认了、计数不认。

## 统计读的是清单，不是目录

`allContentLoaded({ allContent })` 拿到的是**所有插件加载完的那一份清单**。各 docs 实例在此之前已经把 `include` / `exclude`、草稿、版本化目录那些事算完了，剩下的 `docs` 那一列就是「这一份实例会渲染哪些页」。本包只把每一条的 `source`（`aliasedSitePath()` 写出来的 `@site/…`）用官方那一位 `aliasedSitePathToRelativePath` 解回磁盘上的文件。

于是「统计覆盖了哪些页」与「站点渲染了哪些页」天然是同一份口径：站点多一棵内容根、换一条 `include`、开一个版本，本包一行都不用改。另一条路（自己按 `siteConfig` 里的内容根三格扫目录）要跟着站点配置走，还会把草稿、`exclude` 那些判据抄第二份 —— `theme-git-badge` 的注入点更早（`loadContent()`，那时清单还不存在），所以它索性不按内容根筛，代价只是多判几个非页面的 markdown。

清单里的 `source` 不是 `@site/` 打头时官方那一位当场抛，本包不截字符串、不自己拼路径：宁可在构建里点名，也不要安静算出一条不存在的路径。

每页数完的那三格同时按 `source` 记进 `docs`（键是清单里那一条 `@site/…`），所以生成模块里既有「实例 + 版本」那几格，也有「一页一格」的明细。`page` / `folder` 要在浏览器里挑，那张表只能跟产物一起走；`instance` / `site` 仍由配置期那几格给出，浏览器只做挑选与合计，不重数文件。

## 「一个词」的码位表写死在这里

`src/count.mts` 里两把正则就是全部规则，改它等于改全站数字的口径：

- **CJK 按字**：假名（`\u3040-\u30ff`，含长音符）、汉字（扩展 A `\u3400-\u4dbf`、基本区 `\u4e00-\u9fff`、兼容表意 `\uf900-\ufaff`）、谚文音节 `\uac00-\ud7af`。这几段是明写的，不用 `Intl.Segmenter` —— 那个分词器按 locale 选，构建机上装的 ICU 版本换了，产物里的数就会漂。
- **其余按词**：`[\p{L}\p{N}][\p{L}\p{N}'’-]*`，以字母或数字开头，后面可带撇号与连字符，所以 `don't`、`web-page` 各算一个。数之前先把 CJK 换成空格，否则 `\p{L}` 认汉字，同一个字被数两遍。
- **中日韩标点不算**：`\u3000-\u303f`、`\uff00-\uffef` 那两段不在 CJK 类里，一个「。」不是一个词。
- **表外的汉字走拉丁那一路**：码位段只列常用那几段，扩展 B（平面 2，`CJK Unified Ideographs Extension B`）不在 CJK 类里，但带 `u` 标记的 `\p{L}` 认它，于是落进拉丁那一路 —— 结果还是一个词，与按字同一个数。真正会被数成「一段」的是表外那族连着写的多个字，本站没有那种内容。
- **markdown 语法符号自然不算**：`#`、`|`、反引号、链接的圆括号既不是字母也不是数字，两把正则都落不到它们身上。代码块与表格的**内容**因此在统计里（那是选定的口径，见 README 的「计数口径」），但那些符号本身一个词都不是。
- **frontmatter 不数**：正文由 `parseMarkdownFile()` 交回，那一段 YAML 已经剥掉了。用的解析器是 `siteConfig.markdown.parseFrontMatter`，也就是站点渲染这一页时那一份 —— 别的层包住它时，「剥掉的那一段」与「页面开头看不见的那一段」还是同一件事。标题行（`# 标题`）在正文里，照数。
- **指令不数**：`:::word-count` 那一行是看不见的语法，数之前由 `withoutWordCountDirectives()` 剥掉；围栏里的同名文字是示例正文，照数。

CJK 那把带 `u` 标记，而 `\u{…}` 的写法是配套的：去掉 `u` 标记，花括号会被当成量词，那一类当场变形状。

## 数算在配置期，铺成生成模块

`allContentLoaded` 是配置期唯一「所有插件的 content 都已到齐」的点（机制层铺那张规则表用的也是它），客户端打包在它之后，所以本包写进 `.docusaurus/` 的那一份赶得上第一次打包，数字因此在静态 HTML 里。`postBuild` 跑在 HTML 已经写完之后，那时算出来的数只赶得上下一轮构建。

生成模块只有那一句 `export const stats = <JSON>`，没有日期、没有 git 状态：同一份内容两次构建产物一样。浏览器侧读它的地址由 webpack 那条 `@generated` 别名给出，那一串路径必须与 `src/index.mts` 里 `STATS_FILE` 一致，它的类型来自 `types/word-count-specifiers.d.ts`。

那一份 JSON 里最大的一格是 `docs`（每页一条）。本站 54 页实测 4,639 字节（gzip 后 977 字节，每页约 86 / 18 字节）；只写 `instance` 的站点也照付这份大小 —— 这是 `page` / `folder` 能在浏览器里挑数的代价。想再压小就得把「这一页所在目录」也在配置期算成一张表，但那张表要么随目录数长，要么把同一份路径抄第二遍，当前没有这个必要。

数字在页面上直接写出来，不加千分位格式化：静态渲染与服务端注水要拼出同一个字符串，少一处格式化就少一处能漂的地方。

## 分组按「实例 + 版本」

`groups` 的键是 `实例 id\0版本显示名`，显示名没写时官方用版本名顶上（`version.label ?? version.versionName` 那一句）。本站两份实例因此各占一格（`default` 与 `themes`），不必读站点配置里那三格转述。同一份实例开了多个版本就占几格。

格子的顺序跟着清单走（实例、版本），所以同一份内容根每次都是同一份产物；`pages` 是那一格里数到的页数，不另数一遍。

## 四种范围各从哪儿取数

`instance`（缺省）在渲染期调 `useRouteContext()`，拿到的 `plugin.id` 就是这一块所属的 docs 实例：

- **路由上下文是 Docusaurus 自己挂的**：每棵插件路由树的顶上有一份 `__context`（本站生成物里是 `routesChunkNames` 的 `/-50b` 与 `/themes-1f2` 那两条），值是 `{ name: 'docusaurus-plugin-content-docs', id: <实例 id> }`；子路由继承它（`mergeContexts` 只把父层的 `plugin` 往下带），所以任意一篇文档的组件里读到的都是自己那棵树的实例。
- **它与配置期分组用的键同源**：`aggregateAllContent` 按 `plugin.options.id` 分组，`toPluginRoute` 写进路由上下文的也是 `plugin.options.id`。两侧不各写一份映射，也不发「页面 → 格」的表 —— 那份表要么随页数线性长大，要么得把同一个 id 抄第二遍。
- **它只能到实例，到不了版本**：所以 `instance` 显示的是各版本合计。`page` / `folder` 按文件地址挑，版本化的旧文档各看自己那一份。
- **不按 `pathname` 前缀猜**：运行时拿不到实例的 `routeBasePath`，slug、版本路径与尾斜杠都得自己归一，比路由上下文弱。
- **挑不出格就退回整份统计**：路由不是 docs、或者分组里没有这个实例时，块回到「全站」视图。指令可以写在 docs 以外的页面里，这条不是死分支；真走到了，页面上仍然是那份算好的数，不会安静消失。

`page` / `folder` 调 `useDoc()` 拿这一页的 `metadata`：

- **`metadata.source` 与清单里的 `source` 同源**：两边都是 `@site/<相对路径>`。`page` 直接用这个键去 `docs` 里取那一格（页数记 1）；取不到（开发期重载中间那一瞬）就退回全站，不安静显示 0。
- **`folder` 是前缀求和，不另存目录表**：取 `source` 最后一个 `/` 之前那一段做前缀（右侧带 `/`），对 `docs` 所有键求和。子目录天然以这个前缀打头，所以「含子目录」不需要额外的递归；`docs/guide/` 也收不到 `docs/guides/…`。
- **它不是按实例切的**：两个实例挂同一个目录时，那一块是两边合计。目录由文件地址算，不看 URL，也不管版本。
- **`useDoc()` 为什么只在 `page` / `folder` 里调**：它需要 `DocProvider`，而只有 docs 页面的 `DocItem` 包了那一层；`instance` 不需要它（`metadata` 里没有实例 id），`site` 更不需要。外层先按 `scope` 与路由分派到各自的子组件，所以这条 hook 不会在 docs 以外的页面里被调到。

`site` 直接读顶层那三个数与各格清单，不发路由上下文、也不调 `useDoc()`。

## 这一块为什么不用共用的视图外壳

`theme-markmap` / `theme-erd` / `theme-diff` 三条视图层共用 `packages/theme-component-page/lib/view-layer-shell.tsx`（错误边界 + `Suspense` + 放宽容器那段 CSS）。本包的 `WordCount` 这几样都不需要：数在配置期就算好了，读它只是一句对象取值，没有会失败的第三方初始化，也没有要等下载的 chunk；它又插在正文中间，宽度要跟正文那一栏，不能放开成整栏。

因此它不进那份共用外壳，`test/view-layer-copies.test.mts` 那三条视图层的清单也不含本包。

## 失败落点

配置期只有一种失败，且是故意的；渲染期的回退只有一种方向 —— 退回全站：

| 情况                                                   | 落点                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 清单里那一份文件在磁盘上读不到（或头部 YAML 解析不了） | 构建抛错，点名那一份文件                                                                                |
| 站点里没有 docs 实例（`allContent` 里没有清单可读）    | 三个数都是 0，块上显示「站点里还没有加载到任何文档」                                                    |
| 这一块的路由不属于 docs                                | 除 `site` 以外的范围都退回全站视图；指令可以写在 docs 以外的页面里，这条到得了                          |
| docs 页面里 `page` / `folder` 在明细里挑不出这一页     | 退回全站视图（开发期重载中间那一瞬会走到），不安静显示 0                                                |
| 那一份文件没按 MDX 解析（`markdown.format: 'md'`）     | 指令原样落成两行可见文字（那句 import 与 `<__WordCount scope="instance" />`），块不出现；构建本身不报错 |
| 站点没注册本层                                         | 预处理器没挂上，`:::word-count` 那一行原样当正文显示                                                    |

第一格不兜底：那一份文件本来就已经被 docs 实例加载过一次，走到这里读不到说明磁盘与清单对不上了。安静少数是这类统计最难发现的错，宁可红。

## 用例与红线

- 构建期判据：`test/word-count.test.mts` —— 指令改写（任意位置、四种范围各写进组件、不认的范围原样留下、容器式收尾、围栏与缩进代码块里不认、CRLF、无指令时原样交回）、预处理器包装（站点那份先跑、重复挂只一层）、计数侧剥指令，以及两把码位表的边界（纯 CJK / 纯拉丁 / 混排 / 空串、标点、`don't` 这类带分隔符的一个词）、`@site/` 地址反解、非 docs 实例的 content、`label` 与 `versionName` 两种落点、同一格重复出现与新开一格、多实例分组、每页明细的键与数，以及 `allContentLoaded()` 真的往一个临时 `generatedFilesDir` 写出那份模块。同一份还直接钉 `theme/WordCount/scope.ts`：本页取那一格、本文件夹含子目录且挡住名字相近的邻居、内容根根目录按整个根合计。`src/` 全份挂在覆盖率红线上（`vitest.config.mts` 的 `coverage.include` 盖住每个包的 `src/`）。
- 产物回读：`tools/scripts/verify-chain.mts` 第 4 节看两页构建出来的 HTML —— 有 `theme-admonition` 那一块、标题写着「内容根字数」。预处理器没挂上时这里红。
- 页面上那一块：`test/e2e/features/word-count.feature`（步骤在同名 `steps/word-count.steps.mts`）。**不**断言具体数字 —— 本站的内容根每加一页文档，总数就变。两棵内容根各有一页写指令（`/theme-word-count/docs/word-count-demo` 在 `default`、`/themes/` 在 `themes`），各断言「那一块在、只写自己那个实例、不出现另一个实例、正文仍在、位置就是指令那一处」；挑错时页面会退回全站合计，两个 id 都会露在块里，所以「不出现另一个」正好把那两种症状一起兜住。示例页把四种范围排在一起：本页那一块不写页数、本文件夹那一块写目录且页数大于 1、全站那一块列出两份实例，并断言四块的词数按「页 < 文件夹 < 内容根 < 全站」依次变大。另有一条反向：没写指令的页面这一块不出现。
- 入口交出的那一格：`test/package-entries.test.mts` 钉名字、层目录两格，以及 `loadContent()` 真的把 `markdown.preprocessor` 挂上、不再向 component-page 交规则。本包也在 `test/view-layer-copies.test.mts` 那份「带源码层的包」清单里 —— 那一格钉的是「不许在本包入口再补一条 TS 源码编译规则」。
- 站点自己那份配置里的说明在 `docusaurus.config.mjs` 的 `plugins` 清单里（为什么这一层不必转述内容根那三格）。
