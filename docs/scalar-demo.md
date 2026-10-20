---
id: scalar-demo
sidebar_position: 6
title: Scalar 示例
description: 'frontmatter 写 scalar: <URL>，整页换成一个 iframe，框里用 Scalar 渲染 API 文档。'
# 命中 theme-scalar 那一层：整页换成一个 iframe，Scalar 跑在本包自己那条 /scalar-view 页面上。
# /openapi.yaml 由仓库根的 static/ 在构建时复制到站点根，不依赖外网。
scalar: /openapi.yaml
---

# Scalar 示例

下面这些正文在渲染后的页面上**看不到**：theme-iframe 那一份 `DocItem` 按注册表命中 `scalar` 时
把整个 `DocItem` 换成 iframe，
整页换成一个 iframe，所以也没有文档外壳、不会再有导图。这一段是给读仓库源文件的人看的。

- 取的是 `static/openapi.yaml`（构建产物里的 `/openapi.yaml`）：与 stoplight、redoc 那两页同一份
  输入，为的是三个渲染器能横向比对。
- **形状与 `theme-redoc` 一对一**：这一页放的是一个 `<iframe class="api-frame scalar-frame"
src="/scalar-view?src=%2Fopenapi.yaml">`，`/scalar-view` 是本包自己注册的一条插件路由，构建产物里
  真的有一份 `build/scalar-view/index.html`；跨 iframe 那两格（地址栏里 `#` 那一段、站点的亮暗模式）
  走 `theme/theme-iframe/lib/` 那份共享约定，与上面两条层同一份实现。
- **差在框内那一页里**：`@scalar/api-reference` 是 Vue 3 的组件，本层用它的非 Vue 宿主入口
  `createApiReference(元素, 配置)` 把它挂进一格 `<div>`，因此不必直接引 `vue`，也不必装 React 包装层。
- **换文档挡不住它的样式表，那一条防线是厂商自带的**：Scalar 的样式是发布好的静态
  `@scalar/api-reference/style.css`，webpack 把它并进全站那一份 css，每一页都下载 —— 这一格与
  theme-redoc 相反（那张表是运行期注入的，只存在于框内那份文档），也与 theme-stoplight 同处境但
  结论不同。这里不动构建期改写，因为 Scalar 每条规则出厂就带 `.scalar-app` 前缀，实测对上站点没有
  改写。代价（每页 +359 KB）与实测口径记在 `theme/theme-scalar/README.md` 的「样式」一节。
- **点进接口后的地址也能分享**：能发给别人的是**这一页自己的**地址
  —— `/scalar-demo#tag/orders/POST/orders`。注意 `#` 后面**没有前导斜杠**，那是 Scalar 自己的
  路由写法；与 redoc 的 `#/orders/createorder`、stoplight 的 `#/operations/createOrder` 都不一样，
  多写一个斜段是**静默失灵**（停在概览、控制台不报错）。hash 段不参与取文件，`pnpm serve` 回
  **HTTP 200**；每条接口在产物里**没有自己的 html**。
- **亮暗模式跟站点那个开关走，不跟操作系统走**：Scalar 的判据是 `<body>` 上互斥的两个类名
  （`dark-mode` / `light-mode`），不是属性，所以本层交给共享层的是 `onMode` 回调而不是属性名；
  外层读站点的当前模式送进框内。它自己那颗亮暗开关用配置 `hideDarkModeToggle` 收掉，不必像
  redoc 那样写 CSS。
- **站点的文档侧栏在这一页照常摆着**（与 redoc、stoplight 那两层一样，本层不动站点那侧的版式）。
  要留意的是 Scalar 那套 API 左栏有一个**框宽**门槛：实测 1024 CSS px，够就展开、不够就收成一颗
  「打开菜单」抽屉。侧栏占 300px，所以窗口要 ≥1324 宽这一屏才是两种导航都在的样子；1280 宽时
  框只有 980，只剩站点那一列。取舍与量法记在 `theme/theme-scalar/README.md` 的「宽度」一节；
  要连 navbar 与侧栏一起不要，用 `iframe:` 那一层。
- 组件只在浏览器端渲染（SSR 阶段返回 `null`），要看结果得 `pnpm build && pnpm serve`。

同一页同时写 `scalar:` 与 `redoc:` 时，本层在最外，redoc 那层不出现。
