# plugin-frontmatter-injector：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：路线的取舍、踩过的坑与实测证据、升级时要复跑的检查单。
使用者侧的事实（接入、规则表、口径）在 [`../README.md`](../README.md)。

## 组成

四个文件，`src/` 下：

| 文件             | 职责                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `rules.mts`      | 规则表、「最近」的判定与 `tags` 的合并：`defaultRules` / `applyRules` / `tagsOf` / `mergeTags` |
| `docs-scope.mts` | 地盘：文档插件的 `path` / `include` / `exclude` 折成一个 `covers()`                            |
| `git-info.mts`   | 读 git：仓库根、HEAD、最近动过的文件、每份文件的提交时刻                                       |
| `index.mts`      | 包装 `parseFrontMatter` 与插件接线（`loadContent()`）                                          |

切四份是因为 git 那一侧能独立测（真仓库），规则表是纯函数，地盘是「一堆 glob 的边角」，
接线要假解析器 —— 几种夹具互不相干。
对外只丢规则与 git 那几样纯函数，接线细节不外露。

**类型不自己画。** 解析器的入参与结果一律从官方取：`ParseFrontMatter` 直接 import，
结果那格写成 `Awaited<ReturnType<ParseFrontMatter>>`。留白的只有一处：包进来的是
「`RuleContext` 里那份 frontmatter」而不是整个结果 —— 规则表只写 `frontMatter`，正文不该
出现在它的视野里，包装层原样透传剩下的格子。

源码在 `src/`，`dist/` 是编译产物（`rootDir` = `src/`），改完源码要 `pnpm build:core`。

## 为什么是这条路

frontmatter 有三条消费路径，弄清它才谈得上「注入点」：

| 消费方                              | 什么时候读                            | 从哪读                                   |
| ----------------------------------- | ------------------------------------- | ---------------------------------------- |
| docs / blog 插件（`loadContent`）   | 产出侧边栏、`slug`、`draft` 标记      | `markdown.parseFrontMatter`              |
| `@docusaurus/mdx-loader`（每个 md） | 生成 `export const frontMatter = {…}` | 同一个 `markdownConfig.parseFrontMatter` |
| 浏览器                              | `props.content.frontMatter.xxx`       | mdx-loader 的产物                        |

关键事实：**mdx-loader 不自己解析 yaml**，它调的是 `options.markdownConfig.parseFrontMatter`，
而这个 `markdownConfig` 在 docs 插件里就是 `context.siteConfig.markdown` **本身**（同一个对象引用，
不是拷贝）。于是四条路线的取舍是：

| 路线                                     | 能做到                             | 代价                                                                       |
| ---------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| 换掉 `markdown.parseFrontMatter`（本包） | 元数据与 MDX 产物同时变            | 接管站点级单例，必须自己维护「谁包谁」与幂等                               |
| `markdown.preprocessor`                  | 改 yaml 文本本身，后续一切自然生效 | 它是 `markdown` 的配置项，**插件在 init 阶段改已经太晚**；且全局无过滤     |
| `enforce: 'post'` 的 webpack loader      | 给 MDX 产物多加一个命名导出        | 改不了 `frontMatter`（同名导出会 `Duplicate declaration`），只能开旁路通道 |
| 直接改磁盘上的 md                        | 最直观                             | 构建有副作用、dev 模式反复重编译、CI 上脏工作区                            |

本包选第一条。第二条留给「要让 markdown 之外的工具也看见」的场景，那条不是插件能封装的。

## 五个坑

1. **接线必须早于 docs 插件的 `loadContent()`，所以只能放在 `loadContent()`。** 这一条是
   实测踩出来的：`executeAllPluginsContentLoading()` 用 `Promise.all()` 把**所有插件**的
   `loadContent()` 一起跑，而 `@docusaurus/plugin-content-docs` 的 `loadContent()` 第一件事就是
   `const { parseFrontMatter } = context.siteConfig.markdown` —— 它读下来的是**函数引用**，
   此后站点配置上那个属性再被换掉，docs 手上那份还是旧的。于是把接线放在 `contentLoaded()`
   （更晚一整个阶段）会得到一个很像 bug 的现象：mdx-loader 读的是属性、拿到新的那份，所以
   MDX 产物里有注入；侧边栏 / `slug` / `draft` 走的是 docs 手上那份，完全没有 —— 「配置写了
   却不生效」。
   放在 `loadContent()` 里就对了：`MarkdownConfigSchema` 的 `parseFrontMatter` 是 Joi
   `function().default(...)`，`validateConfig()` 跑在插件实例化之前，所以进 `loadContent()`
   时那一格一定已经是函数，包装它不会覆盖掉官方默认值。
