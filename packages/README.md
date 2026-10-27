---
slug: /
title: 项目说明
description: 主页：验证的问题、常用命令，以及各主题示例页的入口。
---

import DocCardList from '@theme/DocCardList';

# 项目说明

本项目用于验证 Docusaurus 主题覆盖机制，让「多个主题层层包裹同一组件」变为可行：

1. 多个主题覆盖同一个组件会发生什么？
2. `@theme-original` 是否可以实现链式包裹？
3. 如何让链式覆盖**真正成立**，同时不改动官方别名语义？

## 每个包一顶层格

这一页自己就是 `packages/README.md` —— 站点的内容根是 `packages/`，Docusaurus 认内容根里的
`README.md` 是索引页，而 `slug: /` 把它落在根，所以它同时是主页，内容根那一格没有单独的地址。
站点按包组织：`packages/` 下每个包占侧边栏的一顶层格，那一格的顶层页就是这个包
自己的 `README.md`（同理，所以地址是 `/theme-scalar/`），它的子页是这个包
`docs/` 目录里的那几页 —— 示例页与维护者文档。
因此**页面上的地址等于文件相对 `packages/` 的路径**：`/theme-erd/docs/erd-demo`
就是 `packages/theme-erd/docs/erd-demo.dbml`。

<DocCardList />

卡片列表不写清单：官方 `@theme/DocCardList` 不接 `items` 时，取的就是这一页在侧边栏里的兄弟项，
而侧边栏由仓库根的 `sidebars.mts` 扫 `packages/` 那一个目录得到 ——
新增一个包，主页自动多一张卡片，不用在这里抄第二份。卡片上那行说明取自各包 `package.json` 的
`description`；这一页自己也在侧边栏的头一格，所以列表的第一张是它本身。

示例页跟着包走，触发条件不变：多数由 frontmatter 里的键触发，`.dbml` 由扩展名触发，图片查看器
那一层判的是正文里有没有图片；不命中的页面那一层等于透明。

这一整张卡片列表外面套着四层主题的标记（`[SITE]` 包 `[C]`、`[C]` 包 `[B]`、`[B]` 包 `[A]`，
最里面才是卡片）：本页是站点唯一渲染 `<DocCardList />` 的地方，所以「多个主题链式覆盖同一个组件」
就发生在你正看着的这一格里。四层各用一道彩色虚线圈出自己那一格，从外到内是橙 `[SITE]`、
蓝 `[C]`、绿 `[B]`、红 `[A]`，每层的角标与本层边框同色。

链式覆盖不需要单独的示例页：判据就是这一条四层链，`pnpm build && pnpm verify:chain`
从构建产物里回读它（并回读文档页 —— 那一页一个包裹标记都不该有），
浏览器里的嵌套由 `pnpm test:e2e` 的主页用例钉住。

## 文档

- 链式覆盖方案（[docusaurus-plugin-prev-layer-resolver](./plugin-prev-layer-resolver/README.md)）—— 落地实现：`@theme-prev/X` 系列 specifier；实现细节在它的[维护者文档](./plugin-prev-layer-resolver/docs/internals.md)。
- 各主题包的行为与约束就在上面那一排卡片里。`tools/theme-{a,b,c}` 那三层假主题不占一格：它们只用来钉这条层栈，没有面向使用者的文档，说明在仓库里的 `tools/README.md`。`stoplight`、`redoc` 与 `scalar` 那三条共用的跨 iframe 约定（iframe 地址与两份文档之间那三条消息）住在 [theme-iframe](./theme-iframe/README.md) 的 `lib/`，口径在它的[跨 iframe 协议](./theme-iframe/docs/iframe-protocol.md)；「整页交给一个框」的外层套壳（判键的 `DocItem` 与那个通用 `<iframe>`）也从那一个包走，三条 API 层自己不再有 `DocItem`。

## 命令

```bash
pnpm install
pnpm start          # 本地预览
pnpm build          # 构建
pnpm test           # 单元测试：解析语义、链式不变量、真实 resolver 端到端
pnpm test:e2e       # 构建产物起服务，在真浏览器里逐个点开上面这几张卡片对应的页面（只本地跑）
pnpm verify:chain   # 读真实 build 产物，回读那条四层渲染链（src/theme > theme-c > theme-b > theme-a）
```
