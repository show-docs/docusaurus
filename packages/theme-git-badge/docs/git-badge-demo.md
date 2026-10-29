---
id: git-badge-demo
sidebar_position: 4
title: 侧边栏徽标示例
description: '这一页在侧边栏里带一枚纯色点：frontmatter 写 git_badge: new 就由页面说了算，不写才由 git 判。'
git_badge: new
---

# 侧边栏徽标示例

这一页在侧边栏里那一格后面带一枚**纯色点**（绿的）。颜色即语义：

| 徽标   | 颜色                        | 什么时候                       |
| ------ | --------------------------- | ------------------------------ |
| 新建   | 绿（`--ifm-color-success`） | 只提交过一次，且最近动过       |
| 更新   | 橙（`--ifm-color-warning`） | 提交过两次以上，但最近动过     |
| 不表态 | ——                          | 不在「最近」里，或压根没有历史 |

「最近」有两个口径，落在哪个都算：commit 在 **7 天内**，或者在全仓**最后 5 个 commit** 里。

这一页之所以**确定**是绿的，是因为 frontmatter 里写死了 `git_badge: new` —— 那是**钉子**，
不是判断：写它就不问 git。写它只影响侧边栏那一格，正文里不会多出任何东西。

不写那把键时由 git 判。判据读的是这份文件的两个时刻（第一次提交、最后一次改动）与「最近动过
没有」，都取自 `HEAD` 那条线 —— 文件在别的分支上新建与否，与本站点无关。判不出来就**不表态**，
那一格就没有徽标，而不是画成别的颜色。

徽标是**那一行 `<a>` 上的一个属性**（`data-git-badge`），形状由 CSS 画：叶子行是一个纯色点，
不带文字也不带链接。文字是第二份要跟着语义走的文案，链接会让这枚状态标记看起来像一处导航。

判与画都在 `@show-docs/docusaurus-theme-git-badge` 里：它读 git 判出种类，写进官方那条
`sidebar_custom_props` 通道，官方把它抄到侧边栏项的 `customProps` 上，这一层覆盖的
`DocSidebarItem/Link` 与 `DocSidebarItem/Category` 两格把种类写成 `data-git-badge`，形状
由包里那份样式表画。分类那一行**不画点** —— 颜色染在它本来就有的折叠箭头上；它看的是整棵
子树：子页新建或更新过时，父分类的箭头也跟着变色。

事实与代价记在 `packages/theme-git-badge/README.md`（站点文档源只收 `docs/`，链接出去只会是
死链），取舍与实测证据记在 `packages/theme-git-badge/docs/internals.md`。
