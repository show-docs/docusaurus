---
id: stoplight-demo
sidebar_position: 4
title: API 文档示例
description: 'frontmatter 写 oas3: <URL>，整页交给 OpenAPI 渲染器。'
# 命中 theme-stoplight 那一层：整页换成 Stoplight Elements 渲染的 OpenAPI 文档。
# /openapi.yaml 由仓库根的 static/ 在构建时复制到站点根，不依赖外网。
oas3: /openapi.yaml
---

# API 文档示例

下面这些正文在渲染后的页面上**看不到**：`theme-stoplight` 命中 `oas3` 时不包下层 `DocItem`，
整页交给 Stoplight Elements，所以也没有文档外壳、不会再有导图。这一段是给读仓库源文件的人看的。

- 取的是 `static/openapi.yaml`（构建产物里的 `/openapi.yaml`）：一份只有三个接口的假订单 API，
  为的是离线也能看到完整渲染，不用依赖第三方站点。
- `@stoplight/elements` 的样式表是全局选择器，被 `configurePostCss()` 那一步圈进
  `.stoplight-root`；站点自己的 chrome（`.navbar` / `.footer`）不在圈里。
- 组件只在浏览器端渲染（SSR 阶段返回 `null`），所以 `build/stoplight-demo/index.html` 里这一格是空的，
  要看结果得 `pnpm build && pnpm serve`。

同一页同时写 `oas3:` 与 `iframe:` 时，本层在最外，iframe 那层不出现。层的顺序与圈样式的细节
记在 `theme/theme-stoplight/README.md`（站点文档源只收 `docs/`，链接出去只会是死链）。
