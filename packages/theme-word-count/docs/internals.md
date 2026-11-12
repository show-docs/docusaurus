# theme-word-count 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、`:::word-count` 为什么走预处理器而不是 remark 插件、统计为什么读清单而不是扫目录、四种范围各从哪儿取数、「一个词」的码位表为什么写死、生成模块的形状与它凭什么稳定，以及改动时该跑哪几条判据。使用者要看的（怎么触发、页面上有什么、有哪些局限）在 [`README.md`](../README.md)，这里不重复。

## 组成

| 文件                                 | 编译吗              | 职责                                                                                                                                                                                                                 |
| ------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                      | ✅ `src/` → `dist/` | 入口：`loadContent()` 把预处理器包到站点那份 `markdown.preprocessor` 上、`allContentLoaded()` 算出全站统计并铺成生成模块、给出层目录                                                                                 |
| `src/directive.mts`                  | ✅                  | `:::word-count [page\|folder\|instance\|site]` 的扫描与改写：指令换成 `<__WordCount scope="…" />`、文首补一句 import；统计侧剥掉指令的那一份也在这里                                                                 |
| `src/content.mts`                    | ✅                  | 从 `allContent` 里各份 docs 实例的清单解回磁盘上的文件、逐页数一遍（按原文 memo，解析不动的告警后按 0 计），按「实例 + 版本」合一格，并把每页、每个实例、每个目录各记一份；另扫出哪几页写了哪种范围的指令（`usage`） |
| `src/measure.mts`                    | ✅                  | 一份正文的明细：markdown 按语法树逐节点数，非 markdown 的文档按整份文字数                                                                                                                                            |
| `src/aggregate.mts`                  | ✅                  | 逐字段相加、按目录一层层滚上去、全 0 的底；`instances` 与 `folders` 就是这里合出来的                                                                                                                                 |
| `src/count.mts`                      | ✅                  | 「一个词」的码位表与两种来源各数一种（CJK 按字、其余按词）                                                                                                                                                           |
| `src/stats-module.mts`               | ✅                  | 把统计渲染成那一份生成模块的文本（只有一句 `export const stats = <JSON>`）；按 `usage` 裁掉没写 `page` / `folder` 指令的每页 / 每目录明细                                                                            |
| `types/word-count.d.ts`              | ❌（随包发的声明）  | 四份形状：`WordCount` / `WordCountGroup` / `WordCountStats` / `WordCountScope`；`src/` 与 `theme/` 两侧都读它                                                                                                        |
| `types/word-count-specifiers.d.ts`   | ❌（随包发的声明）  | `declare module '@generated/theme-word-count/stats'`：浏览器侧那句 `import` 的类型从这来                                                                                                                             |
| `theme/WordCount/index.tsx`          | ❌ 站点编译         | 指令换出来的那一块：按 `scope` 挑本页 / 本文件夹 / 所在实例 / 全站那一格，摆成四栏明细（文件 / 文字 / 标题 / 正文结构）                                                                                              |
| `theme/WordCount/metrics.module.css` | ❌ 站点编译         | 四栏明细的排布：断点取自这一块自己的宽度（容器查询），够宽两行两列、窄了叠放；卡片与间距取 Infima 的 `.card` / `.card__body` 与 `--ifm-*`，字号与颜色跟正文走，只改外观，不碰数                                      |
| `theme/WordCount/scope.ts`           | ❌ 站点编译         | `page` / `folder` / `instance` 各查哪张表（纯函数，页面里不做加法，`test/word-count.test.mts` 直接钉）                                                                                                               |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/`，本包就不编译第二遍；口径的产地在
[plugin-compile-source 的维护者文档](../../plugin-compile-source/docs/internals.md) 的「这一族构建包的编译口径」。

## 指令走预处理器，不是 remark 插件

Docusaurus 的 `markdown` 配置里**没有** `remarkPlugins` 那一格：remark 插件按内容插件各配各的（docs / blog / pages 各有一列），主题包拿不到别的插件的选项，也改不了站点那份 `siteConfig.plugins`。主题层零配置能碰的全局 markdown 钩子只有 `markdown.preprocessor` —— mdx-loader 在 MDX 编译前拿文件原文调它一次（`@docusaurus/mdx-loader/lib/preprocessor.js`）。

于是改写分两步（`src/directive.mts`）：

1. **认行**：`^ {0,3}:::word-count[ \t]*$`，或者带范围的那一条 `^ {0,3}:::word-count[ \t]+(page|folder|instance|site)[ \t]*$`。范围只认这四个词，写错（`pages`、`PAGE`、多写一段）时两条都不匹配，整行原样留下。四格缩进是缩进代码块，围栏（` / ~~~）里的同形文字是示例 —— 扫描器自己维护围栏状态，收尾按 CommonMark 收紧：字符相同、长度不短于开头那一串、且不带信息串（```` `js ```` 这种行是围栏内的正文，不是收尾）。紧跟一行 `:::` 一并吃掉（容器式写法）。行尾 `\r` 单独拆出来，CRLF 文件不会被整份跳过。
2. **换行**：指令那一行换成 `<__WordCount scope="<那一格>" />`（没写范围就写 `instance`），并在 frontmatter 之后（没有 frontmatter 就是第 0 行）插一句 `import __WordCount from '@theme/WordCount';`。范围显式写进组件：浏览器那一侧只有一条读法，不必再猜「没写是什么」。ESM 与 JSX 都只在 MDX 文件里成立，所以这一份文件必须按 MDX 解析：站点把 `markdown.format` 配成 `'md'` 时，`@mdx-js/mdx` 把这两行各铺成一个段落（实测），页面上多出两句可见文字、块不出现（README 的「已知限制」）。

**为什么补 import，而不是把组件登记进全局 `theme/MDXComponents`**：后者要求本层覆盖（swizzle）`@theme/MDXComponents` 那一格。站点如果自己 swizzle 了同一格，全局赢家换成站点那份，本层登记的那一个组件名就没了，而指令换出来的 `<WordCount />` 会在渲染期变成「Element type is invalid」—— 构建全绿、页面崩，症状与原因隔着一整层。每页一句 import 自成一体：不依赖任何别的层，站点换掉 `src/theme/WordCount` 也能生效。

绑定名带 `__` 前缀（`__WordCount`）是给「本包生成」留一个记号：作者自己 import 一个叫 `WordCount` 的组件不会撞名；真撞了也是编译期重复声明，不是安静的渲染错。

**站点自己那份预处理器照跑**：包装按「先 base、后本层」调用（`wrapPreprocessor`），所以站点那份先按原样处理文件，本层在它的结果上认指令。函数上带 `Symbol.for('@show-docs/docusaurus-theme-word-count')` 记号，`reloadSite()` 重跑插件时不会套第二层。

**统计侧剥的是同一个扫描器**：`withoutWordCountDirectives()` 只去掉指令（与收尾）那几行，围栏里的示例照旧留在正文里。于是「指令算不算词」与「哪些行是指令」只有一份判断，不会出现改写认了、计数不认。

## 统计读的是清单，不是目录

`allContentLoaded({ allContent })` 拿到的是**所有插件加载完的那一份清单**。各 docs 实例在此之前已经把 `include` / `exclude`、草稿、版本化目录那些事算完了，剩下的 `docs` 那一列就是「这一份实例会渲染哪些页」。本包只把每一条的 `source`（`aliasedSitePath()` 写出来的 `@site/…`）用官方那一位 `aliasedSitePathToRelativePath` 解回磁盘上的文件。

于是「统计覆盖了哪些页」与「站点渲染了哪些页」天然是同一份口径：站点多一棵内容根、换一条 `include`、开一个版本，本包一行都不用改。另一条路（自己按 `siteConfig` 里的内容根三格扫目录）要跟着站点配置走，还会把草稿、`exclude` 那些判据抄第二份 —— `theme-git-badge` 的注入点更早（工厂期，那时清单还不存在），所以它索性不按内容根筛，代价只是多判几个非页面的 markdown。

清单里的 `source` 不是 `@site/` 打头时官方那一位当场抛，本包不截字符串、不自己拼路径：宁可在构建里点名，也不要安静算出一条不存在的路径。

每页数完的那一整格同时按 `source` 记进 `docs`（键是清单里那一条 `@site/…`）；同一轮里实例合计进 `instances`、按目录一层层滚上去的合计进 `folders`（每一格都含子目录）。这三张表就是浏览器侧能挑的全部范围：`page` / `folder` / `instance` 只查表，页面里不做加法，也就不存在第二份求和口径。`site` 用顶层那一整格。

草稿在生产构建里被官方分到 `version.drafts`，开发模式里留在 `version.docs`：两列并起来读，各读一次，所以两种模式下页数一样。

## 正文按语法树数：文本、结构与标题 id

`src/measure.mts` 把正文交给与站点同一族解析器（`unified` + `remark-parse` + `remark-mdx` + `remark-gfm` + `remark-frontmatter`），解析一次、走一遍：

- `text` / `inlineCode`：词与字符都加。
- `code`：词、字符、段数与行数；围栏语言是 `mermaid` / `kroki` 的记「描述性图表」，不算代码段。
- `heading`：按 `depth` 记 `h1`…`h6`；末尾显式写了 id 的另记 `headingIds`。
- `table` / `image` / `link` / `linkReference` / `blockquote`：各记一格；链接按 `http(s):` 分内外。
- `yaml`：只记 `frontmatter` 数量，那一段的内容不进词数。

**为什么不用正则扫原文**：围栏里的一行 `# 不是标题` 会被当成标题，链接地址里的字母会被当成词。语法树与站点编译这一页时看到的正文同源，结构行才有形状。