2. **`siteConfig.markdown` 是插件之间的共享可变对象。** 构造函数里「读到什么」取决于谁先跑完
   （`initPlugins()` 也是 `Promise.all()`），所以接线不在构造函数里做，而在 `loadContent()` 里
   现取现包：那时别的插件的构造函数都跑完了，包到的是别人写完的那一份。
3. **别覆盖，要包装。** 站点自己可能在 `markdown.parseFrontMatter` 里接 CMS。后跑的插件直接赋值
   = 把先跑的那份整个吞掉，而且不报错。`wrapParseFrontMatter()` 的语义是「`base` 先跑，
   注入叠在结果上」，于是三份（官方的、站点的、本包的）能叠成一条链。
4. **参数必须原样透传。** 入参的类型就是官方 `ParseFrontMatter` 那一份，
   `defaultParseFrontMatter` 是其中的必填格子（mdx-loader 每次调用都会带），而站点可能根本
   没在配置里写 `parseFrontMatter`（那时 `siteConfig.markdown.parseFrontMatter` 是官方填进去的
   默认值，未必等于 loader 手上那份）。抓闭包里的那份、或替调用方兜一个默认值，都会让「两处
   版本错位」变成两份不同的 frontmatter —— 前端一份、侧边栏一份，查起来极贵。
5. **`reloadSite()` 会重跑插件。** dev 模式下改 `docusaurus.config.mjs` 就是这样重来的：
   `reloadPlugin()` 只重跑 `contentLoaded()`，其余阶段不重跑 —— 这就是入口两处都调同一个
   `install()` 的原因。同一份解析器被套两次，每条规则就算两次，所以包装层带一个
   `Symbol.for(...)` 记号，见到记号直接交回同一个函数，不会套第二层。

## git 那一侧：一次读，之后查表

「最近」要按文件判，而每份文件判一次就是一个 subprocess —— 几百页 md 就是几百次 `git`，
这才是慢的来源。做法是**分层缓存**：

1. **整仓读一次**（`openRepo()`，`loadContent()` 现取现包那一下）。两次 `git log`，两条口径各一次：

   | 命令                                                        | 给什么                                  |
   | ----------------------------------------------------------- | --------------------------------------- |
   | `git log --max-count=5 --format=%x01%ct --name-only`        | HEAD 的时刻 + 最后 5 个提交改过哪些文件 |
   | `git log --since='7 days ago' --format=%x01%ct --name-only` | 窗口内的全部提交改过哪些文件            |

   两条都**不带 `--max-count` 混用**：带上就成了「最后 5 个里还落在窗内的」，两条口径会被悄悄
   并成一条（实测：`--since` + `--max-count` 会把 21 天前那次提交筛掉）。

2. **逐文件读、读过就记**（`timesOf()`）。只在文件真的被问到时才花这两下，而且**按文件缓存**：
   同一份文件第二次问（`reloadSite()`、或 docs 插件与 mdx-loader 各问一次）不再走 git。

### 每份文件的那两个时刻

```
git log --follow --format= --name-only -- <path>   # 数这份文件被提交过几次
git log -1 --follow --format=%ct -- <path>         # 最后一次是什么时候
```

- `--format=` 把提交头清空，只留文件名那一行；重命名那一步会吐两行（新名在前、旧名在后），
  所以先按 `repoPath()` 把「等于这条路径」的那一行留下 —— 不留就把一次提交数成两次。
- **只提交过一次**的那份文件，`created` 与 `updated` 是同一刻，于是「新建」与「最近更新」
  同时成立（刚建的文件本来也就刚动过）。
- 一条历史都没有（没提交过、或压根不在这个仓库里）时两个时刻都是 `undefined`：不猜。

### 边界

