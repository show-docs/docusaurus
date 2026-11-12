# @show-docs/docusaurus-theme-word-count

统计文档字数、并在正文任意位置显示其中一份的 Docusaurus 主题插件。正文里写一行
`::word-count`，**指令所在的位置**就多出一块统计。不写范围时是**这一页所在内容根**（docs
实例）的词数与页数；写成 `::word-count{scope="…"}` 可以换成**本页**、**本文件夹（含子目录）**
或**全站**。整站的数在构建期算好，页面只挑自己那一份。正文其余部分一个字都不动。

每一块都摆同一份四栏明细：文件（数量、草稿、frontmatter）、文字（词数、两类文字与字符数）、
标题（Heading ID 与各级标题数）、正文结构（代码段与行数、图像、图表、表格、内外链接、引用）。
四个范围只是各自挑配置期已经合好的那一格；数字只出现在表里，块上不再用一句话重复一遍。

数是**构建时算一次的**，不是打开页面时现算的：静态产物里就有那几个数字，首屏就能看到。

## 安装

「谁来编本包那份未编译的 `.tsx`」由 `@show-docs/docusaurus-plugin-compile-source` 那一条
babel 规则负责，两个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-compile-source @show-docs/docusaurus-theme-word-count
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-compile-source',
    '@show-docs/docusaurus-theme-word-count'
  ]
};
```

主题这一份负责统计与 `@theme/WordCount` 那一块。把正文里 `::word-count` 那行**渲染成组件**靠一个
remark 插件：Docusaurus 没给主题层留全局 `remarkPlugins`（那几格按内容插件各配各的），所以由站点
把它挂进**每一棵 docs 内容根**——

```js
import { remarkWordCount } from '@show-docs/docusaurus-theme-word-count/remark';

export default {
  // preset 里的 docs、以及独立挂的 @docusaurus/plugin-content-docs 各实例都要加上同一份：
  presets: [
    [
      '@docusaurus/preset-classic',
      { docs: { remarkPlugins: [remarkWordCount] } }
    ]
  ]
};
```

挂上之后，`::word-count` 在 `md` 与 `mdx` 两种格式下都会渲染（插件在**语法树**上插组件节点，
不再往文本里塞源码）。某棵内容根没挂它、却在正文里写了这行指令时，那一处只留一个空容器，不报错、
也不泄漏 `import` / `<__WordCount/>` 原文。

统计读的是**各 docs 实例已经加载到的那份清单**：站点不必把 `path` / `include` / `exclude` 再转述
一遍，多一棵根、换一条 include 都自动跟上。

### 写指令

```md
# 字数统计

正文开头这一段照常渲染。

::word-count

## 后面的内容

指令写在哪儿，那一块就出现在哪儿。
```

它是一条标准 remark-directive **叶指令**（两个冒号、自成一体、不吞后面的正文）。认的形状：最多
三格缩进、行内是 `::word-count`，可带一个 `{scope="…"}` 属性（引号可省）。代码围栏（` ``` ` 或
`~~~`）与四格缩进的代码块里的同形文字不算指令，它们是示例正文。指令本身不算词。

| 写法                             | 那一块数的是                                    |
| -------------------------------- | ----------------------------------------------- |
| `::word-count`                   | 这一页所在的 docs 实例（缺省，等同 `instance`） |
| `::word-count{scope="page"}`     | 这一页自己的正文                                |
| `::word-count{scope="folder"}`   | 这一页所在目录，**含子目录**                    |
| `::word-count{scope="instance"}` | 所在 docs 实例各版本的合计                      |
| `::word-count{scope="site"}`     | 全站所有 docs 实例                              |

`scope` 只认那四个；写成别的（`{scope="pages"}`、大小写不符、`{scope}` 拼错）时整行原样留下当正文，
与不认识的行同一种落点。

`folder` 的「目录」由源文件的地址算，不看 URL：`packages/theme-word-count/docs/` 那一页数的
是那个目录（递归），不是页面地址的前缀。两个实例挂同一个目录时按目录合计 —— 这一层不按实例
再切一刀。

指令写在 docs 以外的页面里时没有「所在实例」也没有这一页的元数据，除 `site` 以外的范围都退回
全站合计，页面上仍然是那份算好的数。docs 页面里 `page` / `folder` 挑不出数据时同样退回全站。

## 计数口径

正文先按站点编译这一页时那一份语法解析成语法树，再按节点类型数。解析器跟着这一页的
`markdown.format`（`md` / `mdx` / `detect`，判法与 `@docusaurus/mdx-loader` 同形：frontmatter 的
`format` > 站点 `markdown.format` > 扩展名）—— `mdx` 走 remark + MDX + GFM + frontmatter，`md` 走
CommonMark（不挂 MDX）。本站没配 `format`，默认 `mdx`。