**标题 id 有两种写法**：经典写法 `{#custom-id}` 在 MDX 里不是合法表达式（acorn 报错），站点预处理器先调 `escapeMarkdownHeadingIds` 把它转成转义形式。这里解析前调同一句转义，解析回来后文字节点的 `value` 又是不带反斜杠的 `{#custom-id}`。MDX 注释写法（`{/*` 开头、星号加斜杠收尾，中间写 `#custom-id`）解析成一格 `mdxTextExpression`。两种都只认标题的最后一个子节点，标题以行内代码或强调收尾时不算。

**非 markdown 的文档**（本站是 `.dbml`）：它不按 MDX 编译，硬套解析器会当场报 acorn 错（`Table … {` 在 MDX 眼里是一个表达式）。于是按扩展名分两条路：非 `.md` / `.mdx` 用站点剥好的正文按文字数，结构各行记 0 —— 那一页仍在清单与合计里，不因为「没有语法树」而消失。

## 「一个词」的码位表写死在这里

`src/count.mts` 里两把正则就是全部规则，改它等于改全站数字的口径：

- **CJK 按字**：假名（`\u3040-\u30ff`，含长音符）、汉字（扩展 A `\u3400-\u4dbf`、基本区 `\u4e00-\u9fff`、兼容表意 `\uf900-\ufaff`）、谚文音节 `\uac00-\ud7af`。这几段是明写的，不用 `Intl.Segmenter` —— 那个分词器按 locale 选，构建机上装的 ICU 版本换了，产物里的数就会漂。
- **其余按词**：`[\p{L}\p{N}][\p{L}\p{N}'’-]*`，以字母或数字开头，后面可带撇号与连字符，所以 `don't`、`web-page` 各算一个。数之前先把 CJK 换成空格，否则 `\p{L}` 认汉字，同一个字被数两遍。
- **中日韩标点不算**：`\u3000-\u303f`、`\uff00-\uffef` 那两段不在 CJK 类里，一个「。」不是一个词。
- **表外的汉字走拉丁那一路**：码位段只列常用那几段，扩展 B（平面 2，`CJK Unified Ideographs Extension B`）不在 CJK 类里，但带 `u` 标记的 `\p{L}` 认它，于是落进拉丁那一路 —— 结果还是一个词，与按字同一个数。真正会被数成「一段」的是表外那族连着写的多个字，本站没有那种内容。
- **markdown 语法符号自然不算**：`#`、`|`、反引号、链接的圆括号既不是字母也不是数字，两把正则都落不到它们身上。代码块与表格的**内容**因此按 `text` / `code` 节点进统计（见上一节），但那些符号本身一个词都不是。
- **frontmatter 不数**：markdown 的正文原样进语法树，头部那段是 `yaml` 节点，只记 `frontmatter` 数量；非 markdown 的文档用 `parseMarkdownFile()` 剥好的正文。两处「哪一段算头部」都来自 `siteConfig.markdown.parseFrontMatter`，也就是站点渲染这一页时那一份 —— 别的层包住它时，剥掉的那一段与页面开头看不见的那一段还是同一件事。标题行（`# 标题`）在正文里，照数。
- **指令不数**：`:::word-count` 那一行是看不见的语法，数之前由 `withoutWordCountDirectives()` 剥掉；围栏里的同名文字是示例正文，照数。

