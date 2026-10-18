---
id: redoc-demo
sidebar_position: 5
title: Redoc 示例
description: 'frontmatter 写 redoc: <URL>，整页交给 Redoc 渲染的 API 文档。'
# 命中 theme-redoc 那一层：整页换成 Redoc 渲染的 OpenAPI 文档。
# /openapi.yaml 由仓库根的 static/ 在构建时复制到站点根，不依赖外网。
redoc: /openapi.yaml
---

# Redoc 示例

下面这些正文在渲染后的页面上**看不到**：`theme-redoc` 命中 `redoc` 时不包下层 `DocItem`，
整页交给 Redoc，所以也没有文档外壳、不会再有导图。这一段是给读仓库源文件的人看的。

- 取的是 `static/openapi.yaml`（构建产物里的 `/openapi.yaml`）：与 stoplight 那页同一份输入，
  为的是两个渲染器能横向比对，也保证离线就能看完整渲染。
- **样式不做构建期圈定**：Redoc 的 CSS 由 styled-components 在运行时插进 `<head>`，
  构建期产物里没有这份文件可供前缀改写。实测漏到站点元素上的就三条 ——
  `:root`（整页底色与字体）、`:root *`（全局 `box-sizing`）、`button`（navbar 上那个
  亮/暗切换按钮会被 Redoc 的按钮样式接管）。三条都由端到端用例钉住，Redoc 多写一条就红。
  原因与备选路子记在 `theme/theme-redoc/README.md`（站点文档源只收 `docs/`，链接出去只会是死链）。
- **点进接口后的地址不能分享**：Redoc 3 的路由是按路径的（不是 hash），地址会变成
  `/redoc-demo/orders/createorder`，而静态产物里没有这一格，`pnpm serve` 直接回 404。
  在同一页里点来点去是正常的。
- 组件只在浏览器端渲染（SSR 阶段返回 `null`），所以 `build/redoc-demo/index.html` 里这一格是空的，
  要看结果得 `pnpm build && pnpm serve`。

同一页同时写 `redoc:` 与 `oas3:` 时，本层在最外，stoplight 那层不出现。