- **读不到就不读。** `findRepoRoot()` 用 `spawnSync` 问 `git rev-parse`：git 退出 128（不在仓库里、
  仓库坏了）与「git 不在 PATH」都只是 `undefined`，注入退回「只有配置里那份标签」。这条构建不该
  因为一份 README 少两个标签而失败。
- **仓库根要解析软链。** `/tmp` 在 macOS 上是 `/private/tmp` 的软链；Docusaurus 给的 `filePath`
  与 `git rev-parse` 给的那条不在同一套写法上时，「这条路径在不在这个仓库里」就判错了。
- **只看 `HEAD` 那条历史。** 工作区里未提交的改动不算「最近动过」—— 站点产物要能复现，
  拿工作区当判据就成了「谁本地改一下谁就变新」。

## 规则表的三条语义

- **只补不覆盖**：键已经在了就不碰、算值那一步也不跑。理由是「规则表」不该变成「谁来都能改
  站点写过的东西」。
- **`tags` 是唯一的例外**：那一把键是并集语义 —— 页面自己写的几条与 `git-new` /
  `git-update` 说的是不同的事，谁让位都会丢信息。所以它走 `mergeTags()`：去重、排序
  （排序是为了「同一个组合只有一种写法」，否则页面里换个顺序也会被当成改动），
  写进 frontmatter 的一定是数组；页面写了别的形状（数字、带对象的数组）就原样交回 ——
  那是页面的事，本插件不替它改类型。
  实现上要留神一处：合并前后一模一样时**不能算「补过」**，否则包装层会以为变了、白换一个对象。
- **函数不拿原值**：上一条决定了键不存在才会算，所以函数签名里没有 `current`（`tags` 那条例外
  由 `applyRules()` 自己取旧值，函数仍然只负责「算出注入的那一份」）。要按原文推值就
  自己去问 `context`（`filePath`、此刻的 frontmatter、打开的那个仓库都在里面）。
  返回 `undefined` = 不表态，那一格不写 —— 否则 frontmatter 上会多出一格 `key: undefined`
  （`Object.keys` 数得着、`JSON.stringify` 看不见）。
- **算值可以是异步的**：`applyRules` 收 Promise。git 那条路本质上是异步的（真的 subprocess），
  硬写成同步会把「读不了 git 就少两个标签」变成「读不了 git 就抛」。

## 地盘：为什么是「转述」

页面这个概念由 `@docusaurus/plugin-content-docs` 定义（`docs.path` / `docs.include` /
`docs.exclude`），而这三格通常写在站点自己的预设里 —— 本插件在插件选项里拿不到别人实例化后的
选项（`initializedPlugins` 只有实例，`options` 不外露，且 `loadContent()` 是 `Promise.all()`
一起跑的）。所以口径是：**站点把这三格再写一遍给本插件**。本仓的做法是把清单提成
`docusaurus.config.mjs` 顶部的 `DOCS_INCLUDE` / `DOCS_EXCLUDE` 两个常量，两处引同一份，
不让它漂。

匹配交给 `@docusaurus/utils` 的 `createAbsoluteFilePathMatcher`（`Globby` 底下的 micromatch），
不是自己写一遍。两个踩过的点：

1. **同源的不是 glob 写法，是那两格折法。** 文档插件扫文件走
   `Globby(options.include, {cwd: 内容根, ignore: options.exclude})`（实测
   `@docusaurus/plugin-content-docs/lib/docs.js`），而 Globby 底下就是 micromatch —— 两边本来就是
   同一个匹配引擎，同一套语义（实测 micromatch 4.0.8 + globby 11.1.0：`**/*.md` 两边都收
   `packages/README.md`，`.hidden/x.md` 两边都在 `dot` 缺省下不收）。真正要照抄的是它旁边的两格：
   绝对路径先折成「相对内容根」（官方匹配器只认自己那棵根，喂进去别处的路径直接抛），以及
   `ignore` 压过 include。自己写一遍就是这两格容易漂。
2. **`include` / `exclude` 是「相对内容根」的 glob**，所以 `build/**` 只管得到内容根下第一层，
   包目录里的 `<pkg>/build/**` 照样收得进来 —— 得写成 `**/build/**`。本仓的 exclude 原来就是
   `build/**`，这一版一并改了（文档插件那边同样受益：那些产物里的 `README.md` 副本本来会被当成
   页面）。