CJK 那把带 `u` 标记，而 `\u{…}` 的写法是配套的：去掉 `u` 标记，花括号会被当成量词，那一类当场变形状。

## 数算在配置期，铺成生成模块

`allContentLoaded` 是配置期唯一「所有插件的 content 都已到齐」的点（机制层铺那张规则表用的也是它），客户端打包在它之后，所以本包写进 `.docusaurus/` 的那一份赶得上第一次打包，数字因此在静态 HTML 里。`postBuild` 跑在 HTML 已经写完之后，那时算出来的数只赶得上下一轮构建。

**dev 下只重数改过的那一份**：改一份文档会让所有插件的 `allContentLoaded()` 重跑（`reloadPlugin()`），于是这一步每轮都把整份清单再过一遍。逐文件的明细按原文 memo（`content.mts` 里那张 `cache`）：同一份路径 + 同一份原文 + 同一份解析器引用，直接交回上一轮的结果，只有真改过的那一份才重新走语法树。`reloadSite()` 重跑工厂会换一份解析器引用，那几份自然失效重数。渲染出来的模块与磁盘上那份一字不差时**不写盘**：写一遍会让打包器重编这份模块、浏览器跟着白刷一次，而 dev 下改一份与统计无关的文件也会重跑这一步。

生成模块只有那一句 `export const stats = <JSON>`，没有日期、没有 git 状态：同一份内容两次构建产物一样。浏览器侧读它的地址由 webpack 那条 `@generated` 别名给出，那一串路径必须与 `src/index.mts` 里 `STATS_FILE` 一致，它的类型来自 `types/word-count-specifiers.d.ts`。

