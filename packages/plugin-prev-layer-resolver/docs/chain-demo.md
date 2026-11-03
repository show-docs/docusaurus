---
id: chain-demo
sidebar_position: 2
title: 链式覆盖示例
description: '四个主题层层包裹 ChainDemo 的那一格：外面数下来是 [SITE] [C] [B] [A]。'
hide_table_of_contents: true
---

import ChainDemo from '@theme/ChainDemo';

# 链式覆盖示例

这一页是那条链唯一的真渲染处。`ChainDemo` 这个组件在仓库里有**五层**提供：站点层 `src/theme`、
`tools/` 那三层假主题（`theme-c` / `theme-b` / `theme-a`），以及链底那一层（`theme-base`）。上面
四层都用 `@theme-prev/ChainDemo` 包住**紧邻下面那一层**，所以四层一份都没丢 —— 外面数下来是
`[SITE]` → `[C]` → `[B]` → `[A]`，最里面才是链底那份组件本体。

## 那一格

下面这块就是 `ChainDemo`，它被那四层包着：

<ChainDemo />

## 这一页钉住什么

- **四层都在**：页面上数得出来 `[SITE]` / `[C]` / `[B]` / `[A]` 四个角标。
- **每层写法相同**：三层假主题与站点层是同一段写法，只是各自包住的对象不同。
- **链底有实现**：theme-a 的 `@theme-prev/ChainDemo` 落到 `theme-base` 那一层 —— 组件本体就在那里。

判据在两头：构建产物由 `pnpm verify:chain` 回读这一页的 HTML，浏览器里的嵌套由
`pnpm test:e2e` 的用例钉住。机制与取舍见
[`../README.md`](../README.md)，实现记录见[维护者文档](./internals.md)。
