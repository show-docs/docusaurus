# @show-docs/docusaurus-theme-git-badge

侧边栏里给「新建」与「更新过」的页面挂一枚颜色标记（叶子行一个纯色点，分类行把颜色染在
折叠箭头上）。判据是 **git**：这份文件只提交过一次且最近动过 = 新建（绿），
最近动过 = 更新（橙）。

判与画都在这一包里：站点只管把它装上。

## 安装

`theme/` 与 `components/` 是随包发布的未编译 TS 源码，编译它们的 babel 规则由
`@show-docs/docusaurus-plugin-compile-source` 一处认领，所以它也得装上并**注册成插件**（本包不查
它，只在 `peerDependencies` 里点名，缺了要到打包才报 `Module parse failed`）。两个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-compile-source @show-docs/docusaurus-theme-git-badge
```

需要 Docusaurus `^3.9.2` 与 Node `^24`。

git 那一半要求构建机上有 `git`、且站点在仓库里；读不到就静默跳过 —— 少挂一枚徽标比构建失败好。

## 使用

```js
// docusaurus.config.mjs
export default {
  plugins: ['@show-docs/docusaurus-theme-git-badge']
};
```

**本包没有选项。** 判据、徽标种类、锚点键、画法全在包里 —— 站点写不出来，也不需要写。

## 判据

| 情形                                     | 徽标   |
| ---------------------------------------- | ------ |
| 只提交过一次，且最近动过                 | 新建   |
| 提交过两次以上，但最近动过               | 更新   |
| 不在「最近」里（或者压根没有历史）       | 不表态 |
| 检出被 `--depth` 截到只剩一条（CI 默认） | 不表态 |

「最近」有两个口径，落在哪个都算：commit 在 **7 天内**，或者在全仓**最后 5 个 commit** 里。
7 天按**这一次构建打开仓库的那一刻**算（不是每判一页重读一次时钟），所以同一场构建里两页不会
各按各的「此刻」判；但重建本身是相对的 —— 隔一个月再构建，那时不在窗口里的页就不再挂橙标。

**构建机上的检出被 `--depth` 截断过（CI 默认 depth 1）时不表态**：那种检出里只剩「历史到此为止」
那一条提交，git 把它当成对着空树比出来的，于是**每个文件**都在它的名单里、每份文件都「只提交过
一次」。照原判据，全站会一起亮成「新建」；本包把那一条提交的名单与历史都丢掉，所以这种检出里
一页标记都没有（要徽标就给构建一份完整检出，例如 `actions/checkout` 的 `fetch-depth: 0`），
`--depth 50` 这类往前还看得见真提交的检出照常判（代价见
[`docs/internals.md`](./docs/internals.md)：够得着根提交时，那一条也会被当成截断点）。

**页面自己钉了就算数**：frontmatter 里写 `git_badge: new` / `git_badge: update` 就以页面为准
（那是钉子，不是判断），不写才由 git 判。写它只影响侧边栏那一格 —— 正文里不会多出任何东西。

**载体**是官方那条 `sidebar_custom_props` 通道：文档插件把那一页 frontmatter 里的
`sidebar_custom_props` 原样抄到侧边栏项的 `customProps` 上（`plugin-content-docs/lib/props.js`），
分类项拿的是它链的那一页的。这是唯一一条 frontmatter → 侧边栏的路。

**只补不覆盖**：页面自己写了 `sidebar_custom_props` 的那一页，徽标不进去。

## 画在哪两格

- `DocSidebarItem/Link` —— 侧边栏里文档条目那一行；
- `DocSidebarItem/Category` —— 分类那一行（每个包那一行，链的就是那个包的 README）。

两格都只给那一行加一个 `data-git-badge` 属性（`new` / `update`），形状由 CSS 画：那一行
不多一个元素，不用改官方那份结构，也不用照抄它的 CSS module。分类行看的是整棵子树 ——
自己链的那一页没表态、但有子页新建或更新过时，父分类同样带一枚；`new` 压过 `update`，一格
只有一个标记。

叶子行画一个**纯色点**；分类行**不画点** —— 那一行本来就有折叠箭头，颜色染在箭头上，
一行只留一处标记。颜色即语义，两种画法都不带文字、不带链接 —— 文字是第二份要跟着语义走的
文案，链接会让这枚状态标记看起来像一处导航。

## 地盘：不再分内容根

注入包住的是站点全局那一个 `markdown.parseFrontMatter`，**任何被它解析的 markdown 都判**：不认
内容根，也不认哪一份文档插件实例扫到了这一页。读那一格的只有文档插件的侧边栏，所以多检查的那些
文件（blog、pages）身上多出的 `sidebar_custom_props` 没人读；官方校验 frontmatter 时对这一格
不设防（`allowUnknown`），构建也不会红。

这样地盘就不必由站点抄一遍：多棵内容根也好、preset 里那份 `docs` 选项也好，站点都不再转述。
代价是「被解析了但不是页面」的文件也会被问一次历史 —— 整仓每场构建只扫一遍，问一次就是一次
查表，不再起 subprocess。

**为什么不在构造期收窄。** 文档插件扫了哪些文件，要到 `allContentLoaded` 才定；而注入必须赶在
docs 插件读走解析器之前（时序见下面「已知限制」），那时内容根清单还不存在。与其把清单抄两遍，
不如不筛。

## 导出

一个默认导出（这一层本身）。判据与认种类的那些函数是**内部的**：它们是这一层的实现，不是给站点
用的 API。

## 使用约束

- **只对「元数据」负责。** 正文一个字都不动。
- **注入包住站点那一份。** 本层改的是 `siteConfig.markdown.parseFrontMatter`，那是**一份**
  函数。所以它会**包装**当前那一份（站点自己接 CMS 的那份照旧生效），而不是替换；包过的函数
  带记号，重新走一遍（`reloadSite()`）或注册了第二份实例都原样交回，不会套第二层。
- **不写磁盘。** 磁盘上的 md 一个字都不改，所以 `git status` 永远是干净的、
  dev 模式不会因为注入反复重编译。

## 示例

- [侧边栏徽标示例](./docs/git-badge-demo.md)（页面自己钉 `git_badge: new` 时那一格长什么样）。

## 告警

本包不告警：git 读不到、以及检出被 `--depth` 截断，都只是少挂一枚徽标（depth 1 的检出里是全站没有）。
唯一会让它静默失效的路径是「别人在本层之后再直接替换 `parseFrontMatter`」，那条路上没有任何钩子可以拦（见
[`docs/internals.md`](./docs/internals.md) 的「已知限制」）。

## 已知限制

- **依赖内部实现。** `markdown.parseFrontMatter` 是官方配置项，但「mdx-loader 会读它、
  docs 插件在哪一刻把它读走」这两件事是**时序**结论，不是承诺。因此接线落在工厂期
  （`initPlugins()` 跑完所有工厂才进 `loadContent()`），`loadContent()` 里留一次兜底重包
  （理由见 internals 第 1、2 条），
  升级 core 后按 [`docs/internals.md`](./docs/internals.md) 的「升级检查单」跑一遍。
- **只管 md/mdx。** 其它文件（`.dbml`）在各自 loader 里处理，与本包无关。
- **git 只看当前分支的历史。** 判定读的是 `HEAD` 那条线：文件在别的分支上「新建」与否，
  与本站点无关。
