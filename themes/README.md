---
title: 主题包说明
description: /themes/ 落地页：带渲染器的四个主题包，各自占侧边栏一顶层格。
---

import DocCardList from '@theme/DocCardList';

# 主题包说明

这一族是**带渲染器的主题包**：它们不改站点已有的那一格（导航栏、页脚、侧边栏），而是在文档页
命中自己的触发条件时换掉或加上一块视图。四个包都在 `themes/` 下，站点因此给它们单独挂了一份
`@docusaurus/plugin-content-docs` 实例，`routeBasePath` 是 `/themes` —— 所以这一页落在 `/themes/`，
`theme-viewer` 的示例页落在 `/themes/theme-viewer/docs/viewer-demo`。

## 与 `packages/` 那一族的差别

站点有**两棵内容根**，各自一份文档插件实例，规则一样、只是根不同：

|                  | 内容根      | 前缀            | 侧边栏                |
| ---------------- | ----------- | --------------- | --------------------- |
| 插件与基础设施   | `packages/` | `/`（无目录段） | `sidebars.mts`        |
| 带渲染器的主题包 | `themes/`   | `/themes`       | `sidebars-themes.mts` |

于是「页面上的地址等于文件相对内容根的路径」这句话要按**所属的那一棵**读：`packages/` 里的
`theme-erd/docs/erd-demo.dbml` 是 `/theme-erd/docs/erd-demo`，`themes/` 里的
`theme-viewer/docs/viewer-demo.md` 是 `/themes/theme-viewer/docs/viewer-demo`。
两份侧栏共用同一份扫描逻辑（仓库根的 `sidebars-lib.mts`），只是各扫自己那一棵根，
新增一个包不必回来改这里。

侧边栏徽标在两棵根都生效：`theme-git-badge` 收到的「站点有几份文档实例」就转述成几份地盘，
判据跟着各自的 include/exclude 逐棵根解释（见下那一包）。

<DocCardList />

卡片不写清单：不接 `items` 时官方取的就是这一页在侧边栏里的兄弟项，那份根级清单由
`sidebars-themes.mts` 扫 `themes/` 得到，卡片说明取自各包 `package.json` 的 `description`；
这一页自己也在侧边栏头一格，所以列表第一张是它本身。

示例页跟着包走，触发条件不变：头像与复制按钮判导航栏/页脚那一格，图片查看器判正文里有没有
图片，侧边栏徽标判 git；不命中的页面那一层等于透明。