| 那一段                                | 怎么算                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 中日韩文字                            | 一个字算一个（假名、汉字、谚文音节；码位段在实现里明写）                                                     |
| 其余文字（拉丁等）                    | 一段连续的字母数字算一个，`don't`、`web-page` 各算一个                                                       |
| 段落、标题、表格格、行内代码          | **数**：那是正文里读得出来的文字                                                                             |
| 代码围栏的内容                        | **数**词、字符与行数；围栏那一行与语言名不数。`mermaid` / `kroki` 记一行「描述性图表」，不算代码段           |
| 链接与图片                            | 链接文字数；链接地址、图片的替代文字与图片地址都**不数**（它们不是正文里读出来的字）                         |
| JSX 属性与 `import` 行                | `mdx` 下**不数**：语法树里不是 `text`；`md`（CommonMark）下它们是普通文字 / 原样 HTML，**要数**              |
| frontmatter                           | **不数**：用站点渲染这一页时同一份解析器剥掉头部那一段 YAML                                                  |
| `::word-count` 那一行（含 `{scope}`） | **不数**：它是看不见的语法，数之前由 `withoutWordCountDirectives()` 剥掉（与范围扫描同一个扫描器）           |
| 四格缩进的代码块                      | `mdx` 不认缩进代码块（当普通文字，那几行进正文数、不进代码段）；`md` 认，那几行算代码段。跟着这一页 `format` |
| 草稿（`draft: true`）                 | **数**：生产构建分到 `drafts`、开发模式留在 `docs`，两列都读、只读一次；明细里另记「草稿数量」               |
| 未列出（`unlisted: true`）            | 数：它也是会被渲染的页面                                                                                     |
| 版本化的旧文档                        | 数：清单里有那几份，各归自己那一格                                                                           |
| 非 markdown 的文档（本站的 `.dbml`）  | 词、字符与页数照数，结构那几行记 0：它不按 MDX 编译，没有语法树可走（头部 YAML 照常剥掉）                    |

「一个词」的两种来源各数一种，所以那一块上同时给出 `中日韩文字` 与 `其余文字` 两行，
它们的和就是 `词数` 那一行。`字符数` 是第三把尺：文字、行内代码与代码块里 `value.length`
的和，与「几个词」互不换算。

标题 id 认两种写法：经典写法 `## 标题 {#custom-id}`（解析前与站点预处理器一样先
`escapeMarkdownHeadingIds`，否则 MDX 当场报 acorn 错）与 MDX 注释写法
`## 标题 {/* #custom-id */}`。

不用 `Intl.Segmenter` 那一种按语言分词：它要按 locale 选，构建机上 ICU 版本换了数就会漂。
码位段写死在这里，同一份内容每次都是同一个数。

## 层栈

本层只提供 `theme/WordCount` 这一格，**不提供 `DocItem`**：`::word-count` 由 remark 插件在
**语法树**上换成 `<__WordCount scope="…" />`，它只是正文里的一个普通组件，插在指令那一处，前后文
原样交给官方那一份 `DocItem`（`@theme-init/DocItem`）。所以标题、目录、面包屑、页脚导航都不受影响，
也不存在「这一页归谁判」的顺序问题。

插件补的那句 import 指向 `@theme/WordCount`：站点在 `src/theme/WordCount` 放一份就换掉它，
与官方那一列别名同一条口径。

## 工作方式

- `::word-count` 的渲染发生在 mdx-loader 编译每一份 markdown 时：站点挂在各内容根 `remarkPlugins`
  里的那个插件，在 mdast 上把指令换成组件节点、并在文档根补一句 `@theme/WordCount` 的 import
  （`md` / `mdx` 两种格式都在语法树上处理，不再靠文本注入）。
- `allContentLoaded` 拿到所有插件的 content，从各 docs 实例那份清单里取出每一条文档的
  地址，解回磁盘上那一份文件、逐页数一遍，再按「实例 + 版本」各合一格。每页那一份同时按
  清单里的 `@site/…` 地址记在 `docs` 里；实例合计（`instances`）与目录合计（`folders`，
  每一格含所有子目录）也在这里先合好，浏览器侧只查表。
- 合好的那份写进 Docusaurus 的生成目录（`.docusaurus/theme-word-count/stats.ts`），
  `WordCount` 用 `@generated/theme-word-count/stats` 读回来 —— 于是静态渲染阶段就有那几个数，
  不必等浏览器再算一遍。
