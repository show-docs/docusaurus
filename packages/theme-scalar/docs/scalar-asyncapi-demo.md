---
id: scalar-asyncapi-demo
sidebar_position: 7
title: Scalar AsyncAPI 示例
description: 'frontmatter 写 scalar: true（AsyncAPI 地址由 aas3: 给），整页换成一个 iframe，框里用 Scalar 渲染那份 AsyncAPI 3 文档。'
# 命中 theme-scalar 那一层：整页换成一个 iframe，Scalar 跑在本包自己那条 /scalar-view 页面上。
# /asyncapi-scalar.yaml 由仓库根的 static/ 在构建时复制到站点根，不依赖外网。
scalar: true
aas3: /asyncapi-scalar.yaml
---

# Scalar AsyncAPI 示例

下面这些正文在渲染后的页面上**看不到**：theme-iframe 在配置期交给 theme-component-page 的那份清单
命中 `scalar` 时，这一页的整个 `DocItem` 换成 theme-iframe 的 `theme/ApiFramePage`，整页换成一个
iframe，所以也没有文档外壳、不会再有导图。
这一段是给读仓库源文件的人看的。

- 取的是 `static/asyncapi-scalar.yaml`（构建产物里的 `/asyncapi-scalar.yaml`）：frontmatter 的
  `aas3:` 给的就是这个地址，只给这一页用。
- **AsyncAPI 走 `aas3:`、OpenAPI 走 `oas3:`**：两把都是 spec 键，给的都是一个地址，本层不判断
  它指向哪一份文档 —— 类型判据在渲染器那边，`@scalar/api-reference@1.76.0` 按文档里那个
  `asyncapi` 字段分派（厂商那份 `isAsyncApiDocument()` 就是按这个字段认的，见包
  `docs/internals.md` 的「AsyncAPI 3」一节）。这一页给的就是一份 **AsyncAPI 3.0.0** 文档
  （根上有 `asyncapi: 3.0.0`）。两把键同时写时 `oas3:` 优先（开发模式有一条告警），所以这一页
  只写 `aas3:`。
- **框里那份文档的形状换了**：AsyncAPI 那一套是「通道（channel）/ 操作（operation）/ 消息
  （message）」，不是 OpenAPI 的「路径 / 操作 / 响应」。所以这一页的左栏里是一条通道
  `orders/created` 与它下面那条接收操作，正文里摆的是那条消息的 payload（`id` / `item` /
  `quantity` 三个字段）。
- **地址段也换了**：能发给别人的是
  `/theme-scalar/docs/scalar-asyncapi-demo#channel/ordercreated`（通道）或
  `#channel/ordercreated/operation/receiveordercreated`（操作）。Scalar 那一套路由的 id 是
  「通道 / 操作」两段，与 OpenAPI 那一套的「标签 / 方法 / 路径」三段不同形状。
- **收掉的那几处照旧生效**：正文顶上那一格下载（`documentDownloadType: 'none'` —— Scalar 对
  AsyncAPI 文档摆的是「下载 AsyncAPI 文档」，这一格同样不生成）、它自己那颗亮暗开关、
  「Ask AI」、「试调用」、开发者工具栏、左栏底部那条署名 —— 它们对 AsyncAPI 那一套版式同样成立，
  所以本层那几行配置不用为 AsyncAPI 分叉。
- 亮暗模式跟站点那个开关走，不跟操作系统走：口径与 OpenAPI 那一页完全一样（同一份
  `<body>` 上那两个类名，见 `packages/theme-scalar/docs/internals.md` 的「亮暗模式」一节）。
