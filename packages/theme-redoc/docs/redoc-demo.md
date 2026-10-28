---
id: redoc-demo
sidebar_position: 5
title: Redoc 示例
description: 'frontmatter 写 redoc: true（spec 地址由 oas3: 给），整页换成一个 iframe，框里用 Redoc 渲染 API 文档。'
# 命中 theme-redoc 那一层：整页换成一个 iframe，Redoc 跑在本包自己那条 /redoc-view 页面上。
# /openapi-redoc.yaml 由仓库根的 static/ 在构建时复制到站点根，不依赖外网。
redoc: true
oas3: /openapi-redoc.yaml
---

# Redoc 示例

下面这些正文在渲染后的页面上**看不到**：theme-iframe 那一份 `DocItem` 按注册表命中 `redoc` 时
把整个 `DocItem` 换成 iframe，
整页换成一个 iframe，所以也没有文档外壳、不会再有导图。这一段是给读仓库源文件的人看的。

- 取的是 `static/openapi-redoc.yaml`（构建产物里的 `/openapi-redoc.yaml`）：frontmatter 的
  `oas3:` 给的就是这个地址，只给这一页用，
  Stoplight 与 Scalar 的示例页各取自己那份，三页不再共用同一份输入。
- **Redoc 不在这一页里渲染，而在另一份文档里**：这一页放的是一个
  `<iframe class="api-frame redoc-frame" src="/redoc-view/?src=%2Fopenapi-redoc.yaml">`，`/redoc-view` 是本包
  自己注册的一条插件路由，构建产物里真的有一份 `build/redoc-view/index.html`。换过去的原因：
  Redoc 的样式由 styled-components 在运行时插进 `<head>`，构建期那份静态样式表不存在、前缀改写
  圈不住它，而它还会往 `<html>` 上写两千多条 CSS 变量、自己用 localStorage 和自己的路由 —— 这些
  都是「打到宿主页面」的东西。iframe 的边界由浏览器给，框里那一层站点的文档页一行都碰不到。
  **正因为边界已经由浏览器给，本层原先那套运行期圈定（把裸标签与 `:root` 里的真属性收进
  `.redoc-root`）已经删掉了**：框内那份文档整份就是给 Redoc 的（没有 navbar、没有正文容器），
  它的样式打到的都是它自己那一屏。实测外层那份文档里 styled 表 0 张、`.redoc-root` 0 个；框内
  那份文档里那张表 427 条规则原样生效。运行期那条中间件链上只剩一件事 —— 把它的暗色表改挂到
  框内那份文档自己的 `<html data-redoc-mode>` 上（下一条）。口径与依据记在
  `packages/theme-redoc/docs/internals.md` 的「样式」一节（站点文档源只收 `docs/`，链接出去只会是死链）。
- **点进接口后的地址也能分享**：这一层的渲染虽然挪进了框里，能发给别人的地址**还是这一页自己的**
  —— `/theme-redoc/docs/redoc-demo#/orders/createorder`。地址栏里 `#` 那一段由框里那份文档报给外层（Redoc 的路由
  走 `history.pushState`，`hashchange` 收不到），整页加载一条深链时反过来由框里向外层要一次再写进
  自己的地址；写外层地址用的是替换，所以框里换一条接口不会在浏览器历史里多出一格。
  hash 段不参与取文件，浏览器请求的还是这一页那份 html，`pnpm serve` 回 **HTTP 200**。
  要说清两点：每条接口在产物里**没有自己的 html**；`/redoc-view/?src=…` 虽然也能直接打开，
  但那是「框里那一页本身」，不是拿来分享的地址。做法与取舍记在 `packages/theme-redoc/README.md`。
- **亮暗模式跟站点那个开关走，不跟操作系统走**：Redoc 自带一套按操作系统偏好判定的暗色，本层把
  它的暗色表改挂在 `<html data-redoc-mode="dark">` 上；那个开关写在**外层**文档上、配色在**框内**
  那份文档里，所以外层读站点的当前模式，随那条已经在用的 postMessage 通道送进框内，框内写到
  自己 `<html>` 上。框内那份文档因此不套站点的任何外壳与 provider，也不读那份 localStorage。
- **滚动条长在框里**：外层那一页不滚（框占满 navbar 以下那一屏），框内那一份文档自己滚，
  所以这一页没有「正文跟着页面滚」那种观感；键盘要先落到框里才能用方向键。
- 组件只在浏览器端渲染（SSR 阶段返回 `null`），所以 `build/theme-redoc/docs/redoc-demo/index.html` 里除了那个 iframe
  标签之外是空的，框内那份 html 也一样；要看结果得 `pnpm build && pnpm serve`。
- 命中的是文档页，站点的侧栏仍然在那一列里（框只占正文那一格）。要连侧栏一起让位，用 `iframe:` 那一层。

同一页同时写 `redoc:` 与 `stoplight:` 时，本层在最外，stoplight 那层不出现。
