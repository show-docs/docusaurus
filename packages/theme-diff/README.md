# @show-docs/docusaurus-theme-diff

在文档页正文上方渲染「上一次改动」的 Docusaurus 主题插件。frontmatter 写 `diff: true` 时，页面
顶部出现这份 markdown 上一个版本与此刻这一份之间的差异视图，正文保持原样。写成
`diff: {old: 旧, new: 新}` 时，比的是磁盘上那两份文件，与 git 历史无关。

## 安装

本层的共享外壳住在 theme-iframe，`@theme-prev/*` 的别名由解析器插件提供，三个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-iframe @show-docs/docusaurus-theme-diff
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@show-docs/docusaurus-theme-iframe',
    '@show-docs/docusaurus-theme-diff'
  ]
};
```

### 写 frontmatter

```md
---
title: 差异视图示例
diff: true
---

# 这份文档的改动
```

差异视图渲染在整页内容上方；正文仍由官方 `DocItem` 正常渲染，标题、目录、翻页都不受影响。

## 层栈

本层提供 `theme/DocItem/index.tsx`：它先向下面那一层要 `DocItem` 的实现
（`@theme-prev/DocItem`），把差异视图摆在它前面，正文那一格照常交下去。命不中（frontmatter
没写 `diff`，或写了却没取到差异）时原样交回，这一页看不出这一层存在过。

层栈怎么推导、谁能盖住谁，是核心解析器那一格的事，见
[`plugin-prev-layer-resolver` 的 README](../plugin-prev-layer-resolver/README.md)；
这一层自己只负责「摆在哪一格」。

## 配置

没有插件选项。`diff` 的值决定比的是什么：

| 写法                       | 作用                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `diff: true`               | 本文自己：上一个版本 → 现在磁盘上这一份（含未提交的改动）     |
| `diff: <路径>`             | 那份文件：上一个版本 → 现在这一份（路径相对这份 md 所在目录） |
| `diff: {old: 旧, new: 新}` | 对照磁盘上的那两份文件，不读 git 历史                         |
| `diff: false`              | 不开启                                                        |
| 不写                       | 不开启                                                        |

单份那条路径写成 `diff: intro.md` 或 `diff: ../other.md` 都行，取的是磁盘上的文件，不要求它在
站点里有页面。右边那一格永远是磁盘上此刻这一份：工作区里还有未提交的改动时，改动就在右边，左边
是这份文件上一次被提交的那一版；工作区干净时，右边就是它最后一次被提交的结果，左边往前再取一次
属于这份文件的改动。

两份那条写成一行 `diff: {old: a.md, new: b.md}`：`old` 是「改动之前」那一份、落在视图左边，
`new` 是「之后」那一份、落在右边，**两条谁写在前头都一样**，角色由键名定。地址同样相对这份 md
所在目录，两边都可以不在 git 仓库里，也可以只是站点里的静态资源；两份内容一模一样时不渲染视图
（构建日志留一句告警）。`old` 与 `new` 两个键凑不齐、或者那两份里有一份在磁盘上不存在，同样
只是不渲染。

## 工作方式

- 构建时由 webpack loader 从磁盘上的源文件读 frontmatter，再调用本机的 `git` 取差异：单份时先看
  工作区里这一份与它上一次被提交时是否一致 —— 不一致就比「这一次提交 → 工作区」，一致才去找动过
  这份文件的最后两个提交、比这两者之间的差异；问 `git` 时路径只圈这一份文件，别的提交没动过它
  就不会进来。两份时直接让 `git` 比这两份文件本身。结果都追加到 md 模块的导出上，差异组件在
  `DocItem` 前渲染。
- 差异视图按站点亮暗模式取色；展开与并排视图（GitHub 的分栏样式）在组件里写死。
- 差异数据在构建时就算好了，成品站点里的这一页不再需要 `git`。
- 视图初始化失败时显示一条提示，正文继续渲染。

## 已知限制

- 只处理 `.md` 文件，`.mdx` 不触发。
- `diff: true` 与单份路径那种来源要求站点源码就在一个 git 仓库里，且这份文件至少提交过一次：一次
  都没提交过就没有「上一个版本」，只提交过一次、之后又没再改动，那一次就是它自己，同样没得比。
  这两种都等于没开这个功能（构建日志里会留一条 warning）。`diff: {old: 旧, new: 新}` 不读 git
  历史，不受这两条限制。
- 这份数据是 loader 的产物，走 webpack 的模块缓存：它的输入只有这份 md 自己，所以「又提交了一次」
  或者被指向的那份文件改了都不会让它重算，改动这份 md（或清掉构建缓存）才会。
- 构建机器上要能找到 `git`；取不到差异时只跳过这一块视图，不影响整站构建。
- frontmatter 必须是文件开头的 YAML 块；写在正文里的 `diff:` 不会生效。两份那种写法要落在同一行，
  而且那两个地址里不能带逗号 —— 判据按逗号分两项，跟 YAML 自己怎么读这份 frontmatter 无关。

## 相关文档

- [维护者文档](./docs/internals.md)：组成、`git` 那几步、取不到差异时的几种落点。
- [差异视图示例](./docs/diff-demo.md)（一份文件的上一个版本 → 此刻这一份）。
- [两份文件对照示例](./docs/diff-pair-demo.md)（`diff: {old: 旧, new: 新}`）。
- [git-diff-view 文档](https://mrwangjusttodo.github.io/git-diff-view)。
