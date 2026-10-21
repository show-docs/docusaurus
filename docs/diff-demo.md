---
id: diff-demo
sidebar_position: 11
title: 差异视图示例
description: 'frontmatter 写 diff，正文最上方渲染这份文件最近一次提交的差异视图。'
diff: intro.md
---

# 差异视图示例

这一页的 frontmatter 写的是 `diff: intro.md`，所以上方那块视图对比的是主页 `docs/intro.md`
最近一次提交的改动 —— 指向别的文件也可以，路径相对这份 md 所在的目录算。

写 `diff: true` 就是对比本文自己。

视图取的是两个提交之间的差异：改动之前那份内容在左边，最近一次提交的结果在右边，并排显示，
中间只列出真正变化的那几段。配色跟着站点的亮暗模式走。

没有可对比的上一次改动时（这份文件只提交过一次，或者改动还没提交），这一页等于没开这个功能，
正文照常渲染。判据与代价记在 `theme/theme-diff/README.md`（站点文档源只收 `docs/`，链接出去
只会是死链）。
