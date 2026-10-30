# theme-git-badge：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：路线的取舍、踩过的坑与实测证据、升级时要复跑的检查单。
使用者侧的事实（接入、判据、地盘）在 [`../README.md`](../README.md)。

## 组成

`src/` 下五个文件，`components/` 与 `theme/` 下各两份浏览器侧源码：

| 文件                                   | 职责                                                                |
| -------------------------------------- | ------------------------------------------------------------------- |
| `badge.mts`                            | 判据：git 或页面钉的那把键 → 徽标种类                               |
| `frontmatter.mts`                      | 包装 `parseFrontMatter`，把徽标写进 `sidebar_custom_props`          |
| `docs-scope.mts`                       | 地盘：文档插件的 `path` / `include` / `exclude` 折成一个 `covers()` |
| `git-info.mts`                         | 读 git：仓库根、HEAD、最近动过的文件、每份文件的提交时刻            |
| `index.mts`                            | 插件接线：层目录、客户端模块、前置检查、`loadContent()` 里的接线    |
| `components/git-badge.tsx`             | 徽标本身：认种类（分类行递归看整棵子树）                            |
| `theme/DocSidebarItem/{Link,Category}` | 覆盖侧边栏那两格，把种类摊成 `data-git-badge` 属性                  |
| `styles/git-badge.css`                 | 叶子行画点、分类行给折叠箭头染色                                    |

切这几份是因为几类夹具互不相干：git 那一侧能独立测（真仓库），判据是纯函数，地盘是「一堆
glob 的边角」，接线要假解析器，浏览器那两格要 DOM 与 e2e。**对外只丢插件本身与
`DocsScope` 那个类型** —— 判据与画法是这一层的实现，不是给站点用的 API。

源码在 `src/`，`dist/` 是编译产物（`rootDir` = `src/`），改完源码要 `pnpm build:core`。
`components/` 与 `theme/` 是**未编译的 `.tsx`**，随包发布，由站点自己的 babel 编译。

## 两条半：判在哪，画在哪

徽标这件事跨了两半，中间那道缝是官方那条 `sidebar_custom_props` 通道：

```
构建期（Node）                          浏览器
─────────────                          ──────
badge.mts     判：git → 'new' | 'update'
frontmatter.mts   写进 frontmatter.sidebar_custom_props.gitBadge
                      │
                      │  文档插件把它原样抄到侧边栏项的 customProps 上
                      │  （plugin-content-docs/lib/props.js）
                      ▼
components/git-badge.tsx   认种类（badgeOf / badgeOfTree）
theme/DocSidebarItem/*    把种类摊成 data-git-badge 属性
styles/git-badge.css      按属性画：叶子行一个点、分类行的箭头换色
```

**为什么是这条通道**：frontmatter → 侧边栏只有这一条路（官方那份 `props.js` 把
`sidebar_custom_props` 原样抄到侧边栏项的 `customProps` 上；分类项拿的是它链的那一页的）。
自己造一条旁路就得改侧边栏生成器 —— 那是官方内部实现，升级即碎。

**为什么另用一把键**：git 判出来的状态只该影响侧边栏那一格，不该顺带改掉页面长相 —— 复用
一个要展示在正文里的键，钉子就会多出一颗芯片。所以页面自己钉徽标用的是**另一把键**
（`git_badge`），写它只改侧边栏。

## 为什么是 `data-*` 属性加伪元素

官方那两份组件都把整个 `<li>` / `<a>` 当自己的根渲染，从外面插不进 `<a>` 里面。换 `label`
能插进文字那一格，但那是拿一个 React 节点去换 `ReactNode`，还得额外处理「分类项复用链接格」
的那一折；而官方那两份都会把认不得的 props 原样摊到 `<a>` 上（`DocSidebarItem/Link` 的
`<Link {...props}>`、`DocSidebarItem/Category` 的同一处），所以只需透传一个 `data-git-badge`，
那一行就带着种类了。

叶子行的形状交给 `styles/git-badge.css` 的 `::before` 画：行里不多一个元素，也就没有「点子
会不会被塞进某个链接里」这一格；`order: 1` 让它排在标签文字之后，再靠 `margin-left: auto`
推到右端，官方那两份结构一个字不改。