**只铺浏览器会查的那几格**：合计、`groups`、`instances` 照旧全铺（`site` / `instance` 范围读它们）；`docs`（每页一整格）与 `folders`（按目录滚上去的合计）只铺正文里真写了 `page` / `folder` 指令的那几格。裁的判据是配置期扫出来的 `usage`（哪页写了哪种范围），与数词、改写指令共用同一个扫描器、看同一份原文，所以「铺了哪几格」与「正文里会出现哪种范围」天然一致。本站五十多页里只有一页（示例页）写 `page` / `folder`：整份从 46,298 字节（gzip 3,974）降到 3,753 字节（gzip 912），裁掉的就是用不到的每页 / 每目录明细。`folder` 范围因此在浏览器侧直接查 `folders`，不拿「本页在不在 `docs` 里」当前提 —— 写了 `folder` 的页未必写了 `page`。

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

- **`metadata.source` 与清单里的 `source` 同源**：两边都是 `@site/<相对路径>`。`page` 直接用这个键去 `docs` 里取那一整格（页数就是这一页记的 1；生成模块只铺写了 `page` 指令的页，见「数算在配置期」一节）；取不到（开发期重载中间那一瞬）就退回全站，不安静显示 0。
- **`folder` 查的是配置期合好的那张表**：取 `source` 最后一个 `/` 之前那一段当键，去 `folders` 里取。`folders` 在 `aggregate.mts` 里由每页往上滚出来：每一页记进自己的目录，再一层层记到根，所以每一格都含所有子目录，`docs/guide` 也收不到 `docs/guides/…`（键按整段目录比，不做字符串前缀）。页面里不做前缀求和。
- **它不是按实例切的**：两个实例挂同一个目录时，那一块是两边合计。目录由文件地址算，不看 URL，也不管版本。
- **`useDoc()` 为什么只在 `page` / `folder` 里调**：它需要 `DocProvider`，而只有 docs 页面的 `DocItem` 包了那一层；`instance` 不需要它（`metadata` 里没有实例 id），`site` 更不需要。外层先按 `scope` 与路由分派到各自的子组件，所以这条 hook 不会在 docs 以外的页面里被调到。

