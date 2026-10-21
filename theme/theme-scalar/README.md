# theme/theme-scalar

主题包：md 的 frontmatter 写 `scalar: <URL>` 时，该文档页整页换成**一个 iframe**，框里是本包
自己那条页面（`/scalar-view`），[Scalar](https://github.com/scalar/scalar) 的
`@scalar/api-reference`（Vue 3 组件）渲染的 OpenAPI 文档跑在那一份文档里。

形状与 [`theme-redoc`](../theme-redoc/README.md)、[`theme-stoplight`](../theme-stoplight/README.md)
是一对一的，而且**外层那一半三家共用一份**：判 `scalar:` 的 `DocItem`、那个 `<iframe>`、地址拼装
与跨文档那两格的循环都住在 [`theme-iframe`](../theme-iframe/README.md)（键与形状登记在它的
[`lib/api-frame-registry.ts`](../theme-iframe/lib/api-frame-registry.ts)，口径见
[`docs/iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)），本包只剩入口那一次工厂调用与
**框内那一页**。差的不是形状，是**渲染器怎么挂**和
**样式怎么落地**这两格：

- Scalar 是 Vue 组件，本层用那份面向非 Vue 宿主的 `createApiReference(元素, 配置)` 把它挂进一格
  `<div>`，因此不直接引 `vue`、也不装 React 包装层；
- 它的样式表是**发布好的静态文件**（`@scalar/api-reference/style.css`，335 KB 的 Tailwind 4 编译
  产物），不是 Redoc 那种运行期注入的表 —— 静态文件会被并进全站那一份 css，**iframe 拦不住它**。
  这一格与 `theme-stoplight` 同类，但结论相反：那条层要在构建期把它的静态样式表**请出**全站那一份
  （当资源发出去，由框内那份文档自己挂 `<link>`），这一层不用动手，
  因为 Scalar 出厂时每条规则已经带着 `.scalar-app` 那层前缀了；
- 它的亮暗判据是 `<body>` 上**两个互斥的类名**，不是属性（redoc 与 stoplight 那两层都是属性），
  所以共享层那条 `mode` 消息在这一层交的是 `onMode` 回调而不是属性名。

> 这一层内部怎么组成、上面那两格各自怎么做到的、收掉了哪几处以及各处实测到的数字，收在维护者文档
> [`docs/internals.md`](./docs/internals.md)。

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

|                 | 外层：站点的文档页（`/scalar-demo`）                                                         | 框内：本包那条页面（`/scalar-view?src=…`）                                   |
| --------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 本层放的东西    | 一个 `<iframe class="api-frame scalar-frame">`（由 theme-iframe 的 `ApiFrame` 按注册表渲染） | `ScalarUI` 挂的那一格，根是 Scalar 自己的 `.scalar-app.scalar-api-reference` |
| Scalar 的运行时 | 不加载，一行都没有（`.scalar-app` 0 个）                                                     | 全在这里（实测那一份文档里 `.scalar-app` 3 格，布局根只有 1 格）             |
| 样式表          | 全站那一份 css（**含 Scalar 那 335 KB**）                                                    | 同一份 css，外加 Docusaurus 给这一页的几格内联表                             |
| 亮暗模式        | 站点的 `<html data-theme>`，开关在这                                                         | 自己 `<body>` 上的 `dark-mode` / `light-mode`，值由外层送来                  |
| 能分享的地址    | 有，`#` 那一段代表当前那条接口                                                               | 有，但那是「直接打开框里那一页」，见「路由与深链」                           |

## 路由与深链：`#tag/orders/POST/orders` 那一段

三条层的 hash 长得不一样，各按各的写法记在这里，别抄：

- Scalar：`#tag/orders/POST/orders` —— 按**标签 + 方法 + 路径**拼，`#` 后面**没有**前导斜杠；
- Redoc：`#/orders/createorder` —— 有前导斜杠，`operationId` 被小写；
- Elements：`#/operations/createOrder` —— 有前导斜杠，`operationId` 原样。

这一串不是洁癖：**多写一个斜段是静默失灵**。实测外层地址写成 `#/tag/orders/POST/orders` 时，
那一段确实送进了框内、框内地址也确实成了那一串，但 Scalar 认不出这个 id，页面停在文档概览上
（标题只剩 2 颗、`scrollY` 一直是 0），控制台一个字都不报。

能发给别人的是**外层**那条地址（`/scalar-demo#tag/orders/POST/orders`）。hash 段不参与取文件，
整页加载它回 200；iframe 的 `src` 里**不**塞那一段（服务端与客户端要算出同一个字符串），
它靠框里那句 `ready` 换进框内。为什么不是外层在 iframe 的 `load` 事件上推、两侧各推一次的来由，
记在 [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)。

## 局限

- **每条接口在产物里没有自己的 html**。外层地址是真的，但内容仍然只有 `build/scalar-demo/index.html`
  一份，接口那一格是框里客户端渲染出来的。
- **框里那一页对搜索引擎与抓取工具不可见**：iframe 的内容按惯例不算进宿主页面。
- **多出来的那 359 KB 样式表每一页都下载**（净增字节数与「为什么不拦」的实测在 [`docs/internals.md`](./docs/internals.md) 的「样式」一节）。
- **站点那一列窗口窄的时候会挤**：命中页与 redoc、stoplight 一样保留站点的文档侧栏（300px），
  而 Scalar 的左栏要**框**宽 ≥1024 才展开 —— 视口 1280 时框只有 980，整套 API 导航收成一颗
  「打开菜单」抽屉。量法与那一档断点见 [`docs/internals.md`](./docs/internals.md) 的「宽度」一节。
- **正文区是按需挂载的**：视口之下还没滚到的那几节不在 DOM 里（默认那一页，认布局根里可见的
  `h1`–`h4` 数，实测同一时刻 1440×720 是 2 颗、1440×900 才是 5 颗；整页直达深链那一份，可见的
  标题四颗，加高到 900 也不多那一节）。e2e 那句整页直达的判据因此只钉到地址里那条接口为止。
- **`#` 归 Scalar 用**：站点常规那种「正文里某个小标题的锚点」在这一页上不成立。
- **`/scalar-view` 会进站点地图**：`addRoute` 注册的路由在 Docusaurus 眼里就是一条页面，实测
  `build/sitemap.xml` 里有它。缺 `src` 时那一页整屏空白，被索引到也没有内容可展示。
- **亮暗模式只有一个来源**：框内那份文档自己不再判断。直接打开 `/scalar-view?src=…`（没有外层
  送值）时那一格停在加载时内联脚本写下的那份，之后不跟站点开关。
- 站点根目录得真的有 `static/openapi.yaml` 那种本站可读的 spec；外网 spec 要另配 CORS。
