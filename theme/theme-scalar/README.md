# theme/theme-scalar

主题包：md 的 frontmatter 写 `scalar: <URL>` 时，该文档页整页换成**一个 iframe**，框里是本包
自己那条页面（`/scalar-view`），[Scalar](https://github.com/scalar/scalar) 的
`@scalar/api-reference`（Vue 3 组件）渲染的 OpenAPI 文档跑在那一份文档里。

形状与 [`theme-redoc`](../theme-redoc/README.md)、[`theme-stoplight`](../theme-stoplight/README.md)
是一对一的，而且外层那一半三家共用一份：判键的 `DocItem`、那个 `<iframe>`、地址拼装与跨文档那
两格都住在 [`theme-iframe`](../theme-iframe/README.md)，本包只剩入口那一次工厂调用与**框内那一页**。

> 这一层内部怎么组成、渲染器怎么挂、样式表为什么不用请出全站那一份、亮暗为什么落在 `<body>`
> 的两个类名上，收在维护者文档 [`docs/internals.md`](./docs/internals.md)。

## 怎么用

```md
---
title: 订单 API
scalar: /openapi.yaml
---
```

命中时整页换成那一个 iframe，**不包下层 `DocItem`**（判键与替换都发生在 theme-iframe 那一份
`DocItem` 里，与 redoc / stoplight / `iframe:` 同一落点），
所以那一页不会有文档正文外壳、也不会再有导图。

`scalar:` 那个值是**框里那份文档去取哪个地址**，它被编码进 iframe 的 `src`
（`/scalar-view?src=%2Fopenapi.yaml`）。

框内那一格的入参只有地址这一种，且界面文案走 Scalar 自带的简体（`localization.locale`）；
要换语言或调那几处「收掉 / 多摆」的取舍，改 `components/scalar-ui.tsx` 里那份配置。

## 渲染放在独立页面，文档页只嵌它

命中的文档页只留一个 `<iframe class="api-frame scalar-frame">`，Scalar 的运行时只在框里那份文档
（`/scalar-view?src=…`）里加载；外层看不到 `.scalar-app`。两份文档各放什么、为什么换一份文档，
见 [`docs/internals.md`](./docs/internals.md) 的「两份文档各管什么」与「为什么要换一份文档」两节。

## 路由与深链：`#tag/orders/POST/orders` 那一段

三条层的 hash 长得不一样，各按各的写法记在这里，别抄：

- Scalar：`#tag/orders/POST/orders` —— 按**标签 + 方法 + 路径**拼，`#` 后面**没有**前导斜杠；
- Redoc：`#/orders/createorder` —— 有前导斜杠，`operationId` 被小写；
- Elements：`#/operations/createOrder` —— 有前导斜杠，`operationId` 原样。

能发给别人的是**外层**那条地址（`/scalar-demo#tag/orders/POST/orders`）。hash 段不参与取文件，
整页加载它回 200；iframe 的 `src` 里**不**塞那一段，它靠框里那句 `ready` 换进框内。为什么不是
外层在 iframe 的 `load` 事件上推、两侧各推一次的来由，记在
[`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)。

`/scalar-view?src=%2Fopenapi.yaml` 本身也是条能直接打开的地址（产物里有那份 html）。它不带外层
那段 hash，也不该有人拿它当分享链接。

## 局限

- **每条接口在产物里没有自己的 html**。外层地址是真的，但内容仍然只有 `build/scalar-demo/index.html`
  一份，接口那一格是框里客户端渲染出来的。
- **框里那一页对搜索引擎与抓取工具不可见**：iframe 的内容按惯例不算进宿主页面。
- **多出来的那 359 KB 样式表每一页都下载**（净增字节数与「为什么不拦」的实测在
  [`docs/internals.md`](./docs/internals.md) 的「样式」一节）。
- **站点那一列窗口窄的时候会挤**：命中页与 redoc、stoplight 一样保留站点的文档侧栏（300px），
  而 Scalar 的左栏要**框**宽 ≥1024 才展开 —— 视口 1280 时框只有 980，整套 API 导航收成一颗
  「打开菜单」抽屉。量法与那一档断点见 [`docs/internals.md`](./docs/internals.md) 的「宽度」一节。
- **正文区是按需挂载的**：视口之下还没滚到的那几节不在 DOM 里，e2e 那句整页直达的判据因此只钉到
  地址里那条接口为止。量法见 [`docs/internals.md`](./docs/internals.md) 的「正文按需挂载」一节。
- **`#` 归 Scalar 用**：站点常规那种「正文里某个小标题的锚点」在这一页上不成立。
- **`/scalar-view` 会进站点地图**：`addRoute` 注册的路由在 Docusaurus 眼里就是一条页面，实测
  `build/sitemap.xml` 里有它。缺 `src` 时那一页整屏空白，被索引到也没有内容可展示。
- **亮暗模式只有一个来源**：框内那份文档自己不再判断。直接打开 `/scalar-view?src=…`（没有外层
  送值）时那一格停在加载时内联脚本写下的那份，之后不跟站点开关。
- 站点根目录得真的有 `static/openapi.yaml` 那种本站可读的 spec；外网 spec 要另配 CORS。
