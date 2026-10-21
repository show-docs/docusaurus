# @show-docs/docusaurus-theme-diff

在文档页正文上方渲染「上一次改动」的 Docusaurus 主题插件。frontmatter 写 `diff: true` 时，页面
顶部出现这份 markdown 最近一次提交里的差异视图，正文保持原样。

## 安装

```bash
pnpm add @show-docs/docusaurus-theme-diff
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: ['@show-docs/docusaurus-theme-diff']
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
没写 `diff`，或写了却没取到上一次改动）时原样交回，这一页看不出这一层存在过。

层栈怎么推导、谁能盖住谁，是核心解析器那一格的事，见
[`plugin-prev-layer-resolver` 的 README](../../plugins/plugin-prev-layer-resolver/README.md)；
这一层自己只负责「摆在哪一格」。

## 配置

没有插件选项。`diff` 的值决定对比哪份文件：

| 写法           | 作用                               |
| -------------- | ---------------------------------- |
| `diff: true`   | 对比本文自己                       |
| `diff: <路径>` | 对比这份 md 所在目录下的另一个文件 |
| `diff: false`  | 不开启                             |
| 不写           | 不开启                             |

路径写成 `diff: intro.md` 或 `diff: ../other.md` 都行，取的是磁盘上的文件，不要求它在站点里有页面。

## 工作方式

- 构建时由 webpack loader 从磁盘上的源文件读 frontmatter，再调用本机的 `git` 取这份文件的
  最近一次改动：先找出动过它的最后两个提交，再对比这两者之间的差异与改动之前的内容，把结果
  追加到 md 模块的导出上；差异组件在 `DocItem` 前渲染。
- 差异视图按站点亮暗模式取色；展开与并排视图（GitHub 的分栏样式）在组件里写死。
- 差异数据在构建时就算好了，成品站点里的这一页不再需要 `git`。
- 视图初始化失败时显示一条提示，正文继续渲染。

## 已知限制

- 只处理 `.md` 文件，`.mdx` 不触发。
- 要求站点源码就在一个 git 仓库里，且这份文件至少提交过两次；只提交过一次、或者只在
  工作区里改动过，都没有「上一次」可对比，这一页等于没开这个功能（构建日志里会留一条 warning）。
- 对比的是两个提交之间的差异，工作区里尚未提交的改动不会出现在视图里。
- 这份数据是 loader 的产物，走 webpack 的模块缓存：它的输入只有这份 md 自己，所以「又提交了一次」
  不会让它重算，改动这份 md（或清掉构建缓存）才会。
- 构建机器上要能找到 `git`；取不到历史时只跳过这一块视图，不影响整站构建。
- frontmatter 必须是文件开头的 YAML 块；写在正文里的 `diff:` 不会生效。

## 相关文档

- [维护者文档](./docs/internals.md)：组成、`git` 那几步、取不到历史时的几种落点。
- [差异视图示例](../../docs/diff-demo.md)。
- [git-diff-view 文档](https://mrwangjusttodo.github.io/git-diff-view)。
