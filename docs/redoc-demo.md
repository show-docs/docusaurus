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
- **样式在运行期圈进 `.redoc-root`**：Redoc 的 CSS 由 styled-components 在运行时插进
  `<head>`，构建期产物里没有这份文件可供前缀改写，所以圈定发生在它编译每条规则的那一步
  （`StyleSheetManager` 的 `stylisPlugins`）。收进来的是两类：裸标签 `button`（原本会打到
  navbar 那个亮/暗切换按钮上）与 `:root` 里那三条真属性（整页底色与字体）。实测剩下的外溢
  只有一条 `:root *`（全局 `box-sizing`，与站点自己的 `*` 同值，故意不动）。端到端用例把
  这个集合钉成等于它，Redoc 多写一条、或者圈定失效，就红；同一批元素在 redoc 页与主页各算
  一遍 computed style 比相等，站点这一侧不受影响。原因、`:where()` 那个优先级坑与备选路子
  记在 `theme/theme-redoc/README.md`（站点文档源只收 `docs/`，链接出去只会是死链）。
- **点进接口后的地址也能分享**：Redoc 有自己的路由，本层把它钉成 **hash** 那一种，于是地址是
  `/redoc-demo#/orders/createorder`。hash 段不参与取文件，浏览器请求的还是这一页自己的那份 html，
  所以 `pnpm serve` 对它回 **HTTP 200**，页面加载完 Redoc 自己读那段地址、把那条接口摆进正文区。
  要说清楚两点：每条接口在产物里**没有自己的 html**（内容仍只有 `build/redoc-demo/index.html`，
  那一格是客户端渲染的）；按路径的那一形状（`/redoc-demo/orders/createorder`）现在退回站点
  自己的 404 页。做法与取舍记在 `theme/theme-redoc/README.md`。
- 组件只在浏览器端渲染（SSR 阶段返回 `null`），所以 `build/redoc-demo/index.html` 里这一格是空的，
  要看结果得 `pnpm build && pnpm serve`。

同一页同时写 `redoc:` 与 `oas3:` 时，本层在最外，stoplight 那层不出现。
