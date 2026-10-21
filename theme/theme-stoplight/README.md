# theme/theme-stoplight

主题包：md 的 frontmatter 写 `oas3: <URL>` 时，该文档页整页换成**一个 iframe**，框里是本包
自己那条页面（`/stoplight-view`），[Stoplight Elements](https://github.com/Stoplight/elements)
渲染的 OpenAPI 文档跑在那一份文档里。

形状与 [`theme-redoc`](../theme-redoc/README.md)、[`theme-scalar`](../theme-scalar/README.md)
是一对一的，而且**外层那一半三家共用一份**：判 `oas3:` 的 `DocItem`、那个 `<iframe>`、地址拼装
与跨文档那两格（地址栏里的 `#` 段与亮暗模式）都住在 [`theme-iframe`](../theme-iframe/README.md)
（键与形状登记在它的 [`lib/api-frame-registry.ts`](../theme-iframe/lib/api-frame-registry.ts)，
口径见 [`docs/iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)），本包只剩入口那一次
工厂调用与**框内那一页**。**差的也是同一处来源**：Redoc 的样式
由 styled-components 在运行期插进它自己那份文档的 `<head>`，Elements 的是一份**静态样式表** ——
而站点只有全站那一份 css，每个页面都 `<link>` 同一个文件，iframe 拦不住它。所以这一层多做了
一步构建期处理，把那份样式表拆成只由框内那一页加载的独立产物。

> 这一层内部怎么组成、那一步构建期处理怎么做、各处实测到的数字与取值，收在维护者文档
> [`docs/internals.md`](./docs/internals.md)。

## 怎么用

```md
---
title: 订单 API
oas3: /openapi.yaml
---
```

命中时整页换成那一个 iframe，**不包下层 `DocItem`**（判键与替换都发生在 theme-iframe 那一份
`DocItem` 里，与 redoc / scalar / `iframe:` 同一落点），所以那一页不会有
文档正文外壳、也不会再有导图。要「其它页照常、这页是 API 文档」就是这个位置。

`oas3:` 那个值是**框里那份文档去取哪个地址**，它被编码进 iframe 的 `src`
（`/stoplight-view?src=%2Fopenapi.yaml`）。

框内那一格的入参只有地址这一种：`oas3:` 的值是个地址，`@stoplight/elements` 那种「直接给一份
内联文档」的入参本层没有调用方，也就不提供。

## 渲染放在独立页面，文档页只嵌它

|                   | 外层：站点的文档页（`/stoplight-demo`）                                                         | 框内：本包那条页面（`/stoplight-view?src=…`）         |
| ----------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 本层放的东西      | 一个 `<iframe class="api-frame stoplight-frame">`（由 theme-iframe 的 `ApiFrame` 按注册表渲染） | `StoplightUI`，即 `.stoplight-root` 那一格            |
| Elements 的运行时 | 不加载，一行都没有                                                                              | 全在这里                                              |
| 样式表            | 站点的产物 CSS（不含 Elements 那份）                                                            | 站点的产物 CSS + **一条 `<link>` 指向 Elements 那份** |
| 亮暗模式          | 站点的 `<html data-theme>`，开关在这                                                            | 自己 `<html>` 上的 `data-theme`，值由外层送来         |
| 能分享的地址      | 有，`#` 那一段代表当前那条接口                                                                  | 有，但那是「直接打开框里那一页」，见「深链」          |

## 深链：`#/operations/createOrder` 那一段怎么跨过 iframe

能发给别人的是**外层**那条地址：`/stoplight-demo#/operations/createOrder`。hash 段不参与取文件，
浏览器请求的还是这一页自己的那份 html，产物里有它，所以 `pnpm serve` 回 **HTTP 200**。

四个方向各自的路、两侧各推一次的理由、`replaceState` 与 `popstate` 那两格，都记在
[`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)，本层不抄第二遍。这里只留四条本层专属的：

- **`LocationMirror` 刚挂载那一次不报**：那条「初始位置会把外层深链擦掉」的约定住在共享层，
  见 [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md) 的「四个方向各走一条路」一节。
- **`src` 只由 frontmatter 决定**：深链那一段与亮暗模式都不塞进地址，否则整页加载一条深链时
  SSR 那份 html 与客户端第一次渲染就在这一格上对不上。
- **`/stoplight-view?src=%2Fopenapi.yaml` 本身也是条能直接打开的地址**（产物里有那份 html）。
  它不带外层那段 hash，也不该有人拿它当分享链接 —— 这一条另有用例钉「带着 `src` 就能渲染」
  「缺了 `src` 就什么都不摆」（Elements 拿到取不到的地址会把它自己那份「加载失败」摆在正文区，
  那个观感反而更像坏了，所以缺参数时本层什么都不渲染）。
- **整页直达一条深链时，正文区第一颗 `h1` 是那条接口的 summary，不是文档标题**：Elements 从地址
  指的那一格往下铺（实测 `/stoplight-demo#/operations/createOrder` 那份文档里 `h1` 就是
  「新建订单」），而先打开这一页再点下去时 `h1` 是「主题覆盖演示 API」。左栏那条 API 标题
  （一颗 `h4`）两种入口都在、且只有一颗，所以「框里真取到了那份 yaml」这一句量的是它，
  不是跟着入口形状变的 `h1`。

## 局限

- **每条接口在产物里没有自己的 html**。外层地址是真的，但内容仍然只有
  `build/stoplight-demo/index.html` 一份，接口那一格是框里客户端渲染出来的 —— 爬虫、按状态码判活
  的监控看到的是页面本身，不是那条接口。
- **框里那一页对搜索引擎与抓取工具是不可见的**：iframe 的内容按惯例不算进宿主页面。
  以前 Elements 直接渲染在文档页里时，那一页的文字至少在客户端渲染后是本页面的内容；换成 iframe
  之后这条没了。要对外被检索到的 API 文档，得走能出静态 HTML 的路子。
- **两份文档、两套地址**。外层那条能分享；框内那条是本站的一条公开页面，直接打开也能渲染，
  但它没有同步对象，也不该发给别人。地址栏里能看到的只有外层那一条。
- **滚动条在框里**：外层那一页不滚（实测它的 `scrollHeight` 等于视口高度），框内那一份文档自己滚
  （更准确说是 Elements 那两条内层容器在滚）。键盘焦点要先落到框里才能用方向键。
- **`#` 归 Elements 用**：站点常规那种「正文里某个小标题的锚点」在这一页上不成立。
- **`/stoplight-view` 会进站点地图**：`addRoute` 注册的路由在 Docusaurus 眼里就是一条页面，
  实测 `build/sitemap.xml` 里有它。那一页没有标题、没有描述、`src` 缺着时整屏空白。本站的 `url`
  还是 `https://example.com`（占位），所以这里先只记现象；真要收掉，是在配置的 `sitemap` 那一格里
  按路径过滤。
- **拆样式表那一步绑在 Docusaurus 的规则形状上**：官方改了 css 规则的写法就会失配，症状是样式
  漏回全站那一份。它不会静默通过：e2e 里那两句按 `<link>` 数量与 `.sl-` 处数判的断言会红。
  这一步怎么做到的，见 [`docs/internals.md`](./docs/internals.md) 的「样式」一节。
- **亮暗模式只有一个来源**：框里那份文档自己不判断模式（mosaic 那份存档不参与配色）。直接打开
  `/stoplight-view?src=…` 时那条属性是空的，也就一直是亮色。本站默认是亮色，所以「送达之前先亮
  一下」看不出来；把 `themeConfig.colorMode` 的默认改成暗色就会露那一格亮。
- 收掉的两处是 CSS 收的，不是配置关的：DOM 里仍然有。Elements 升版换了那两处的位置，这两条就收不住，
  用例那两句会直接红。
- 站点根目录得真的有 `static/openapi.yaml` 那种本站可读的 spec；外网 spec 要另配 CORS。

## 参考

- [`@stoplight/elements` 仓库](https://github.com/Stoplight/elements) 与
  [文档](https://docs.stoplight.dev/docs/elements/)。
- [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)：跨 iframe 那三条消息与两侧的监听。
- [`theme-redoc` 的 README](../theme-redoc/README.md)：同一形状的另一条层；样式那一步为什么它不需要、
  定高与亮暗两处的取舍差别，在两边的维护者文档 [`docs/internals.md`](./docs/internals.md) 与
  [`../theme-redoc/docs/internals.md`](../theme-redoc/docs/internals.md) 里对照着写。
