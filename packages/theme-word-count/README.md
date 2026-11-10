# @show-docs/docusaurus-theme-word-count

统计全站文档字数、并把**这一页所在内容根**的那一份显示在正文上方的 Docusaurus 主题插件。
frontmatter 写 `wordCount: true` 的那一页，正文上方多出一块那个内容根（docs 实例）的词数与页数；
整站的数在构建期算好，页面只挑自己那一份。正文一个字都不动。

数是**构建时算一次的**，不是打开页面时现算的：静态产物里就有那几个数字，首屏就能看到。

## 安装

「这一页交给谁」由 theme-component-page 判，「谁来编本包那份未编译的 `.tsx`」由
`@show-docs/docusaurus-plugin-compile-source` 那一条 babel 规则负责，三个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-compile-source @show-docs/docusaurus-theme-component-page @show-docs/docusaurus-theme-word-count
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-compile-source',
    '@show-docs/docusaurus-theme-word-count',
    '@show-docs/docusaurus-theme-component-page'
  ]
};
```

本层在自己的 `loadContent()` 里交回一对条目（`componentPage`：组件 `@theme/WordCountPage`
登记成 `word-count`，规则 `{ key: 'wordCount', match: 'boolean' }`），由 theme-component-page
那份 `DocItem` 判表后整页换成它。所以 component-page 要注册，而且要写在本层**之后**。
那条顺序只管「这一页归谁判」，不管同一页写中多把键时谁先命中（那看站点 component-page 那一列
`rules` 的顺序）—— 两件事都记在
[component-page 的 README](../theme-component-page/README.md) 的「层栈与代价」那一节，这里不抄第二份。

注册之后不需要再配任何东西：统计读的是**各 docs 实例已经加载到的那份清单**，站点不必把
`path` / `include` / `exclude` 再转述一遍。

### 写 frontmatter

```md
---
title: 全站字数
wordCount: true
---

# 这一页显示所在内容根的字数
```

`wordCount: false`、不写、或者写成字符串和选项对象都不算命中（判法是「认真布尔 `true`」），
那一页就是普通文档页。命中之后显示的是**这一页所在内容根**的数：页面在哪个 docs 实例就只显示
那个实例，同一个实例里的另一页再命中看到的是同一份数；它与这一页自己写了什么无关。

## 计数口径

| 那一段                     | 怎么算                                                                    |
| -------------------------- | ------------------------------------------------------------------------- |
| 中日韩文字                 | 一个字算一个（假名、汉字、谚文音节；码位段在实现里明写）                  |
| 其余文字（拉丁等）         | 一段连续的字母数字算一个，`don't`、`web-page` 各算一个                    |
| frontmatter                | **不数**：用站点渲染这一页时同一份解析器剥掉头部那一段 YAML               |
| 代码块、表格               | **数**：里面的标识符、文字都是词；语法符号（`#`、`\|`、反引号）两类都不算 |
| 正文里的标题行             | 数（那是看得见的文字）                                                    |
| 草稿（`draft: true`）      | 不数：官方把它分出去了，清单里没有那一份                                  |
| 未列出（`unlisted: true`） | 数：它也是会被渲染的页面                                                  |
| 版本化的旧文档             | 数：清单里有那几份，各归自己那一格                                        |

「一个词」的两种来源各数一种，所以那一块上同时给出 `中日韩文字` 与 `其余文字` 两个数，
它们的和就是显示在最前面的那一个。

不用 `Intl.Segmenter` 那一种按语言分词：它要按 locale 选，构建机上 ICU 版本换了数就会漂。
码位段写死在这里，同一份内容每次都是同一个数。

## 层栈

本层不提供 `DocItem`：它在 `loadContent()` 里交出一把 `wordCount` 条目（判法 `boolean`，
组件指回 `@theme/WordCountPage`），由 theme-component-page 在最外那一格命中后把整页换掉。
`WordCountPage` 自己也不拼外壳 —— 统计摆在正文上方，正文原样交给官方那一份 `DocItem`
（`@theme-init/DocItem`；仓库里只有 component-page 这一层提供 `DocItem`，没有要串的链），
所以标题、目录、面包屑、页脚导航都不受影响。

## 工作方式

- 配置期的 `allContentLoaded` 拿到所有插件的 content，从各 docs 实例那份清单里取出每一条文档的
  地址，解回磁盘上那一份文件、逐页数一遍，再按「实例 + 版本」各合一格。
- 合好的那份写进 Docusaurus 的生成目录（`.docusaurus/theme-word-count/stats.ts`），
  `WordCountPage` 用 `@generated/theme-word-count/stats` 读回来 —— 于是静态渲染阶段就有那几个数，
  不必等浏览器再算一遍。
- `WordCountPage` 再用 `useRouteContext()` 拿当前路由所属的 docs 实例 id，从各格里挑出同一个实例
  再合计。那个 id 与配置期分组用的键是同一个 `plugin.options.id`，两份数据之间不需要再维护一张
  「页面 → 格」的映射表。
- 开发模式下每轮内容重载都会全量重算并整份覆写那份文件，所以改了正文、下一轮数字就跟着变。
- 那份产物里只有数字，没有生成时间也没有 git 状态：同一份内容两次构建出同一份产物，这条看得见
  的性质不会被一个日期戳吃掉。

## 已知限制

- **数随构建走**：数字是配置期算的。在开发模式里改一份文档，要等那一次重载跑完才看得见新数；
  已经构建好的静态站点不会自己变。
- **只数 docs 实例**：判据来自各份 docs 实例的清单，所以博客（`plugin-content-blog`）与
  `src/pages` 那些页面不在统计里。这是选定的口径，不是漏掉的分支。
- **块上写的是实例 id**：本站是 `default` 与 `themes`，不是「包文档」「主题文档」那种标题 ——
  路由上下文与配置期分组用的都是 id，没有显示名可取。
- **只显示所在的内容根**：一页只看自己所属的那一份。同一实例开了多个版本时，显示的是该实例各
  版本的合计（本站两份实例各只有一个版本，所以看不到这一层）。
- 内容根里非 markdown 的那几份（本站是 `.dbml` 那一份示例）也照数：它们没有 frontmatter 可剥，
  整份正文都进数。
- 一份文件读不到（或者头部那段 YAML 解析不了）就是构建失败，不会安静少数 —— 那一份文件本来
  就已经被 docs 实例加载过一次，走到这一步读不到说明磁盘与清单对不上了。
- 本层不查「theme-component-page 装没装」。缺了它的症状是「页面看着正常但统计不出现」，
  由站点那份 `plugins` 清单自己负责。

## 相关文档

- [维护者文档](./docs/internals.md)：组成、生成模块的形状、改动时该跑哪几条判据。
- [全站字数示例](./docs/word-count-demo.md)：命中那一格时长什么样；另一棵内容根的
  `themes/README.md`（站点上的 `/themes/`）也写了同一把键，两块各写自己那一份。
