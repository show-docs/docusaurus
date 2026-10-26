# @show-docs/docusaurus-plugin-frontmatter-injector

按规则给 md 注入 frontmatter。注入的是**元数据**，走的是官方那条解析路径，所以侧边栏、
`description`、`slug` 与 MDX 组件上的 `props.content.frontMatter` 会一起变 —— 不是只在某一处
打了个补丁。

## 安装

```bash
pnpm add @show-docs/docusaurus-plugin-frontmatter-injector
```

需要 Docusaurus `^3.9.2` 与 Node `^24`。git 那一半要求构建机上有 `git`、且站点在仓库里；
读不到就静默跳过 —— 少两个标签比构建失败好。

## 使用

```js
// docusaurus.config.mjs
export default {
  plugins: [
    [
      '@show-docs/docusaurus-plugin-frontmatter-injector',
      {
        tags: ['文档'],
        // 文档插件扫哪些文件：这两格是**转述**，见下面「地盘」
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

本包的缺省规则**只有一条**：给每一页 `.md` / `.mdx` 的 `tags` 补上这几个标签 ——

| 标签         | 什么时候出现                                             |
| ------------ | -------------------------------------------------------- |
| `tags` 选项  | 永远（`tags: ['文档']` 就写 `文档`；不传就只剩下面两个） |
| `git-new`    | 这份文件**只有一次提交**，且那一次就在「最近」里         |
| `git-update` | 这份文件**最近动过**                                     |

「最近」有两个口径，落在哪个都算：commit 在 **7 天内**，或者在全仓**最后 5 个 commit** 里。

**页面自己写了 `tags` 时是合并，不是让位。** 页面那几条与站点标签、`git-new` / `git-update` 是
并列的几件事，所以并成一份：去重、排序（同一个标签组合在产物里只有一种写法，diff 才稳得住）。
页面写成单个字符串（`tags: blog`）也收成数组；写成别的形状（数字、带对象的数组）就原样交回 ——
那是页面的事，本插件不替它改类型。其它键仍是「站点写过了就让位」。

`rules` 传 `[]` 等于本插件什么都不做（连 `parseFrontMatter` 都不替换）。

## 地盘：跟着文档插件走

`docs` 那三格对应 `@docusaurus/plugin-content-docs` 的 `path` / `include` / `exclude`：

| 字段      | 缺省                | 说明                                           |
| --------- | ------------------- | ---------------------------------------------- |
| `path`    | `'docs'`            | 内容根，相对站点根                             |
| `include` | `['**/*.{md,mdx}']` | 收哪些文件，相对内容根（与 docs 插件缺省同值） |
| `exclude` | `[]`                | 挡掉哪些，相对内容根                           |

**为什么是「转述」。** 站点常把 `docs` 选项写在自己的一个预设里（本仓就是 classic 预设里那一份），
本插件在手上拿不到 —— 所以由站点把这三格再写一遍。抄两遍会漂，本仓的做法是把清单提成
`docusaurus.config.mjs` 顶部的常量，两处引同一份。

本地盘之外的文件**一个标签都不补**（`git-new` / `git-update` 也不会出现）：页面这个概念由文档
插件定义，注入跟着它走。匹配器用的是同一个 `@docusaurus/utils` 的
`createAbsoluteFilePathMatcher`，与 `Globby` 扫文件时同一套 micromatch 口径 —— 自己写一遍容易漂的
是「相对内容根」那一折与 `exclude` 压过 include 那一条（同引擎、同语义，实测见
[internals 的「地盘」一节](./docs/internals.md)）。

## 规则表

一条规则 = 「管哪些文件」+「管到的文件补哪几格」。

| 字段          | 说明                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `name`        | 只用于排查，不参与判定                                                     |
| `match`       | 字符串按**后缀**比（`'.md'` 命中 `a/b.md`，不命中 `a/b.md.bak`）；正则原样 |
| `frontMatter` | 要并进去的那几格；值可以写死，也可以写成「按文件算」的函数                 |

三条口径定了这套东西的行为：

- **只补不覆盖，`tags` 除外。** 某个键已经在了，规则就不碰它，算值那一步也不会跑；
  唯一的例外是 `tags` —— 那一格是并集，页面写的与注入的合起来（见上面「合并」那一段）。
- **只管自己的键。** 规则表补的是**配置里的**那几格，不去猜别的包怎么读它自己的命名空间
  （同一把键不同层可能各有各的写法，替它补值等于替它改判定口径）。
- **函数不拿原值。** 键不存在才会算，所以函数拿到的是「文件在哪、此刻的 frontmatter 长什么样、
  配置里那几条标签、打开的那个仓库」，返回 `undefined` 表示「这份文件我不表态」，那一格不写。
  函数可以返回 Promise（git 那条路是异步的）。

## 导出

一个默认导出（插件本身）外加规则表那几样纯函数：`defaultRules`、`applyRules`、`mergeTags`、
`wrapParseFrontMatter`、`tagsOf`、`isRecent`，地盘那一侧的 `createScope`、`docsContentPath`、
`scopeOf`、`DEFAULT_INCLUDE`，以及 git 那一侧的 `findRepoRoot`、`openRepo`、`repoPath`、`timesOf`
（用例在 `test/frontmatter-injector.test.mts`）。

解析器的类型直接用 `@docusaurus/types` 的 `ParseFrontMatter`，本包不另画一份。`applyRules`
就地补、返回补进去的键名 —— 需要知道补了什么的场景是「排查」与「前端要不要重新渲染」。

## 使用约束

- **只对「元数据」负责。** 正文一个字都不动。要改 yaml 文本本身（让 markdown 之外的工具也看见），
  那是 `markdown.preprocessor` 的活，不是插件的活。
- **注入是站点级单例。** 本插件改的是 `siteConfig.markdown.parseFrontMatter`，那是**一份**
  函数。所以它会**包装**当前那一份（站点自己接 CMS 的那份照旧生效），而不是替换。
- **注入的值要过得了消费方的 schema。** `DocFrontMatterSchema` 带 `.unknown()`，所以自定义键
  能活下来；但 `title` 写非字符串、`sidebar_position` 写字符串会被打回 —— 那是消费方的规矩。
  `tags` 是官方认识的键（一串字符串），本包写的就是这个形状。

## git 那一半

只在**初始化阶段读一次**：`loadContent()` 里现取现包那一下把仓库打开，两次 `git log` 拿到
「HEAD 的时刻 + 最近 5 个提交动过的文件 + 7 天内动过的文件」。之后每个文件只在这份结果里查，
问历史的那两下（提交过几次、最后一次何时）按文件缓存 —— 几十上百页 md 不会变成几十上百次
subprocess。细节与实测见 [`docs/internals.md`](./docs/internals.md)。

## 告警

本包不告警：规则表写错了是**你的**规则表写错，git 读不到也只是少两个标签。唯一会让注入静默
失效的路径是「别人在本插件之后再直接替换 `parseFrontMatter`」，那条路上没有任何钩子可以拦
（见 [`docs/internals.md`](./docs/internals.md) 的「已知限制」）。

## 已知限制

- **依赖内部实现。** `markdown.parseFrontMatter` 是官方配置项，但「mdx-loader 会读它、
  docs 插件在哪一刻把它读走」这两件事是**时序**结论，不是承诺。因此接线落在
  `loadContent()` 而不是更晚的 `contentLoaded()`（理由见 internals 第 1 条），
  升级 core 后按 [`docs/internals.md`](./docs/internals.md) 的「升级检查单」跑一遍。
- **只管 md/mdx。** 其它文件（`.dbml`）在各自 loader 里处理，与本包无关。
- **不写磁盘。** 磁盘上的 md 一个字都不改，所以 `git status` 永远是干净的、
  dev 模式不会因为注入反复重编译。
- **git 只看当前分支的历史。** 判定读的是 `HEAD` 那条线：文件在别的分支上「新建」与否，
  与本站点无关。
