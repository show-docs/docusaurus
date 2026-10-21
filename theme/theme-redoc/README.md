# theme/theme-redoc

主题包：md 的 frontmatter 写 `redoc: <URL>` 时，该文档页整页换成**一个 iframe**，框里是本包
自己那条页面（`/redoc-view`），[Redoc](https://github.com/Redocly/redoc) 渲染的 OpenAPI 文档跑在
那一份文档里。

形状与 [`theme-stoplight`](../theme-stoplight/README.md)、[`theme-scalar`](../theme-scalar/README.md)
是一对一的，而且外层那一半三家共用一份：判键的 `DocItem`、那个 `<iframe>`、地址拼装与跨文档那
两格都住在 [`theme-iframe`](../theme-iframe/README.md)，本包只剩入口那一次工厂调用与**框内那一页**。

> 这一层内部怎么组成、三处与另两条层不同的地方各自怎么做到的、各处实测到的数字与取值，收在
> 维护者文档 [`docs/internals.md`](./docs/internals.md)。

## 怎么用

```md
---
title: 订单 API
redoc: /openapi.yaml
---
```

命中时整页换成那一个 iframe，**不包下层 `DocItem`**（判键与替换都发生在 theme-iframe 那一份
`DocItem` 里，与 stoplight / scalar / `iframe:` 同一落点），
所以那一页不会有文档正文外壳、也不会再有导图。要「其它页照常、这页是 API 文档」就是这个位置。

`redoc:` 那个值现在是**框里那份文档去取哪个地址**，它被编码进 iframe 的 `src`
（`/redoc-view?src=%2Fopenapi.yaml`）。

框内那一格的入参只有地址这一种：`redoc:` 的值是个地址，Redoc 那种「直接给一份内联文档」的入参
本层没有调用方，也就不提供。

## 渲染放在独立页面，文档页只嵌它

命中的文档页只留一个 `<iframe class="api-frame redoc-frame">`，Redoc 的运行时与样式都只在框里
那份文档（`/redoc-view?src=…`）里加载；外层看不到 `.redoc-root`，也没有 styled 表。两份文档各
放什么、为什么换一份文档，见 [`docs/internals.md`](./docs/internals.md) 的「两份文档各放什么」
与「为什么要换一份文档」两节。

## 深链：`#/orders/createorder` 那一段怎么跨过 iframe

能发给别人的是**外层**那条地址：`/redoc-demo#/orders/createorder`。hash 段不参与取文件，浏览器
请求的还是这一页自己的那份 html，产物里有它，所以 `pnpm serve` 回 **HTTP 200**。`#` 那一段
代表当前那条接口，它靠框里与框外两侧的消息送进框内；四个方向各走哪条路、为什么要两侧各推一次，
记在 [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md) 的「四个方向各走一条路」一节。

`/redoc-view?src=%2Fopenapi.yaml` 本身也是条能直接打开的地址（产物里有那份 html）。它不带外层
那段 hash，也不该有人拿它当分享链接 —— 这一条另有用例钉「带着 `src` 就能渲染」「缺了 `src` 就
什么都不摆」，别把它和上面那条混起来。

## 局限

- **每条接口在产物里没有自己的 html**。外层地址是真的，但内容仍然只有 `build/redoc-demo/index.html`
  一份，接口那一格是框里客户端渲染出来的 —— 爬虫、按状态码判活的监控看到的是页面本身，不是那条接口。
- **框里那一页对搜索引擎与抓取工具是不可见的**：iframe 的内容按惯例不算进宿主页面。要对外被检索到
  的 API 文档，得走能出静态 HTML 的路子。
- **两份文档、两套地址**。外层那条能分享；框内那条（`/redoc-view?src=…`）是本站的一条公开地址，
  直接打开也能渲染，但它不带 `#` 那一段的同步对象，也不该发给别人。地址栏里能看到的只有外层那一条。
- **滚动条在框里**：外层那一页不滚，框内那份文档自己滚。浏览器那种「整页一个滚动位置」在这里变成
  两格；键盘焦点也要先进框里才能用方向键滚。
- **`#` 归 Redoc 用**：站点常规那种「正文里某个小标题的锚点」在这一页上不成立（本页整页交给框，
  本来也没有那种锚）。
- **`/redoc-view` 会进站点地图**：`addRoute` 注册的路由在 Docusaurus 眼里就是一条页面，实测
  `build/sitemap.xml` 里有它。那一页没有标题、没有描述、`src` 缺着时整屏空白，被索引到也没有
  内容可展示。本站的 `url` 还是 `https://example.com`（占位），所以这里先只记现象；真要收掉，
  是在配置的 `sitemap` 那一格里按路径过滤，而不是让这一层少注册一条路由。
- 按路径的那一版地址（`/redoc-demo/orders/createorder`）现在退回站点自己的 404 页 —— 实测
  `pnpm serve` 对它回 404 加官方「找不到页面」。那种形状从没进过提交，也没有发出去的链接要照顾，
  所以这里不做「路径 → hash」的翻译。
- **亮暗模式只有一个来源**：配色跟站点的开关走，不跟操作系统偏好走。框里那份文档自己不判断模式；
  直接打开 `/redoc-view?src=…`（没有外层给它送）时一直是亮色。本站默认是亮色，所以「送达之前先亮
  一下」在站点这一侧看不出来；把 `themeConfig.colorMode` 的默认值改成暗色，这一页就会露那一格亮。
- 站点根目录得真的有 `static/openapi.yaml` 那种本站可读的 spec；外网 spec 要另配 CORS。