`instance` 取的是 `instances[plugin.id]`：配置期 `content.mts` 在数每一页时就把那一格加进对应实例，页面里只查表，不在各版本之间再做一次求和。

`site` 直接读顶层那一整格，不发路由上下文、也不调 `useDoc()`。

## 这一块为什么不用共用的视图外壳

`theme-markmap` / `theme-erd` / `theme-diff` 三条视图层共用 `packages/theme-component-page/lib/view-layer-shell.tsx`（错误边界 + `Suspense` + 放宽容器那段 CSS）。本包的 `WordCount` 这几样都不需要：数在配置期就算好了，读它只是一句对象取值，没有会失败的第三方初始化，也没有要等下载的 chunk；它又插在正文中间，宽度要跟正文那一栏，不能放开成整栏。

因此它不进那份共用外壳，`test/view-layer-copies.test.mts` 那三条视图层的清单也不含本包。

## 失败落点

配置期数不动的那一份告警后按 0 计，不红；渲染期的回退只有一种方向 —— 退回全站：

| 情况                                                      | 落点                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 清单里那一份文件在磁盘上读不到（或头部 YAML 解析不了）    | 告警点名那一份文件，那一页按「1 页、各项 0」计，其余各页照常，构建不红                                  |
| 一份 `.md` / `.mdx` 的正文不是合法 MDX                    | 同上：告警里带着那一份文件的路径，按 0 计（非 markdown 的文档走文字那条路，不受影响）                   |
| 站点里没有 docs 实例（`allContent` 里没有清单可读）       | 各项都是 0，块上显示「站点里还没有加载到任何文档」                                                      |
| 这一块的路由不属于 docs                                   | 除 `site` 以外的范围都退回全站视图；指令可以写在 docs 以外的页面里，这条到得了                          |
| docs 页面里 `page` 挑不出这一页 / `folder` 挑不出那格目录 | 退回全站视图（开发期重载中间那一瞬会走到），不安静显示 0                                                |
| 那一份文件没按 MDX 解析（`markdown.format: 'md'`）        | 指令原样落成两行可见文字（那句 import 与 `<__WordCount scope="instance" />`），块不出现；构建本身不报错 |
| 站点没注册本层                                            | 预处理器没挂上，`:::word-count` 那一行原样当正文显示                                                    |