`exclude` 不兜官方缺省（`**/_*` / `**/__tests__`）：那几条是「扫描时顺手跳过」，不是「这些文件
不归文档插件管」，本插件没有「反正它也不扫」的前提可用。`include` 兜官方的缺省值
（`**/*.{md,mdx}`）：站点没转述时至少「md 才算页面」这条还在。

判据落在两层：包装层先问一次（`hit` 为空就原样交回，连 git 都不问），`applyRules()` 里再问一次
（它是对外导出的纯函数，自己也得站得住）。

## 已知限制

**这条路上没有任何钩子能拦住「后来者直接替换 `parseFrontMatter`」。** 插件是直接赋值的，
docusaurus 之后也不会再回头检查。要降低风险只有一条：本插件放在 `plugins` 数组里靠前的位置，
让自己的包装成为「先包的那一层」，后来者即便是替换，至少替换掉的是一份能跑的实现
（而不是把三份全丢掉）。这是约定，不是护栏。

## 升级检查单

`parseFrontMatter` 是官方配置项（`@docusaurus/types` 的 `MarkdownConfig`），但下面这两条是
**时序**结论，不是承诺。升 core 之前/之后跑一遍：

1. `node_modules/@docusaurus/core/lib/server/plugins/plugins.js` 里
   `executePluginContentLoading()` 仍是「先 `loadContent()`、后 `contentLoaded()`」，且
   `executeAllPluginsContentLoading()` 仍用 `Promise.all()` 把各插件的 `loadContent()` 一起跑；
2. `node_modules/@docusaurus/mdx-loader/lib/loader.js` 里 `loadMDX()` 仍读
   `options.markdownConfig.parseFrontMatter`（而不是自己 import 一份）；
3. `@docusaurus/plugin-content-docs` 的 `doProcessDocMetadata()` 仍在 `loadContent()` 里就
   `const { parseFrontMatter } = context.siteConfig.markdown`（**早于**本插件的 `contentLoaded`），
   且 `MarkdownConfigSchema` 的 `parseFrontMatter` 仍是带默认值的 Joi `function()`；
4. `pnpm test`（`test/frontmatter-injector.test.mts` 里有一条用例真的调
   `@docusaurus/utils` 的 `DEFAULT_PARSE_FRONT_MATTER`，第 1、2 条漂了它会红）；
5. `pnpm build` 之后读一眼产物：本仓站点那条规则写的 `sidebar_custom_props` 落在
   `.docusaurus/docusaurus-plugin-content-docs/default/*.json` 的 `frontMatter` 里，
   `build/assets/js/*.js` 里也能找到那一格 —— 两侧同源才算真的注进去了。
6. 地盘那条判据从产物回读最省事：产物里出现过的每一份 md/mdx 都出自站点扫出来的那批文件，
   而**站点里不存在的**文件（`tools/README.md`、`test/README.md`、`node_modules` 下那些
   `README.md` 副本）不该出现在产物里；`.dbml` 那种页面同样受站点那条规则的 `match` 管。

第 5 条是唯一「从产物回读」的判据，也是唯一能证伪「注入只在 MDX 那边生效、侧边栏没跟上」
的那条分支的判据 —— 两条路读的是同一个函数，但它们不是同一次调用（第 1、3 条讲的就是
这两次调用的先后）。

## 与站点的其它 markdown 手段怎么共存（谁先谁后）

一句话：**本插件只给 `markdown.parseFrontMatter` 换值，`markdown` 这个对象本身没换、兄弟键
一个没动，所以 `preprocessor` / `remarkPlugins` / `format` 都照旧跑。** 唯一会咬人的是
「整体替换 `siteConfig.markdown`」那种写法 —— 那是另一件事，见后面「设计禁区」。

### 一、现状：只动一格，且是包装

本插件对 `siteConfig.markdown` 只有一句写操作（`src/index.mts`）：

```js
markdown.parseFrontMatter = wrapParseFrontMatter(
  markdown.parseFrontMatter,
  rules
);
```

于是：

