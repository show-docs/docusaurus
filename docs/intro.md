---
id: intro
slug: /
sidebar_position: 1
title: 项目说明
description: 主页：验证的问题、常用命令，以及各主题示例页的入口。
---

import DocCardList from '@theme/DocCardList';

# 项目说明

本项目用于验证 Docusaurus 主题覆盖机制，让「多个主题层层包裹同一组件」变为可行：

1. 多个主题覆盖同一个组件会发生什么？
2. `@theme-original` 是否可以实现链式包裹？
3. 如何让链式覆盖**真正成立**，同时不改动官方别名语义？

## 示例页

每个主题包各占一份文档源，frontmatter 里的触发键就是那一层的判据；不命中的页面那一层等于透明。

<DocCardList />

卡片列表不写清单：官方 `@theme/DocCardList` 不接 `items` 时，取的就是这一页所在侧边栏的兄弟项，
而侧边栏由 docs 插件按 `docs/` 目录自动生成 —— 新增一份示例页，主页自动多一张卡片，
不用在这里抄第二份。卡片上那行说明取自各页 frontmatter 的 `description:`。
这一页自己也在侧边栏里，所以列表的头一张是它本身。

链式覆盖本身（`Logo` 与 `DocItem/Footer` 两层 swizzle）没有单独的示例页：它的判据是构建产物里
那条渲染链，用 `pnpm build && pnpm verify:chain` 回读。

## 文档

- 链式覆盖方案（docusaurus-plugin-prev-layer-resolver）—— 落地实现：`@theme-prev/X` 系列 specifier；正文在仓库里的 `plugins/plugin-prev-layer-resolver/README.md`（站点文档源只收 `docs/`，链接出去只会是死链）。
- 各主题包的行为与约束：`theme/theme-{markmap,iframe,stoplight}/README.md`、`demo/theme-{a,b,c}/`，同样在仓库里。

## 命令

```bash
pnpm install
pnpm start          # 本地预览
pnpm build          # 构建
pnpm test           # 单元测试：解析语义、链式不变量、真实 resolver 端到端
pnpm verify:chain   # 读真实 build 产物，验证链式覆盖成立（先跑 pnpm build）
```