前两格告警而不红：少一排数字不该让整站构建失败 —— 与 git-badge「读不到就不读」同一条取舍。告警里带着文件路径，所以也不是安静少数：日志里找得到是哪一页没数成。失败的那一份不进 memo，下一轮读得到了或原文变了照常重数。唯一仍当场抛的是 `source` 不是 `@site/` 打头那一种（见「统计读的是清单」一节）：那是清单形状坏了，不是某一份文件数不动。

## 用例与红线

- 构建期判据：`test/word-count.test.mts` —— 指令改写（任意位置、四种范围各写进组件、不认的范围原样留下、容器式收尾、围栏与缩进代码块里不认、带信息串的行不算收尾、CRLF、无指令时原样交回）、预处理器包装（站点那份先跑、重复挂只一层）、计数侧剥指令；两把码位表的边界（纯 CJK / 纯拉丁 / 混排 / 空串、标点、`don't` 这类带分隔符的一个词）；`measureMarkdown()` 按节点各数一格（文字与行内代码、六级标题与两种标题 id、空标题不抛、代码围栏与图表、表格 / 图片 / 内外链接 / 引用、frontmatter 与草稿）与非法 MDX 告警后按 0 计；`measureText()` 那条非 markdown 的路；`aggregate.mts` 的逐字段相加与目录往上滚；`@site/` 地址反解、`docs` 与 `drafts` 两列都读、非 docs 实例的 content、`label` 与 `versionName` 两种落点、同一格重复出现与新开一格、多实例分组、每页 / 每实例 / 每目录三张表、读不到或解析不动时告警按 0 计（其余各页照常）、原文没变的那几份第二遍不再调解析器（memo），以及 `allContentLoaded()` 真的往一个临时 `generatedFilesDir` 写出那份模块、没写 `page` / `folder` 指令的页不铺每页 / 每目录明细、数没变就不重写那份模块。`directiveScopes()` 报出每条指令的范围（围栏里不算）。`renderStatsModule()` 按 `usage` 裁明细而合计与分组不动。同一份还直接钉 `theme/WordCount/scope.ts`：本页与内容根各取那一格、本文件夹查配置期那张表（含子目录、挡住名字相近的邻居）。`src/` 全份挂在覆盖率红线上（`vitest.config.mts` 的 `coverage.include` 盖住每个包的 `src/`）。
- 产物回读：`tools/scripts/verify-chain.mts` 第 4 节看两页构建出来的 HTML —— 有那一块（`aria-label` 写着「内容根字数」）。预处理器没挂上时这里红。
- 页面上那一块：`test/e2e/features/word-count.feature`（步骤在同名 `steps/word-count.steps.mts`）。**不**断言具体数字 —— 本站的内容根每加一页文档，总数就变。两棵内容根各有一页写指令（`/theme-word-count/docs/word-count-demo` 在 `default`、`/themes/` 在 `themes`），各断言「那一块在、只写自己那个实例、不出现另一个实例、正文仍在、位置就是指令那一处」；挑错时页面会退回全站合计，两个 id 都会露在块里，所以「不出现另一个」正好把那两种症状一起兜住。明细另钉「各项彼此自洽」：中日韩文字 + 其余文字 = 词数、字符数大于 0；本页那一块的文件数量是 1。示例页把四种范围排在一起：本文件夹那一块写目录且文件数量大于 1、全站那一块列出两份实例，并断言四块的词数按「页 < 文件夹 < 内容根 < 全站」依次变大。另有一条反向：没写指令的页面这一块不出现。
- 入口交出的那一格：`test/package-entries.test.mts` 钉名字、层目录两格，以及 `loadContent()` 真的把 `markdown.preprocessor` 挂上、不再向 component-page 交规则。本包也在 `test/view-layer-copies.test.mts` 那份「带源码层的包」清单里 —— 那一格钉的是「不许在本包入口再补一条 TS 源码编译规则」。
- 站点自己那份配置里的说明在 `docusaurus.config.mjs` 的 `plugins` 清单里（为什么这一层不必转述内容根那三格）。
