---
id: word-count-demo
sidebar_position: 1
title: 全站字数示例
description: 'frontmatter 写 wordCount: true，正文上方显示这一页所在内容根的字数。'
wordCount: true
---

# 全站字数示例

这一页的 frontmatter 写了 `wordCount: true`，所以正文上方多出一块统计：**这一页所在内容根**
一共多少个词、来自多少页。数是构建时按整站算好的，正文一个字都不动 —— 标题、目录、翻页都在
原来的位置。

那一块只写这一页所在的那一根：这一页在 `default` 实例，看到的就是 `default` 的数；另一棵内容根
也有一页写了同一把键（`/themes/` 落地页，实例 `themes`），那一块写的是 `themes` 那一份。同一个
根里的另一页再命中，看到的还是同一串数。写 `wordCount: false` 或不写，这一格就不出现，这一页
退回普通文档页。

## 数的是哪些文件

站点里有两份 docs 实例（`packages/` 与 `themes/` 那两棵内容根），各自那份清单加载到什么，这里
就数什么；这一页属于 `packages/` 那一份（实例 id 是 `default`），`/themes/` 那一页属于另一份
（实例 id 是 `themes`）。判据、代价与已知的口径都记在 `packages/theme-word-count/README.md`
（站点文档源只收 `docs/`，链接到包根那份只会是死链）。

## 数的是哪些字

代码块与表格都算进总数，但 markdown 自己的语法符号不算词：`#`、表格的竖线、反引号、链接的
圆括号都不是字母也不是数字，两类都不认。链接地址里的那些段（`example`、`com`）按同样的规则
算词，因为它们在正文里就是看得见的一串字符。