**分类行不画点，颜色落在折叠箭头上**：分类行本来就有折叠箭头，再挂一个点等于一行两处标记。
箭头随 `collapsible` 有两种画法（有链接 = 同级 `<button class="menu__caret">` 的 `::before`，
没链接 = `<a>` 自己的 `::after`），两条一起染。遮罩是必需的：官方图标是半透明的
（`fill="rgba(0,0,0,0.5)"`），而遮罩只读 alpha —— 直接拿它做 mask 只会得到一枚 50% 透明的
箭头，所以换一枚同形不透明的 SVG 再填色；暗色主题对旧图标做的反色要拿 `filter: none` 挡掉。
还有一处变量传递：带链接那一类的箭头是同级按钮，`--git-badge-color` 不会从 `<a>` 继承过去，
所以按同级选择器再给一份。

**分类行看整棵子树**：分类项自己的 `customProps` 只有它链的那一页（`getCategoryLinkCustomProps`），
子页新建或更新过时父分类也该有个说法，所以 `badgeOfTree()` 递归走 `item.items`；`new` 压过
`update`（新建蕴含更新），一格只有一个标记。分类项在没有可见子页时会把 props 转交给链接那一格，
那边已经算过整棵子树，所以链接那一格见到属性就用属性，不拿自己那一页盖掉。

## 这一层放在层栈的哪一格

`theme/` 里的两份组件都用 `@theme-init/...` 拿官方那一份：仓库里只有本层提供这两格，没有要串的
链（规则见仓库根 README 的「基础设施包」一节）。本包仍必须是一个**主题层**（有
`getThemePath()`），并且仍要装并注册解析器插件 —— 后者的理由是这两份组件是随包发布的未编译
TS 源码，编译它们的 babel 规则由它一处认领（见解析器 README 的「编译 `@show-docs` 家族未编译
的 TS 源码」）。

官方别名 `@theme/DocSidebarItem/Link` 是**全局赢家**：主题路径按「fallback → preset 主题 →
用户插件 → 站点 `src/theme`」的顺序枚举，**后者覆盖前者**。所以：

- 站点层 `src/theme` 若提供这一格，它赢 —— 所以站点那一层**不能**再 swizzle 这两格；
- 本包作为用户插件声明在 preset（theme-classic）之后，于是压过官方那份，赢的是本包。

前提是站点层不再提供这一格。本包接管的正是这一点：站点的两份 swizzle 删掉，改由本包提供。

