---
id: word-count-demo
sidebar_position: 1
title: 字数统计示例
description: '正文里写一行 :::word-count，那一处就显示字数；后面加一个词可以换范围。'
---

# 字数统计示例

这一页的正文里有几行 `:::word-count`，所以指令所在的位置多出一块统计。不写范围时是**这一页所在
内容根**的数；后面写 `page` / `folder` / `site` 分别换成**本页**、**本文件夹（含子目录）**、
**全站**。数是构建时按整站算好的，正文其余部分一个字都不动 —— 标题、目录、翻页都在原来的位置。

:::word-count

## 数的是哪些文件

站点里有两份 docs 实例（`packages/` 与 `themes/` 那两棵内容根），各自那份清单加载到什么，这里
就数什么；这一页属于 `packages/` 那一份（实例 id 是 `default`），`/themes/` 那一页属于另一份
（实例 id 是 `themes`）。判据、代价与已知的口径都记在 `packages/theme-word-count/README.md`
（站点文档源只收 `docs/`，链接到包根那份只会是死链）。

## 换个范围

范围写在指令后面。下面三块按从小到大排：

### 本页

只数这一页自己的正文：

:::word-count page

### 本文件夹

这一页在 `theme-word-count/docs/` 里，这一块数的是那个目录下的所有页，子目录里的也算：

:::word-count folder

### 全站

两棵内容根（`default` 与 `themes`）的合计：

:::word-count site

## 数的是哪些字

代码块与表格都算进总数，但 markdown 自己的语法符号不算词：`#`、表格的竖线、反引号、链接的
圆括号都不是字母也不是数字，两类都不认。链接地址里的那些段（`example`、`com`）按同样的规则
算词，因为它们在正文里就是看得见的一串字符。指令本身是看不见的语法，不数。
