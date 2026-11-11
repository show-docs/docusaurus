# @show-docs/docusaurus-theme-word-count

统计文档字数、并在正文任意位置显示其中一份的 Docusaurus 主题插件。正文里写一行
`:::word-count`，**指令所在的位置**就多出一块统计。不写范围时是**这一页所在内容根**（docs
实例）的词数与页数；后面写一个词可以换成**本页**、**本文件夹（含子目录）**或**全站**。
整站的数在构建期算好，页面只挑自己那一份。正文其余部分一个字都不动。

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

本层在自己的 `loadContent()` 里把站点那份 `markdown.preprocessor` 包上一层：遇到
`:::word-count` 就换成正文里的一个组件，并在文首（frontmatter 之后）补一句
`import … from '@theme/WordCount'`。所以它**不与** theme-component-page 打交道：不交规则、
也不要求站点再注册任何一层。站点自己配了 `markdown.preprocessor` 时照常生效，本层接在它后面。

注册之后不需要再配任何东西：统计读的是**各 docs 实例已经加载到的那份清单**，站点不必把
`path` / `include` / `exclude` 再转述一遍。

### 写指令

```md
# 字数统计

正文开头这一段照常渲染。

:::word-count

## 后面的内容

指令写在哪儿，那一块就出现在哪儿。
```

认的形状只有一行：最多三格缩进、行内只有 `:::word-count`，后面可以跟一个范围词。紧跟一行
`:::` 时那一行一并吃掉（容器式写法，写不写都行）；代码围栏（` ``` ` 或 `~~~`）与四格缩进的
代码块里的同形文字不算指令，它们是示例正文。指令本身不算词。

| 写法                     | 那一块数的是                                    |
| ------------------------ | ----------------------------------------------- |
| `:::word-count`          | 这一页所在的 docs 实例（缺省，等同 `instance`） |
| `:::word-count page`     | 这一页自己的正文                                |
| `:::word-count folder`   | 这一页所在目录，**含子目录**                    |
| `:::word-count instance` | 所在 docs 实例各版本的合计                      |
| `:::word-count site`     | 全站所有 docs 实例                              |

范围词只认那四个；写错（例如 `:::word-count pages`）时整行原样留下，与不认识的行同一种落点。

`folder` 的「目录」由源文件的地址算，不看 URL：`packages/theme-word-count/docs/` 那一页数的
是那个目录（递归），不是页面地址的前缀。两个实例挂同一个目录时按目录合计 —— 这一层不按实例
再切一刀。

指令写在 docs 以外的页面里时没有「所在实例」也没有这一页的元数据，除 `site` 以外的范围都退回
全站合计，页面上仍然是那份算好的数。docs 页面里 `page` / `folder` 挑不出数据时同样退回全站。

## 计数口径

| 那一段                             | 怎么算                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------- |
| 中日韩文字                         | 一个字算一个（假名、汉字、谚文音节；码位段在实现里明写）                  |
| 其余文字（拉丁等）                 | 一段连续的字母数字算一个，`don't`、`web-page` 各算一个                    |
| frontmatter                        | **不数**：用站点渲染这一页时同一份解析器剥掉头部那一段 YAML               |
| `:::word-count` 那一行（含范围词） | **不数**：它是看不见的语法，与预处理器共用同一个扫描器剥掉                |
| 代码块、表格                       | **数**：里面的标识符、文字都是词；语法符号（`#`、`\|`、反引号）两类都不算 |
| 正文里的标题行                     | 数（那是看得见的文字）                                                    |
| 草稿（`draft: true`）              | 不数：官方把它分出去了，清单里没有那一份                                  |
| 未列出（`unlisted: true`）         | 数：它也是会被渲染的页面                                                  |
| 版本化的旧文档                     | 数：清单里有那几份，各归自己那一格                                        |

「一个词」的两种来源各数一种，所以那一块上同时给出 `中日韩文字` 与 `其余文字` 两个数，
它们的和就是显示在最前面的那一个。

不用 `Intl.Segmenter` 那一种按语言分词：它要按 locale 选，构建机上 ICU 版本换了数就会漂。
码位段写死在这里，同一份内容每次都是同一个数。

## 层栈

本层只提供 `theme/WordCount` 这一格，**不提供 `DocItem`**：指令由预处理器换成
`<__WordCount scope="…" />`，它只是正文里的一个普通组件，插在指令那一处，前后文原样交给官方
那一份 `DocItem`（`@theme-init/DocItem`）。所以标题、目录、面包屑、页脚导航都不受影响，也不
存在「这一页归谁判」的顺序问题。

写进正文的 import 指向 `@theme/WordCount`：站点在 `src/theme/WordCount` 放一份就换掉它，
与官方那一列别名同一条口径。

## 工作方式

