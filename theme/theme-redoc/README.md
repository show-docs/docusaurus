# theme/theme-redoc

主题包：md 的 frontmatter 写 `redoc: <URL>` 时，该文档页整页换成**一个 iframe**，框里是本包
自己那条页面（`/redoc-view`），[Redoc](https://github.com/Redocly/redoc) 渲染的 OpenAPI 文档跑在
那一份文档里。

形状与 [`theme-stoplight`](../theme-stoplight/README.md)、[`theme-scalar`](../theme-scalar/README.md)
是一对一的，而且**外层那一半三家共用一份**：判 `redoc:` 的 `DocItem`、那个 `<iframe>`、地址拼装
与跨文档那两格的循环都住在 [`theme-iframe`](../theme-iframe/README.md)（键与形状登记在它的
[`lib/api-frame-registry.ts`](../theme-iframe/lib/api-frame-registry.ts)，口径见
[`docs/iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)），本包只剩入口那一次工厂调用与
**框内那一页**。差的三处是：这一格要补的 Node 侧
依赖不一样、它的暗色表挂在 Redoc 自己按操作系统写的类名上（所以要多一个运行期中间件）、
以及**它的样式表是运行期注入的，所以本层在样式那一格一行代码都不剩**。

> 这一层内部怎么组成、上面那三处各自怎么做到的、各处实测到的数字与取值，收在维护者文档
> [`docs/internals.md`](./docs/internals.md)。

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

|                | 外层：站点的文档页（`/redoc-demo`）                                                         | 框内：本包那条页面（`/redoc-view?src=…`）          |
| -------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 本层放的东西   | 一个 `<iframe class="api-frame redoc-frame">`（由 theme-iframe 的 `ApiFrame` 按注册表渲染） | `RedocUI`，即 `.redoc-root` 那一格                 |
| Redoc 的运行时 | 不加载，一行都没有                                                                          | 全在这里                                           |
| 样式表         | 站点的产物 CSS                                                                              | 站点的产物 CSS + Redoc 运行期那张表                |
| 亮暗模式       | 站点的 `<html data-theme>`，开关在这                                                        | 自己 `<html>` 上的 `data-redoc-mode`，值由外层送来 |
| 能分享的地址   | 有，`#` 那一段代表当前那条接口                                                              | 有，但那是「直接打开框里那一页」，见「深链」       |

## 深链：`#/orders/createorder` 那一段怎么跨过 iframe

能发给别人的是**外层**那条地址：`/redoc-demo#/orders/createorder`。hash 段不参与取文件，浏览器
请求的还是这一页自己的那份 html，产物里有它，所以 `pnpm serve` 回 **HTTP 200**。但 Redoc 在框里，
那一段得送进另一份文档去。

**四个方向各走哪条路、为什么这么走，记在
[`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md) 的「四个方向各走一条路」一节**，
两条形同这一层（`theme-stoplight`、`theme-scalar` 两条也是这一套）。本层的名字（命名空间
`@show-docs/docusaurus-theme-redoc`、路由 `redoc-view`、参数 `src`）登记在 theme-iframe 的
注册表里，拼地址走它的 `ApiFrame`（内部调共享层的 `frameViewSrc()`，`src` 里只编码 spec，不编码 hash）。

这里只留属于 Redoc 这一层的实测（那一次「`page.reload()` 之后框里一条消息都没收到」栽的是共享的
握手，记在 [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md) 的「对齐是两侧各推一次的」一节）：

- **直达一条深链时 Redoc 的正文比「先打开再点下去」短**：它从地址指的那一格往下铺，标题清单少两条
  （只有 `列出订单`、`新建订单` 这两个 `h2`，API 标题与分组那两条不在）。那是 Redoc 自己的路由行为，
  不是本层丢了内容，所以 e2e 两条用例各钉各的清单，没有共用一句判据。

框内 → 外层那一条由 `redoc-ui.tsx` 里那个 `LocationMirror` 站在 `HashRouter` 里面用
`useLocation()` 报出去（`createRouteReporter()` 造的函数）；「刚挂载那一次不报」的理由见
[`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md) 那一条。

`/redoc-view?src=%2Fopenapi.yaml` 本身也是条能直接打开的地址（产物里有那份 html）。它不带外层那段
hash，也不该有人拿它当分享链接 —— 这一条另有用例钉「带着 `src` 就能渲染」「缺了 `src` 就什么都
不摆」，别把它和上面那条混起来。

## 局限

- **每条接口在产物里没有自己的 html**。外层地址是真的，但内容仍然只有 `build/redoc-demo/index.html`
  一份，接口那一格是框里客户端渲染出来的 —— 爬虫、按状态码判活的监控看到的是页面本身，不是那条接口。
- **框里那一页对搜索引擎与抓取工具是不可见的**：iframe 的内容按惯例不算进宿主页面。以前 Redoc
  直接渲染在文档页里时，那一页的文字至少在客户端渲染后是本页面的内容；换成 iframe 之后这条没了。
  要对外被检索到的 API 文档，得走能出静态 HTML 的路子。
- **两份文档、两套地址**。外层那条能分享；框内那条（`/redoc-view?src=…`）是本站的一条公开地址，
  直接打开也能渲染，但它不带 `#` 那一段的同步对象，也不该发给别人。地址栏里能看到的只有外层那一条。
- **滚动条在框里**：外层那一页不滚（实测它的 `scrollHeight` 等于视口高度），框内那份文档自己滚。
  浏览器那种「整页一个滚动位置」在这里变成两格；键盘焦点也要先进框里才能用方向键滚。
- **`#` 归 Redoc 用**：站点常规那种「正文里某个小标题的锚点」在这一页上不成立（本页整页交给框，
  本来也没有那种锚）。
- **`/redoc-view` 会进站点地图**：`addRoute` 注册的路由在 Docusaurus 眼里就是一条页面，
  实测 `build/sitemap.xml` 里有它。那一页没有标题、没有描述、`src` 缺着时整屏空白，被索引到
  也没有内容可展示。本站的 `url` 还是 `https://example.com`（占位），所以这里先只记现象；
  真要收掉，是在配置的 `sitemap` 那一格里按路径过滤，而不是让这一层少注册一条路由。
- 按路径的那一版地址（`/redoc-demo/orders/createorder`）现在退回站点自己的 404 页 ——
  实测 `pnpm serve` 对它回 404 加官方「找不到页面」。那种形状从没进过提交，也没有发出去的链接
  要照顾，所以这里不做「路径 → hash」的翻译。
- **框内那份文档的 `<html>` 整个交给 Redoc 用**：它把那批 CSS 变量与底色、字色、字体三条真属性
  定义在那里。这一份文档整份就是给 Redoc 的，没有别的元素受害；站点那一页收不到，因为外层根本没有
  那张表。实测数字与「和站点变量重名吗」这一问的答案记在
  [`docs/internals.md`](./docs/internals.md) 的「样式」一节。
- **亮暗模式要跨两份文档**：靠的是共享层那条 `mode` 消息（外层读 `useColorMode()` 交给
  `useOuterFrameSync` 送进来，见 [`docs/internals.md`](./docs/internals.md) 的「亮暗模式」一节与
  [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)），不是框架的存储同步。代价是这一格只有一个
  来源：**框里那份文档自己不再判断模式**。直接打开 `/redoc-view?src=…`（没有外层给它送）时，那条属性始终是空的，也就一直是亮色；
  这一条与「那条地址不该发给别人」是同一件事（见上面那张表）。本站的默认模式是
  亮色，所以「那一句送达之前先亮一下」在站点这一侧看不出来；把 `themeConfig.colorMode` 的
  默认值改成暗色，这一页就会露那一格亮。
- Redoc 自己那套判定**照跑不误**：它仍然按操作系统的偏好往框内那份文档的 `<html>` 类名上写
  `light` / `dark`，仍然往 localStorage 存一份 `redoc.colorMode`。这两样对本页现在是死的（配色不看
  类名，站点也没有裸 `.dark` 规则），只是留在 DOM 与 localStorage 里。哪天 Redoc 改了判据、让那个
  类名参与别的规则，这一页的配色就会重新和站点脱钩 —— 用例「站点的亮暗模式不受操作系统影响」
  钉的就是「类名确实在、配色却是站点这一头的」，跑偏会红。
- 改挂过去的那批暗色规则命中的是**框内那份文档的 `<html>` 本身**，里面除变量外还有两条真属性
  （`color-scheme` 与滚动条滑块的底色）。这一格是有意如此：那一份文档就是 Redoc 的画布。
  站点那一侧不受影响由 e2e 那句「站点自己的那几处样式在暗色下也不被 Redoc 改写」按值量。
- 收掉的那三处（亮暗切换按钮、Redocly 署名、章节标题旁那一整格操作按钮）都是 CSS 收的，
  不是配置关的：DOM 里仍然有，靠的是 Redoc 自己那份 `data-testid` / `data-component-name`。
  它升版换了这些标识，这三处就收不住了 —— 用的是**功能格**而不是随机类名，且 e2e 那三句会直接红，
  不会静默失效。章节标题那一格还有一层：官方 schema 里那条 `navigation.actions` 在本装的
  3.0.1 里根本没人读（两发实测记在 [`docs/internals.md`](./docs/internals.md) 的「收掉的三处 Redoc 自己的东西」一节），
  所以哪天升级到了真读它的版本，这条 CSS 与那条配置就重复了，按届时的实测留一条即可。
- 站点根目录得真的有 `static/openapi.yaml` 那种本站可读的 spec；外网 spec 要另配 CORS。
