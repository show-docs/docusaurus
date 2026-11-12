---
title: 主题包说明
description: '/themes/ 落地页：四个功能层主题包，各自占侧边栏一顶层格；这一页正文里也写了一次 ::word-count。'
---

import DocCardList from '@theme/DocCardList';

# 主题包说明

这一族是**功能层主题包**：它们各接管站点已有的一格（导航栏、页脚、侧边栏、正文），只在命中
自己的触发条件时动。四个包都在 `themes/` 下，站点因此给它们单独挂了一份
`@docusaurus/plugin-content-docs` 实例，`routeBasePath` 是 `/themes` —— 所以这一页落在 `/themes/`，
`theme-viewer` 的示例页落在 `/themes/theme-viewer/docs/viewer-demo`。

## 与 `packages/` 那一族的差别

站点有**两棵内容根**，各自一份文档插件实例，规则一样、只是根不同：

|                | 内容根      | 前缀            | 侧边栏                |
| -------------- | ----------- | --------------- | --------------------- |
| 插件与基础设施 | `packages/` | `/`（无目录段） | `sidebars.mts`        |
| 功能层主题包   | `themes/`   | `/themes`       | `sidebars-themes.mts` |

于是「页面上的地址等于文件相对内容根的路径」这句话要按**所属的那一棵**读：`packages/` 里的
`theme-erd/docs/erd-demo.dbml` 是 `/theme-erd/docs/erd-demo`，`themes/` 里的
`theme-viewer/docs/viewer-demo.md` 是 `/themes/theme-viewer/docs/viewer-demo`。
两份侧栏共用同一份扫描逻辑（仓库根的 `sidebars-lib.mts`），只是各扫自己那一棵根，
新增一个包不必回来改这里。

侧边栏徽标在两棵根都生效：`theme-git-badge` 不按内容根筛 —— 注入包住站点全局的解析器，
两棵根里的页一视同仁。

<DocCardList />

卡片不写清单：不接 `items` 时官方取的就是这一页在侧边栏里的兄弟项，那份根级清单由
`sidebars-themes.mts` 扫 `themes/` 得到，卡片说明取自各包 `package.json` 的 `description`；
这一页自己也在侧边栏头一格，所以列表第一张是它本身。

示例页跟着包走，触发条件各判各的：头像看站点配置里的 `userApi`（不写就整层不启用），复制按钮
看 `themeConfig.footer.copyright` 那一格在不在，图片查看器看正文里有没有图片，侧边栏徽标看 git；
都不命中的页面那一层等于透明。

## 这一页自己的字数

::word-count

这一块数的是**这一棵内容根**（实例 `themes`）：`themes/` 里每个包的 README 与 `docs/` 下的页
都在里面，块上写着的就是 `内容根 themes`。`packages/` 那一棵的示例页
（`/theme-word-count/docs/word-count-demo`）也写了一行同样的指令，看到的是 `default` 那一份
—— 两棵树各挑自己那一格，不是同一串数。

指令写在正文的哪一处，块就出现在哪一处：这一行摆在标题下面，所以它落在本节开头；
`/themes/` 本来就是这一棵内容根的索引页，两棵树各有一页写指令，正好对着看。
统计的触发条件、计数口径与已知限制在
[`theme-word-count` 的 README](/theme-word-count/)。
