# @show-docs/docusaurus-theme-git-badge

侧边栏里给「新建」与「更新过」的页面挂一枚颜色标记（叶子行一个纯色点，分类行把颜色染在
折叠箭头上）。判据是 **git**：这份文件只提交过一次且最近动过 = 新建（绿），
最近动过 = 更新（橙）。

判与画都在这一包里：站点只管把它装上，以及转述 `docs` 那三格。

## 安装

```bash
pnpm add @show-docs/docusaurus-theme-git-badge
```

需要 Docusaurus `^3.9.2` 与 Node `^24`。另外 `theme/` 与 `components/` 是随包发布的未编译 TS
源码，编译它们的 babel 规则由
[`@show-docs/docusaurus-plugin-prev-layer-resolver`](https://www.npmjs.com/package/@show-docs/docusaurus-plugin-prev-layer-resolver)
一处认领，所以还得装并注册它 —— 缺了它会在构建期当场点名。

git 那一半要求构建机上有 `git`、且站点在仓库里；读不到就静默跳过 —— 少挂一枚徽标比构建失败好。

## 使用

```js
// docusaurus.config.mjs
export default {
  plugins: [
    [
      '@show-docs/docusaurus-theme-git-badge',
      {
        // 文档插件扫哪些文件：这三格是**转述**，见下面「地盘」
        docs: {
          path: '.',
          include: ['docs/**/*.md'],
          exclude: ['**/node_modules/**']
        }
      }
    ]
  ]
};
```

**本包只有这一个选项。** 判据、徽标种类、锚点键、画法全在包里 —— 站点写不出来，也不需要写。

## 判据

| 情形                               | 徽标   |
| ---------------------------------- | ------ |
| 只提交过一次，且最近动过           | 新建   |
| 提交过两次以上，但最近动过         | 更新   |
| 不在「最近」里（或者压根没有历史） | 不表态 |

「最近」有两个口径，落在哪个都算：commit 在 **7 天内**，或者在全仓**最后 5 个 commit** 里。

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

## 地盘：跟着文档插件走

`docs` 那三格对应 `@docusaurus/plugin-content-docs` 的 `path` / `include` / `exclude`：

| 字段      | 缺省                | 说明                                           |
| --------- | ------------------- | ---------------------------------------------- |
| `path`    | `'docs'`            | 内容根，相对站点根                             |
| `include` | `['**/*.{md,mdx}']` | 收哪些文件，相对内容根（与 docs 插件缺省同值） |
| `exclude` | `[]`                | 挡掉哪些，相对内容根                           |

**为什么是「转述」。** 站点常把 `docs` 选项写在自己的一个预设里（本仓就是 classic 预设里那一份），
本包在手上拿不到 —— 所以由站点把这三格再写一遍。抄两遍会漂，本仓的做法是把清单提成
`docusaurus.config.mjs` 顶部的常量，两处引同一份。

地盘之外的文件**一个标记都不给**：页面这个概念由文档插件定义，徽标跟着它走。匹配器用的是
同一个 `@docusaurus/utils` 的 `createAbsoluteFilePathMatcher`，与 `Globby` 扫文件时同一套
micromatch 口径 —— 自己写一遍容易漂的是「相对内容根」那一折与 `exclude` 压过 include 那一条
（同引擎、同语义，实测见 [internals 的「地盘」一节](./docs/internals.md)）。

## 导出

一个默认导出（这一层本身）外加 `DocsScope` 那个类型。判据与认种类的那些函数是**内部的**：
它们是这一层的实现，不是给站点用的 API。

## 使用约束

- **只对「元数据」负责。** 正文一个字都不动。
- **注入是站点级单例。** 本层改的是 `siteConfig.markdown.parseFrontMatter`，那是**一份**
  函数。所以它会**包装**当前那一份（站点自己接 CMS 的那份照旧生效），而不是替换。
- **不写磁盘。** 磁盘上的 md 一个字都不改，所以 `git status` 永远是干净的、
  dev 模式不会因为注入反复重编译。

## 示例

- [侧边栏徽标示例](./docs/git-badge-demo.md)（页面自己钉 `git_badge: new` 时那一格长什么样）。

## 告警

本包不告警：git 读不到只是少挂一枚徽标。唯一会让它静默失效的路径是「别人在本层之后再直接
替换 `parseFrontMatter`」，那条路上没有任何钩子可以拦（见
[`docs/internals.md`](./docs/internals.md) 的「已知限制」）。

## 已知限制

- **依赖内部实现。** `markdown.parseFrontMatter` 是官方配置项，但「mdx-loader 会读它、
  docs 插件在哪一刻把它读走」这两件事是**时序**结论，不是承诺。因此接线落在
  `loadContent()` 而不是更晚的 `contentLoaded()`（理由见 internals 第 1 条），
  升级 core 后按 [`docs/internals.md`](./docs/internals.md) 的「升级检查单」跑一遍。
- **只管 md/mdx。** 其它文件（`.dbml`）在各自 loader 里处理，与本包无关。
- **git 只看当前分支的历史。** 判定读的是 `HEAD` 那条线：文件在别的分支上「新建」与否，
  与本站点无关。