- 配置期所有插件的 `loadContent()` 都早于 webpack 配置，本层在这一步把预处理器挂上；
  mdx-loader 编译每一份 markdown 时读到的就是包过的那一份（站点自己那份先跑，本层在它的
  结果上认指令）。
- `allContentLoaded` 拿到所有插件的 content，从各 docs 实例那份清单里取出每一条文档的
  地址，解回磁盘上那一份文件、逐页数一遍，再按「实例 + 版本」各合一格；每页那一份同时按
  清单里的 `@site/…` 地址记在 `docs` 里，供 `page` / `folder` 那一侧挑。
- 合好的那份写进 Docusaurus 的生成目录（`.docusaurus/theme-word-count/stats.ts`），
  `WordCount` 用 `@generated/theme-word-count/stats` 读回来 —— 于是静态渲染阶段就有那几个数，
  不必等浏览器再算一遍。
- `WordCount` 按 `scope` 挑：`page` 用 `useDoc()` 的 `metadata.source` 去 `docs` 里取那一格；
  `folder` 按那个地址的目录前缀对 `docs` 求和（前缀右侧带 `/`，子目录自然在里面）；`instance`
  用 `useRouteContext()` 的 `plugin.id` 从各格里挑出同一个实例再合计；`site` 就是顶层那三个数。
  `plugin.id` 与配置期分组用的键是同一个 `plugin.options.id`，`metadata.source` 与清单里每页的
  `source` 也是同一个 `@site/…`，两份数据之间不需要再维护一张映射表。
- 开发模式下每轮内容重载都会全量重算并整份覆写那份文件，所以改了正文、下一轮数字就跟着变。
- 那份产物里只有数字，没有生成时间也没有 git 状态：同一份内容两次构建出同一份产物，这条看得见
  的性质不会被一个日期戳吃掉。

## 已知限制

- **不是真正的 remark 指令**：`markdown` 配置没有给主题层留 `remarkPlugins`（那几格按内容
  插件各配各的），本层零配置能改的只有 `markdown.preprocessor`。于是 `:::` 的容器语义、属性
  写法（`:::word-count title="…"`）都不支持 —— 认的只有上面那一种整行写法。
- **那一份文件要按 MDX 解析**：指令换出来的是 MDX 里的一个组件与一句 import。站点把
  `markdown.format` 配成 `'md'`（或在 `'detect'` 下拿 `.md` 写指令）时，那两行不按 MDX 编译：
  页面上会多出 `import __WordCount from '@theme/WordCount';` 与
  `<__WordCount scope="instance" />` 两行可见文字，统计块不出现。缺省 `'mdx'` 不受影响。
- **数随构建走**：数字是配置期算的。在开发模式里改一份文档，要等那一次重载跑完才看得见新数；
  已经构建好的静态站点不会自己变。
- **只数 docs 实例**：判据来自各份 docs 实例的清单，所以博客（`plugin-content-blog`）与
  `src/pages` 那些页面不在统计里。这是选定的口径，不是漏掉的分支。
- **块上写的是实例 id**：本站是 `default` 与 `themes`，不是「包文档」「主题文档」那种标题 ——
  路由上下文与配置期分组用的都是 id，没有显示名可取。
- **`instance` 是各版本合计**：同一实例开了多个版本时，`instance` 显示的是该实例各版本的合计
  （本站两份实例各只有一个版本，所以看不到这一层）。`page` 与 `folder` 按文件地址挑，版本化
  的旧文档各看自己那一份。
- **`folder` 按目录算**：不看版本，也不按实例切；两个实例挂同一个目录时那一块是两边合计。
- **生成模块随页数长**：`page` / `folder` 要在浏览器里挑，所以那份产物带上了每页的明细。本站
  54 页实测约 4.6 KB（gzip 后约 1 KB，每页约 86 B / gzip 后约 18 B）；一千页时大致 +85 KB
  （gzip 后约 +18 KB）。只写 `instance` / `site` 的站点也照付这份大小，这是换「页面能按目录
  挑数」的代价。
- 内容根里非 markdown 的那几份（本站是 `.dbml` 那一份示例）也照数：它们没有 frontmatter 可剥，
  整份正文都进数。
- 一份文件读不到（或者头部那段 YAML 解析不了）就是构建失败，不会安静少数 —— 那一份文件本来
  就已经被 docs 实例加载过一次，走到这一步读不到说明磁盘与清单对不上了。

## 相关文档

- [维护者文档](./docs/internals.md)：组成、指令改写与生成模块的形状、改动时该跑哪几条判据。
- [字数统计示例](./docs/word-count-demo.md)：四种范围各摆一块时长什么样；另一棵内容根的
  `themes/README.md`（站点上的 `/themes/`）也写了同一行指令，两块各写自己那一份。
