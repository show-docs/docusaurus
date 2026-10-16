---
id: iframe-demo
sidebar_position: 3
title: iframe 示例
# 命中 theme-iframe 那一层：正文区下面嵌一个 iframe。
# 值以 `/` 开头 → 按当前站点 origin 补成绝对地址，所以这里嵌的是本站另一页（离线可看）。
iframe: /markmap-demo
---

# iframe 示例

本文件的 frontmatter 写了 `iframe: /markmap-demo`，`theme/theme-iframe` 那一层命中后把
`DocItem` 的内边距关掉（`shellPadding={false}`），iframe 占满正文区域。

- 这一页在**开发模式（`pnpm start`）不嵌**：本地改动会不断重载被嵌的页面，太吵。那时页面上
  是一段提示加一个可点开的链接，指向算出来的同一个 URL。要看真的 iframe 用构建产物：
  `pnpm build && pnpm serve`。
- 地址栏再带一个 `?path=<相对路径>`，会在 `iframe:` 那个地址之下再解一层（用来切外部站点的子页），
  最后整体 `decodeURIComponent` 一次。

同一页同时写 `iframe:` 与 `oas3:` 时，整页交给 Stoplight 那一层，本层不出现 —— 层的顺序
决定谁赢，细节记在 `theme/theme-iframe/README.md`（站点文档源只收 `docs/`，链接出去只会是死链）。