## 为什么是这条路（frontmatter 的注入点）

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
   `install()` 的原因。同一份解析器被套两次，徽标就算两次，所以包装层带一个
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
git log --follow --format=%ct -- <path>   # 这份文件被提交过几次，每次的时刻
```

- `%ct` 一行一个提交（`git log` 默认倒序），所以行数就是「提交过几次」，第一行就是最近那次。
- 不数 `--name-only` 的文件名行：重命名那一步会同时吐新旧两个名字，而 `--follow` 更早的提交
  里只有旧名 —— 按名字过滤计数会把历史数少，把重命名过的文件误判成「只提交过一次」。
- **只提交过一次**的那份文件，`created` 与 `updated` 是同一刻，于是「新建」与「最近更新」
  同时成立（刚建的文件本来也就刚动过）。
- 一条历史都没有（没提交过、或压根不在这个仓库里）时两个时刻都是 `undefined`：不猜。

### 边界

- **读不到就不读。** `findRepoRoot()` 用 `spawnSync` 问 `git rev-parse`：git 退出 128（不在仓库里、
  仓库坏了）与「git 不在 PATH」都只是 `undefined`，判定退回「不表态」。这条构建不该因为一份
  README 少挂一枚徽标而失败。
- **仓库根要解析软链。** `/tmp` 在 macOS 上是 `/private/tmp` 的软链；Docusaurus 给的 `filePath`
  与 `git rev-parse` 给的那条不在同一套写法上时，「这条路径在不在这个仓库里」就判错了。
- **只看 `HEAD` 那条历史。** 工作区里未提交的改动不算「最近动过」—— 站点产物要能复现，
  拿工作区当判据就成了「谁本地改一下谁就变新」。

## 注入的三条语义

- **只补不覆盖**：键（`sidebar_custom_props`）已经在了就不碰。理由与从前一样：注入不该变成
  「谁来都能改站点写过的东西」。
- **不表态就不写那一格**：判不出徽标时返回 `undefined`，那一格不写 —— 否则 frontmatter 上会多出
  一格 `sidebar_custom_props: undefined`（`Object.keys` 数得着、`JSON.stringify` 看不见）。
- **判据拿得到 frontmatter**：`git_badge` 那把钉子就在 frontmatter 里，所以判据函数看得见
  此刻的 frontmatter —— 这与从前「函数不拿原值」那条相反：这里**要**看原值（页面自己钉的
  那把键就是原值）。

## 地盘：为什么是「转述」

页面这个概念由 `@docusaurus/plugin-content-docs` 定义（`docs.path` / `docs.include` /
`docs.exclude`），而这三格通常写在站点自己的预设里 —— 本包在插件选项里拿不到别人实例化后的
选项（`initializedPlugins` 只有实例，`options` 不外露，且 `loadContent()` 是 `Promise.all()`
一起跑的）。所以口径是：**站点把每份文档插件实例那三格再写一遍给本包**。本仓的做法是把清单提成
`docusaurus.config.mjs` 顶部的 `DOCS_INCLUDE` / `DOCS_EXCLUDE` 两个常量与一份 `docsScope(根)`
工厂，两份实例与徽标那一条各引同一份，不让它漂。

**本站有两棵内容根**（`packages/` 挂在 classic 预设那一份、`themes/` 挂在紧随本包那一条的独立
实例，`id: 'themes'`），所以转述写成**数组**：`docs: [docsScope('packages'), docsScope('themes')]`。
一份 `DocsScope` 说的是一棵根，`include` / `exclude` 各自相对自己那棵根解释，`covers()` 取
「任一棵里的一页」。为什么不改成「每棵根挂一份本包实例」：注入走的是站点全局那一个
`markdown.parseFrontMatter`，第二份实例会被 `WRAPPED` 那记「已经是我」的护栏当成同一层而
静默退让 —— 多棵根只能住在一份实例里。这一格形状由 `test/theme-git-badge.test.mts` 里
「地盘可以多棵根」那一组钉住，跨根的真接线另有 `转述两份实例时两棵根的页都有徽标` 一条。

匹配交给 `@docusaurus/utils` 的 `createAbsoluteFilePathMatcher`（`Globby` 底下的 micromatch），
不是自己写一遍。两个踩过的点：

1. **同源的不是 glob 写法，是那两格折法。** 文档插件扫文件走
   `Globby(options.include, {cwd: 内容根, ignore: options.exclude})`（实测
   `@docusaurus/plugin-content-docs/lib/docs.js`），而 Globby 底下就是 micromatch —— 两边本来就是
   同一个匹配引擎，同一套语义（实测 micromatch 4.0.8 + globby 11.1.0：`**/*.md` 两边都收
   `packages/README.md`，`.hidden/x.md` 两边都在 `dot` 缺省下不收）。真正要照抄的是它旁边的两格：
   绝对路径先折成「相对内容根」（官方匹配器只认自己那棵根，喂进去别处的路径直接抛 —— 多棵根时
   每一问都先过**自己那棵**根的 inside 护栏），以及 `ignore` 压过 include。自己写一遍就是这两格容易漂。
2. **`include` / `exclude` 是「相对内容根」的 glob**，所以 `build/**` 只管得到内容根下第一层，
   包目录里的 `<pkg>/build/**` 照样收得进来 —— 得写成 `**/build/**`。本仓的 exclude 原来就是
   `build/**`，这一版一并改了（文档插件那边同样受益：那些产物里的 `README.md` 副本本来会被当成
   页面）。同一道理，同一条 glob 在两棵根里可以判出不同结果，这是逐根解释，不是一串 glob 合起来判。

`exclude` 不兜官方缺省（`**/_*` / `**/__tests__`）：那几条是「扫描时顺手跳过」，不是「这些文件
不归文档插件管」，本包没有「反正它也不扫」的前提可用。`include` 兜官方的缺省值
（`**/*.{md,mdx}`）：站点没转述时至少「md 才算页面」这条还在。

判据落在两层：包装层先问一次（地盘之外的文件原样交回，连 git 都不问），`badgeKindOf()` 里再问
一次（它是对外的纯函数，自己也得站得住）。

## 已知限制

**这条路上没有任何钩子能拦住「后来者直接替换 `parseFrontMatter`」。** 插件是直接赋值的，
docusaurus 之后也不会再回头检查。要降低风险只有一条：本包放在 `plugins` 数组里靠前的位置，
让自己的包装成为「先包的那一层」，后来者即便是替换，至少替换掉的是一份能跑的实现
（而不是把三份全丢掉）。这是约定，不是护栏。

**站点层若再 swizzle 这两格，徽标就没了。** 官方别名是全局赢家，站点层永远压过插件层 ——
本包接管这两格的前提就是站点层不再提供它们。

## 升级检查单

`parseFrontMatter` 是官方配置项（`@docusaurus/types` 的 `MarkdownConfig`），但下面这两条是
**时序**结论，不是承诺。升 core 之前/之后跑一遍：

1. `node_modules/@docusaurus/core/lib/server/plugins/plugins.js` 里
   `executePluginContentLoading()` 仍是「先 `loadContent()`、后 `contentLoaded()`」，且
   `executeAllPluginsContentLoading()` 仍用 `Promise.all()` 把各插件的 `loadContent()` 一起跑；
2. `node_modules/@docusaurus/mdx-loader/lib/loader.js` 里 `loadMDX()` 仍读
   `options.markdownConfig.parseFrontMatter`（而不是自己 import 一份）；
3. `@docusaurus/plugin-content-docs` 的 `doProcessDocMetadata()` 仍在 `loadContent()` 里就
   `const { parseFrontMatter } = context.siteConfig.markdown`（**早于**本包的 `contentLoaded`），
   且 `MarkdownConfigSchema` 的 `parseFrontMatter` 仍是带默认值的 Joi `function()`；
4. `pnpm test`（`test/theme-git-badge.test.mts` 里有一条用例真的调
   `@docusaurus/utils` 的 `DEFAULT_PARSE_FRONT_MATTER`，第 1、2 条漂了它会红）；
5. `pnpm build` 之后读一眼产物：本包写的那一格落在
   `.docusaurus/docusaurus-plugin-content-docs/<实例 id>/*.json` 的 `frontMatter` 里 —— 落点第一层是
   插件名、第二层是**实例 id**，本站有两份实例，所以要各看一份：`default/`（`packages/` 那棵根）与
   `themes/`（`themes/` 那棵根）。只回读 `default/` 就等于没看第二棵根。
   `build/assets/js/*.js` 里也能找到那一格 —— 两侧同源才算真的注进去了；
6. 地盘那条判据从产物回读最省事：产物里出现过的每一份 md/mdx 都出自站点扫出来的那批文件，
   而**站点里不存在的**文件（`tools/README.md`、`test/README.md`、`node_modules` 下那些
   `README.md` 副本）不该出现在产物里。

第 5 条是唯一「从产物回读」的判据，也是唯一能证伪「注入只在 MDX 那边生效、侧边栏没跟上」
的那条分支的判据 —— 两条路读的是同一个函数，但它们不是同一次调用（第 1、3 条讲的就是
这两次调用的先后）。

## 与站点的其它 markdown 手段怎么共存（谁先谁后）

一句话：**本包只给 `markdown.parseFrontMatter` 换值，`markdown` 这个对象本身没换、兄弟键
一个没动，所以 `preprocessor` / `remarkPlugins` / `format` 都照旧跑。** 唯一会咬人的是
「整体替换 `siteConfig.markdown`」那种写法 —— 那是另一件事，见后面「设计禁区」。

### 一、现状：只动一格，且是包装

本包对 `siteConfig.markdown` 只有一句写操作（`src/index.mts`）：

```js
markdown.parseFrontMatter = wrapParseFrontMatter(
  markdown.parseFrontMatter,
  () => repo,
  scope
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
| 2    | 本包                                        | `loadContent()` 里**包住**当前那一份，不替换                                                                                                                                       |
| 3    | 之后的插件                                  | 如果它**直接赋值**（不包），会把 1、2 一起吞掉 —— `plugins` 数组里谁靠前，谁就先包，本仓这份写在最前就是这个理由；但这是约定，不是护栏                                             |
| 4    | 消费方                                      | docs 插件在**它自己的** `loadContent()` 里解构一次（`const { parseFrontMatter } = ...`），之后换属性它不看；mdx-loader 是编译时才读属性。这就是接线不能晚于 `loadContent()` 的原因 |

`defaultParseFrontMatter` 参数原样透传，所以站点那份拿到的一定是官方 `DEFAULT_PARSE_FRONT_MATTER`，
不会出现「两处版本错位、两份 frontmatter」。

### 四、两条「不在本包事上」但会撞车的路

- **`markdown.format`**：插件在 `loadContent()` 里写 `siteConfig.markdown`，而
  `mdx-loader` 是拿 `siteConfig.markdown` **引用**的，所以这一步对那些在编译期读
  `markdown.format` 的东西也是「说到就到」的。
- **站点在 `markdown.parseFrontMatter` 里顺手改正文**：本包保留 `base` 返回的 `content`，
  一个字都不碰，所以那种改法不会被冲掉 —— 但反过来，想让注入的键「也出现在 yaml 文本里」
  （markdown 之外的工具也看得见），只能走 `markdown.preprocessor`，那不是插件能封装的。
