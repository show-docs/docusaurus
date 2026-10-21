# theme/theme-iframe

主题包，两件事住在这里：

1. **「整页交给一个框」这一族的外层套壳**：md 的 frontmatter 写 `scalar:` / `redoc:` /
   `oas3:` / `iframe:` 任何一把键时，那一篇文档页**整页**换成一个 `<iframe>` —— 命中的那一页
   不再有文档正文外壳（面包屑、正文、翻页、右侧目录），只剩站点的 navbar。判哪几把键、按什么
   顺序、框的地址怎么拼，全由 `lib/api-frame-registry.ts` 那一份注册表给出；三条 API 层
   （`theme-scalar` / `theme-redoc` / `theme-stoplight`）自己**不再有 `theme/DocItem`**。
2. **跨 iframe 的共享约定**（`lib/`）：iframe 地址怎么拼、三条 postMessage 的形状、两侧的消息
   循环。它以前是单独的 workspace 包 `theme/frame-kit`，收进本包后，三个 API 包按
   `@show-docs/docusaurus-theme-iframe/lib/index.ts` 直接引源码。口径见
   [`docs/iframe-protocol.md`](./docs/iframe-protocol.md)。

本包自己那条 `iframe:` 嵌的是**外部站点**（跨源，没有那条通道）；三条 API 层嵌的是各包自己
那条 `/…-view` 页面（同源），那边才用得上消息循环。

> 包内组成、验到哪一步、新增一条 API 层要动哪几格、本包的编译口径，收在维护者文档
> [`docs/internals.md`](./docs/internals.md)。

## 怎么用

本层自己那条键：

```md
---
title: 外部文档
iframe: https://example.com/handbook/
---
```

命中的页面上，整个 `DocItem` 换成 iframe —— 这一页 markdown 的正文在渲染后的页面上看不到，
和三条 API 层那个「整页交给渲染器」是同一类取舍。没写任何一把键的文档页照常走下层实现，
本层等于透明。

`iframe:` 的地址算法（`lib/frame-messages.ts` 的 `externalFrameURL()`）分两步，只有浏览器端才会
全走完：

1. `src` 以 `/` 开头 → 按当前站点的 origin 补成绝对地址；否则原样用。
2. 地址栏带 `?path=<相对路径>` → 以第 1 步的结果为基准再解一层（用来切外部站点的子页；
   参数值由 `URLSearchParams` 自动解码）。

只对**应解的那一段**动手：曾经还有第三步「整串 `decodeURIComponent` 一次」，会把地址里本来合法的
`%` 序列二次解码，已删。服务端渲染阶段拿不到 `window`，那时 `url` 就是 frontmatter 里那个原值。

> 开发模式（`pnpm start`）与构建产物现在是同一个行为：直接嵌 iframe。以前这一层在开发模式给
> 的是链接（本地改动会不断重载被嵌的页面，太吵），那条分支已经删掉；要看真的 iframe 不再需要
> 先构建。

`scalar:` / `redoc:` / `oas3:` 三条键的用法在各层自己的 README；框本身（地址拼装、深链与亮暗
对齐）由这里的 `ApiFrame` 提供，值都是同一个形状：框要渲染的 spec 地址。

## 放在层栈的哪一处

判四把键的是本层那**一份** `DocItem`，清单由 `lib/api-frame-entries.ts` 的
`resolveFrameDistribution()` 定，规则只有一条：**参与判定的 = 装了的层**（`plugins` 里有其包名、
或其包目录内入口路径的那一项），默认先后 = `lib/api-frame-registry.ts` 里条目的排列顺序
（`scalar` → `redoc` → `oas3` → `iframe`）。站点可以在本层插件选项里用命名空间数组覆盖先后与
启用范围（`plugins` 里写成 `['@show-docs/docusaurus-theme-iframe', { themeConfig: { apiFrame: { order } } }]`），
覆盖**同样查装机**。同一页同时写两把键时排在前面的赢 —— 这一串默认顺序就是收拢前四条层各占一环、
`plugins` 从外到内排列时的同一语义。