| 配置项                                         | 现在                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `parseFrontMatter`                             | 包了一层；站点自己那份（接 CMS / 自己解 yaml）先跑，注入叠在结果上 |
| `preprocessor`                                 | 没被读写，引用不变，mdx-loader 照旧在编译时调它                    |
| `beforeDefaultRemarkPlugins` / `remarkPlugins` | 没被碰；拿到的是**注入后**的 `vfile.data.frontMatter`              |
| `format` / `renderer` / 其它                   | 没被碰                                                             |

`pnpm test` 里两条用例钉住这半边：`preprocessor` / `format` 的**引用**不变；注入只改
`frontMatter`，`content`（含没转义的 `{#custom}`）原样交回。

住这条线边上的一句话值得记：注入发生在解析之后、编译之前，所以正文侧的插件看到的是注入后
那份 `frontMatter`。谁想在 remark 链里读「这个文件原本写了什么」，对被注入的键会读不到。

### 二、设计禁区：不要整体替换 `siteConfig.markdown`

这是「别这么写」的说明，不是「现在有问题」。原因在于它是个**共享可变对象**：docs 插件在
自己的 `loadContent()` 里解构走 `parseFrontMatter`，mdx-loader 则在**编译时**才读
`preprocessor` / `format`。谁把 `markdown` 整个换掉（`siteConfig.markdown = {...}`），或者
给 `preprocessor` 赋一份自己的实现，就等于把这些键从链路上摘了下来 —— 而且**不报错**。

`preprocessor` 默认干的那件事，`parseFrontMatter` 替代不了：

```text
escapeMarkdownHeadingIds()   ## 中文标题 {#custom}  →  ## 中文标题 \{#custom}
MDX v2 的 acorn 不认识裸 `{#custom}`，靠这一步先转义
```

实测（`format=mdx`，把 `preprocessor` 摘掉）：

| 正文                    | 不跑 preprocessor          | 跑了 preprocessor |
| ----------------------- | -------------------------- | ----------------- |
| `## 中文标题 {#custom}` | acorn 报错，**整页打不开** | 正常，锚点保留    |

所以「为了抢在别人前面而接管整个 `markdown`」不是免费的：症状是某天所有带 `{#id}` 的中文
标题页一起白屏，日志里什么都没有。`loadContent()` 里只赋值一格，已经是这条路上最保守的位置。

### 三、`markdown.parseFrontMatter` 自己的先后

| 顺序 | 谁                                          | 说明                                                                                                                                                                               |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 站点在 `docusaurus.config.mjs` 里写的那一份 | 可能是「接 CMS / 自己读一份」，`validateConfig()` 跑在插件实例化之前，它是底                                                                                                       |
| 2    | 本插件                                      | `loadContent()` 里**包住**当前那一份，不替换                                                                                                                                       |
| 3    | 之后的插件                                  | 如果它**直接赋值**（不包），会把 1、2 一起吞掉 —— `plugins` 数组里谁靠前，谁就先包，本仓这份写在最前就是这个理由；但这是约定，不是护栏                                             |
| 4    | 消费方                                      | docs 插件在**它自己的** `loadContent()` 里解构一次（`const { parseFrontMatter } = ...`），之后换属性它不看；mdx-loader 是编译时才读属性。这就是接线不能晚于 `loadContent()` 的原因 |

`defaultParseFrontMatter` 参数原样透传，所以站点那份拿到的一定是官方 `DEFAULT_PARSE_FRONT_MATTER`，
不会出现「两处版本错位、两份 frontmatter」。

### 四、两条「不在本插件事上」但会撞车的路

- **`markdown.format`**：插件在 `loadContent()` 里写 `siteConfig.markdown`，而
  `mdx-loader` 是拿 `siteConfig.markdown` **引用**的，所以这一步对那些在编译期读
  `markdown.format` 的东西也是「说到就到」的。这也是为什么「空规则表」要早退：
  `rules: []` 时连一个字节都不碰 `siteConfig.markdown`。
- **站点在 `markdown.parseFrontMatter` 里顺手改正文**：本插件保留 `base` 返回的 `content`，
  一个字都不碰，所以那种改法不会被冲掉 —— 但反过来，想让注入的键「也出现在 yaml 文本里」
  （markdown 之外的工具也看得见），只能走 `markdown.preprocessor`，那不是插件能封装的。