- `WordCount` 按 `scope` 挑：`page` 用 `useDoc()` 的 `metadata.source` 去 `docs` 里取那一格；
  `folder` 把那个地址砍掉最后一段去 `folders` 里查；`instance` 用 `useRouteContext()` 的
  `plugin.id` 去 `instances` 里取；`site` 就是顶层那一整格。页面里不做加法，也就没有第二份
  求和口径。`plugin.id` 与配置期分组用的键是同一个 `plugin.options.id`，`metadata.source` 与
  清单里每页的 `source` 也是同一个 `@site/…`，两份数据之间不需要再维护一张映射表。
- 开发模式下每轮内容重载都会把整份清单再过一遍，但逐文件的明细按原文 memo：只有真改过的那一份
  才重新数，所以改了正文、下一轮数字就跟着变，没改的页不白数。渲染出来的模块与上一轮一字不差时
  不写盘，浏览器也就不跟着白刷一次。
- 那份产物里只有数字，没有生成时间也没有 git 状态：同一份内容两次构建出同一份产物，这条看得见
  的性质不会被一个日期戳吃掉。

## 已知限制

- **要靠站点挂 remark 插件**：`::word-count` 变成组件发生在 remark 阶段，而 Docusaurus 没给主题层留
  全局 `remarkPlugins`（那几格按内容插件各配各的）。所以**每一棵** docs 内容根都要在自己选项里加
  `remarkPlugins: [remarkWordCount]`（见「使用」）。漏挂的那棵根里，写了指令的页面只留一个空容器
  —— 不报错、不泄漏源码，但那一块数不出现。挂上之后 `md` 与 `mdx` 都能渲染（这一点是相对旧的文本
  注入版本改掉的：旧版在 `format: 'md'` 下会把 `import` / `<__WordCount/>` 裸露成正文）。
- **数随构建走**：数字是配置期算的。在开发模式里改一份文档，要等那一次重载跑完才看得见新数；
  已经构建好的静态站点不会自己变。
- **按 MDX 解析正文**：`.md` / `.mdx` 交给与站点同一族解析器。四格缩进的代码块 MDX 不认，
  按普通正文数；正文不是合法 MDX 时告警点名那一份文件、那一页按 0 计，构建不红。非 markdown 的
  文档（`.dbml`）走文字那条路，不受这一条影响。
- **只数 docs 实例**：判据来自各份 docs 实例的清单，所以博客（`plugin-content-blog`）与
  `src/pages` 那些页面不在统计里。这是选定的口径，不是漏掉的分支。
- **块上写的是实例 id**：本站是 `default` 与 `themes`，不是「包文档」「主题文档」那种标题 ——
  路由上下文与配置期分组用的都是 id，没有显示名可取。
- **`instance` 是各版本合计**：同一实例开了多个版本时，`instance` 显示的是该实例各版本的合计
  （本站两份实例各只有一个版本，所以看不到这一层）。`page` 与 `folder` 按文件地址挑，版本化
  的旧文档各看自己那一份。
- **`folder` 按目录算**：不看版本，也不按实例切；两个实例挂同一个目录时那一块是两边合计。
- **生成模块只铺指令用到的明细**：合计、实例合计与分组照旧全铺（`instance` / `site` 读它们）；
  每页明细与目录明细只铺正文里真写了 `page` / `folder` 指令的那几格。本站五十多页里只有一页写
  这两种范围，整份实测 3,753 字节（gzip 后 912 字节）。写 `page` / `folder` 的页越多，那一份才
  跟着长；只写 `instance` / `site` 的站点不为用不到的明细付费。
- **非 markdown 的文档按整份正文数**：本站把 `.dbml` 收进了 docs，它由自己的 loader 渲染、
  不按 MDX 编译。那一份没有语法树可走，词、字符与页数照数，标题 / 代码段 / 链接那些结构行
  记 0；头部 YAML 照常剥掉。
- 一份文件读不到（或者头部那段 YAML 解析不了）会告警点名那一份文件、那一页按 0 计，构建不红，
  其余各页照常 —— 少一排数字不该让整站构建失败。告警里带着路径，所以也不是安静少数。

## 相关文档

- [维护者文档](./docs/internals.md)：组成、指令改写与生成模块的形状、改动时该跑哪几条判据。
- [字数统计示例](./docs/word-count-demo.md)：四种范围各摆一块时长什么样；另一棵内容根的
  `themes/README.md`（站点上的 `/themes/`）也写了同一行指令，两块各写自己那一份。