没装的层不再像以前那样照样命中、渲染出一个指向不存在路由的框，而是那一格落空交回普通文档页。
落空从「坏框」变成「页面看着正常但键没生效」，所以每一次落空的原因都收进 `warnings`，开发模式由
`DocItem` 交给同一份里的 `warnFrameDistribution()` 打到控制台（每种文本只打一次）。

为什么覆盖挂在**插件选项**而不是站点 `themeConfig`、`plugins` 原始形状的四种写法各怎么认、
「浏览器侧 `plugins` 保留原始形状」这一版本绑定的立足点由谁钉（verify:chain 第 3 节），口径住在
[`iframe-protocol.md` 的「注册表与分发」一节](./docs/iframe-protocol.md)，这里不抄第二份；
分支语义由 `test/api-frame-entries.test.mts` 在单测里钉死。本站不设覆盖，走注册表默认，
判据在 e2e 的 frame-precedence 用例。

- 与 `theme-markmap` **并存**：那一层把导图插在 `DocItem` 前面，本层换的是它插进去包着的
  那一格 `DocItem`，所以同一页两个键都命中时两样都在（导图在上、iframe 在下；按机制说的，
  站点没有这样一页，未实测）。
- 四把键之间**互斥**：命中任何一把就把整个 `DocItem` 换掉，其余键与下层实现都轮不到。

> **落点为什么是 `DocItem`**：命中时**不包**下层 `DocItem`，与 `theme-markmap` 同键不同做法
> （markmap 包着下层，本层替换）。早期版本落在 `DocItem/Content`，为的是保住文档外壳；那时
> 踩过一个坑——官方 `DocItem` 渲染的是 `<DocItemLayout><MDXComponent /></DocItemLayout>`，
> `MDXComponent` 就是它的 `props.content`，**`props.children` 它一个字都不读**，把 iframe 当
> children 塞给 `DocItem` 会静默丢掉（构建产物里 `iframe` 标签数为 0）。现在这一层根本不使用
> children，那个坑不成立。

## 已知的边界

- 外部站点自己设了 `X-Frame-Options` 或 CSP 的 `frame-ancestors` 时，iframe 位置会是空白 ——
  那是浏览器拒绝嵌它，不是本包的失败，构建与渲染都是绿的。
- iframe 里的内容与站点主题、暗亮模式、路由都不相干：`iframe:` 嵌的是**外部站点**时只能这样
  （跨源，也没有对方的代码可配合）。站点上另外三处 iframe 装的是**各包自己那条页面**
  （`/redoc-view` 等，同源），所以那边能把亮暗模式与地址栏里 `#` 那一段两份文档对齐 ——
  那条通道就住在本包 `lib/`，做法与代价见
  [`docs/iframe-protocol.md`](./docs/iframe-protocol.md) 与各层 README。
- 命中的那页连官方 `DocItem/Metadata` 一起不要，所以浏览器标签页的标题与 `<meta description>`
  退回站点名，不跟这一页的 `title:` / `description:` 走。
- `components/api-frame.css` 是**全局**样式，而且是四条层共用的那一格：`.api-frame` 的定高、
  `.container:has(iframe)` 的让位，与 `.main-wrapper:has(.api-frame) + .footer` 收掉的站点页脚
  都写在这份里。`.container:has(iframe)` 按「这一格里有 iframe」
  匹配，正文里手写的 iframe 也会让承载它的容器去掉内边距。把各层重复的那三条
  `.container:has(.X-frame)` 收进这一条时核过等价：那一格是 `.container` 自己，父链上没有别的
  宽度约束，`max-width: 100%` 与原先那些 `unset` 都落到「铺满」。
- **站点配了页脚（`themeConfig.footer`）才看得出这一条**：框占满 navbar 以下那一屏，页脚留在下面
  就是一条只能滚到页脚的空白，所以命中页把它收掉。收掉的判据认的是共用的 `.api-frame` 而不是裸
  `iframe` —— 正文里手写 iframe 的普通文档页不该顺带把整站页脚收掉。
- **三条规则都共用，目前没有只属于一层的版式规则**：某一层真要改自己那一格，给它那个类名一条
  规则就够了，不必再抄一份尺寸。三条 API 层的框各挂两个类名（`.api-frame` + `.redoc-frame` 这样），
  e2e 判「这一格是哪一层赢的」认的也是那第二个。
