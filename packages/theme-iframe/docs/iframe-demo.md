---
id: iframe-demo
sidebar_position: 3
title: iframe 示例
description: 'frontmatter 写 iframe: <URL>，整页换成那个页面。'
# 命中 theme-iframe 那一层：整页换成这个地址。
# 值以 `/` 开头 → 按当前站点 origin 补成绝对地址，所以这里嵌的是本站另一页（离线可看）。
iframe: /404
---

# iframe 示例

本文件的 frontmatter 写了 `iframe: /404`，`packages/theme-iframe` 在自己的 `loadContent()` 里把
`iframe:` 这条规则交给 `packages/theme-component-page`；站点那一列 `rules` 里它排在
`scalar` / `redoc` / `stoplight` 之后，这一页又没有别的键，于是就轮到它 —— 整个 `DocItem` 被换成
那个包里的 `@theme/ExternalFrame`（`render` 缺省即 `page`，铺在正文里，不走那条
`/__component-frame` 同源框路由）。

下面这些正文在渲染后的页面上**看不到**：这一页整页交给 iframe，这一段是给读仓库源文件的人看的。

- 命中的那一页不再有文档正文外壳：面包屑、正文、翻页、右侧目录都不渲染，站点的 navbar 还在。
  浏览器标签页的标题也因此退回站点名（官方 `DocItem/Metadata` 一并不要）。
- 嵌的是 `/404`，也就是站点自己那页未找到页 —— 它跟这一层无关，只用来证明「目标页在框里真的
  渲染出来」，而且不依赖外网。想换别的页面：地址栏带 `?path=<相对路径>`，会在 `iframe:` 那个
  地址之下再解一层（只对 `path` 那一个参数解码，收尾不再解整串）。
- 同一页同时写 `iframe:` 与 `stoplight: true` 时，整页交给站点 `rules` 清单里排在前面那一把
  （本站是 `stoplight`），本层不出现 —— 先后由那份清单定，细节记在
  `packages/theme-iframe/README.md`（站点文档源只收 `docs/`，链接出去只会是死链）。
- `oas3:` / `aas3:`（三条 API 层读它们当渲染源）与这一把键**没有关系**：它们给的是 spec 地址，
  本层嵌的是外部页面，地址自带。
