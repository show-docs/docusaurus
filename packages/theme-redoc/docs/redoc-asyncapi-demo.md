---
id: redoc-asyncapi-demo
sidebar_position: 6
title: Redoc AsyncAPI 示例
description: 'frontmatter 写 redoc: true（AsyncAPI 地址由 aas3: 给），整页换成一个 iframe，框里用 Redoc 渲染那份 AsyncAPI 3 文档。'
# 命中 theme-redoc 那一层：整页换成一个 iframe，Redoc 跑在 theme-component-page 那条通用框内路由 /__component-frame 上。
# /asyncapi-redoc.yaml 由仓库根的 static/ 在构建时复制到站点根，不依赖外网。
redoc: true
aas3: /asyncapi-redoc.yaml
---

# Redoc AsyncAPI 示例

下面这些正文在渲染后的页面上**看不到**：theme-redoc 在自己的 `loadContent()` 里把组件（`@theme/RedocView`）与那一条规则（键 `redoc`、`render: 'iframe'`）交给 theme-component-page，
命中时这一页的整个 `DocItem` 换成它那个通用框，所以也没有文档外壳、不会再有导图。
这一段是给读仓库源文件的人看的。

- 取的是 `static/asyncapi-redoc.yaml`（构建产物里的 `/asyncapi-redoc.yaml`）：frontmatter 的
  `aas3:` 给的就是这个地址，只给这一页用。
- **AsyncAPI 走 `aas3:`、OpenAPI 走 `oas3:`**：两把都是 spec 键，给的都是一个地址，本层不判断
  它指向哪一份文档 —— 类型判据在渲染器那边，`redoc@3.0.1` 按文档里那个 `asyncapi` 字段分派，
  2.x 与 3.x 都认（厂商口径见 `packages/theme-redoc/docs/internals.md` 的「AsyncAPI 3」一节）。
  这一页给的就是一份 **AsyncAPI 3.0.0** 文档（根上有 `asyncapi: 3.0.0`）。两把键同时写时
  `oas3:` 优先（开发模式有一条告警），所以这一页只写 `aas3:`。
- **框里那份文档的形状换了**：AsyncAPI 那一套是「通道（channel）/ 操作（operation）/ 消息
  （message）」，不是 OpenAPI 的「路径 / 操作 / 响应」。所以这一页的左栏里是一条通道
  `orders/created`，正文里摆的是那条消息的 payload（`id` / `item` / `quantity` 三个字段）。
- **地址段也换了**：能发给别人的是
  `/theme-redoc/docs/redoc-asyncapi-demo#/channels/ordercreated`（通道）或
  `#/channels/ordercreated/operations/receiveordercreated`（操作）。Redoc 把 `operationId` 那一类
  名字小写进地址，AsyncAPI 那一侧对应的是通道与操作的 id。
- **收掉的那几处照旧生效**：正文最前面那一格下载（`hideDownloadButtons`）、左栏底部那条
  Redocly 署名、Redoc 自己那颗亮暗开关、章节标题旁那一整格操作按钮 —— 它们对 AsyncAPI 那一套
  版式同样成立，所以本层那几条 CSS 与配置不用为 AsyncAPI 分叉。
- 亮暗模式跟站点那个开关走，不跟操作系统走：口径与 OpenAPI 那一页完全一样（同一份
  `<html data-redoc-mode>`，见 `packages/theme-redoc/docs/internals.md` 的「亮暗模式」一节）。
