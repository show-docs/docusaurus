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

## 状态：已接入站点

`docusaurus.config.mjs` 的 `plugins` 里排在 `@show-docs/docusaurus-theme-markmap` **之后**。
四条 API 相关层的先后不再决定判定优先级 —— 优先级住在注册表里（见「放在层栈的哪一处」），
`plugins` 顺序现在只决定 `@theme-prev` 链上「本层 vs markmap」的相对位置。站点根的
`package.json` 声明了 `"@show-docs/docusaurus-theme-iframe": "workspace:^"`。
`pnpm build` 与 `pnpm verify:chain` 都绿，推导出的层栈里有 `theme/theme-iframe/theme`。
这一层提供的是 `DocItem`，`@theme-prev/DocItem` 落回 `theme-markmap` 那一层；
`DocItem/Content` 那根链上现在只有官方一份实现。

产物侧能看到的是这一层进了链、`components/api-frame.css` 编译进了站点样式；页面里真的嵌出
外部站点只能在浏览器看（`pnpm build && pnpm serve`）。浏览器里的实测记在仓库根的 e2e
（`test/e2e/features/iframe.feature`，跑法见 [`test/README.md`](../../test/README.md)）。

包名挂 `@show-docs/`，与仓库其它包同一域，所以列进 `test/plugin.test.mts` 那条分包用例的目录清单
只差改清单本身。

## 组成

| 文件                        | 编译吗              | 职责                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`             | ✅ `src/` → `dist/` | 本层入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算，就是 `../theme`）；`iframe:` 那条键没有框内页面要注册                                                                                                                                                    |
| `theme/DocItem/index.tsx`   | ❌ 站点编译         | **这一族唯一的外层套壳**：按注册表顺序判四把键，命中就换成 `ApiFrame`，不命中整个交回下层                                                                                                                                                                              |
| `components/api-frame.tsx`  | ❌ 站点编译         | 通用框：`internal` 条目拼 `/…-view` 地址并挂消息循环，`external` 条目走两步地址算法（补 origin、`?path=` 再解一层）；`title` 优先用页面的 `frontMatter.title`，注册表那条只兜底                                                                                        |
| `components/api-frame.css`  | ❌ 站点编译         | 框的基线样式（`.api-frame` 与让位的 `.container`）；各层自己的定高与收页脚仍在自己那份 `*-frame.css` 里                                                                                                                                                                |
| `lib/index.ts`              | ❌ 站点编译         | 浏览器侧共享约定的出口（供三条 API 层引）；**不含**配置期那份工厂，免得 `node:path` 进浏览器 bundle                                                                                                                                                                    |
| `lib/api-frame-registry.ts` | ❌ 站点编译         | 注册表：四条形同的条目（命名空间、frontmatter 键、类名、路由名……），纯数据不引 React，配置期与浏览器期引同一份                                                                                                                                                         |
| `lib/api-frame-entries.ts`  | ❌ 站点编译         | 判定清单的分发：装了的层参与判定（覆盖也不放宽这一条），注册表顺序为默认，站点可在本层插件选项 `themeConfig.apiFrame.order` 里覆盖顺序与子集；落空原因进 `warnings`，开发模式由 `DocItem` 打出；纯函数，单测（`test/api-frame-entries.test.mts`）与 `DocItem` 引同一份 |
| `lib/api-frame-messages.ts` | ❌ 站点编译         | 按命名空间造那三条 postMessage 的名字，带缓存（同一命名空间每次拿到同一个对象，effect 依赖不换引用）                                                                                                                                                                   |
| `lib/api-frame-theme.mts`   | ❌ 不进 `tsc`       | **配置期**入口工厂：三条 API 层的 `src/index.mts` 调它拿 Plugin 形状（挂层目录、注册框内那条路由、接各自的 webpack 差异）；`.mts` 后缀按上游 lint preset 标 Node 环境                                                                                                  |
| `lib/frame-messages.ts`     | ❌ 站点编译         | 约定与形状：iframe 地址、三条 postMessage（纯函数，不引 React、不引 DOM）                                                                                                                                                                                              |
| `lib/frame-trust.ts`        | ❌ 站点编译         | 来源校验 `isTrustedMessage`：引 DOM 类型，单独一份，免得注册表那条配置期链路上碰到 `Window`                                                                                                                                                                            |
| `lib/frame-sync.ts`         | ❌ 站点编译         | 两侧的消息循环：`useOuterFrameSync` / `useInnerFrameSync` / `createRouteReporter`                                                                                                                                                                                      |
| `docs/iframe-protocol.md`   | ——                  | 那份共享约定的口径与踩过的坑（含注册表一节）（原 `theme/frame-kit/README.md`）                                                                                                                                                                                         |
| `module-aliases.d.ts`       | 类型                | 引官方 `@docusaurus/module-type-aliases`，给构建期才存在的那些 import 补类型                                                                                                                                                                                           |
| `tsconfig.build.json`       | ——                  | 构建项目：只有 `src/`，所以本包的产物出口是 `dist/index.mjs`；`lib/` 与 `components/`、`theme/` 都不进 `tsc`                                                                                                                                                           |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/` 里的
`.tsx`，本包就不编译第二遍；`lib/api-frame-theme.mts` 是唯一的例外形态：它既不由站点编译，
也不由本包编译，而是 jiti（Docusaurus 的配置加载器）在配置期直接吃这份源码。口径的产地在仓库根
README 的「构建包的编译口径」。

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

`iframe:` 的地址算法（`api-frame.tsx` 里 `externalURL`）分两步，只有浏览器端才会全走完：

1. `src` 以 `/` 开头 → 按当前站点的 origin 补成绝对地址；否则原样用。
2. 地址栏带 `?path=<相对路径>` → 以第 1 步的结果为基准再解一层（用来切外部站点的子页；
   参数值由 `URLSearchParams` 自动解码）。

曾经还有第三步「整体 `decodeURIComponent` 一次」——它会把地址里**本来合法**的 `%` 序列二次解码
（`?a=%25` 变 `?a=%`、`/a%2Fb` 变 `/a/b`），已删；要解的 `path` 参数自动解，frontmatter 里的
`src` 是明文，不该再动。

服务端渲染阶段拿不到 `window`，所以那时 `url` 就是 frontmatter 里那个原值。

> 开发模式（`pnpm start`）与构建产物现在是同一个行为：直接嵌 iframe。以前这一层在开发模式给
> 的是链接（本地改动会不断重载被嵌的页面，太吵），那条分支已经删掉；要看真的 iframe 不再需要
> 先构建。

`scalar:` / `redoc:` / `oas3:` 三条键的用法在各层自己的 README；框本身（地址拼装、深链与亮暗
对齐）由这里的 `ApiFrame` 提供，值都是同一个形状：框要渲染的 spec 地址。

## 放在层栈的哪一处

判四把键的是本层那**一份** `DocItem`，清单由 `lib/api-frame-entries.ts` 的
`resolveFrameDistribution()` 定，规则只有一条：**参与判定的 = 装了的层**（`plugins` 里有其包名、
或其包目录内入口路径的那一项），默认先后 = `lib/api-frame-registry.ts` 里条目的排列顺序
（`scalar` → `redoc` → `oas3` → `iframe`）。站点没注册 `@show-docs/docusaurus-theme-scalar` 时，`scalar:` 那一格落空交回
普通文档页，而不是渲染一个指向不存在路由的框 —— 落空从「坏框」变成「页面看着正常但键没生效」，
所以每一次落空的原因都收进 `warnings`，开发模式由 `DocItem` 打到控制台。这一串默认顺序就是
收拢前四条层各占一环、`plugins` 从外到内排列时的同一语义 —— 同一页同时写两把键时，排在前面的赢。
站点可以在本层插件选项里用命名空间数组覆盖先后与启用范围（`plugins` 里写成
`['@show-docs/docusaurus-theme-iframe', { themeConfig: { apiFrame: { order } } }]`），覆盖**同样
查装机**。覆盖为什么挂在**插件选项**而不是站点 `themeConfig`、`plugins` 原始形状的四种写法各怎么认、
各怎么实测，还有「浏览器侧 `plugins` 保留原始形状」这一版本绑定的立足点由谁钉（verify:chain 第 3
节），口径住在 [`iframe-protocol.md` 的「注册表与分发」一节](./docs/iframe-protocol.md)，
这里不抄第二份；分支语义由 `test/api-frame-entries.test.mts` 在单测里钉死。本站不设覆盖，
走注册表默认，判据在 e2e 的 frame-precedence 用例。

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

## 新增一条 API 层要动哪里

1. `lib/api-frame-registry.ts` 加一条（命名空间、键名、路由名、参数名、类名、`@theme/` 别名、
   `title` 兜底值）。想让某个站点换判定先后或只放行其中几把，不用改这里 —— 插件选项里那条
   `order`（上一节）。新层的包还要把本层写进它自己的 `peerDependencies`（版本契约的口径见
   [`iframe-protocol.md`](./docs/iframe-protocol.md) 末了那条配方）。
2. 新包只写两份：`src/index.mts` 调 `createApiFrameTheme()` 一次，框内那一份 view 组件。
   包的 `package.json` 把本层声明成 **peerDependencies**（`"@show-docs/docusaurus-theme-iframe": "workspace:^"`，
   语义上是那份版本契约：协议变了，中心升版，消费方在**安装期**就被范围拦下，而不是等构建期工厂抛错）。
3. 外层（DocItem、框、消息循环、地址）一概不用动 —— 这就是收拢的意义。

## 编译口径

`src/index.mts` 进 `tsc`（差量清单与理由记在仓库根 README 的「构建包的编译口径」，这里不抄
第二份）。本包自己的几格：

- 入口里的 `getThemePath()` 返回 `../theme` —— 相对的是**产物**目录（`dist/`），不是 `src/`。
- 层、`components/`、`lib/` 都不进构建项目，`files` 因此要点名五份：
  `["components", "dist", "docs", "lib", "theme"]`。只发 `dist` 的话，包装上站点会报层目录
  不存在；`lib` 少了，用它的三个包在装好的站点里引不到源码。
- `lib/api-frame-theme.mts` 站在配置期：它引 `node:path`，所以**不进** `lib/index.ts` 那一份
  浏览器出口；三条 API 层的入口按全 specifier
  `@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts` 引它（包的 `exports` 里
  `./lib/*` 是通配，`/lib` 裸路径不解析）。
- `components/api-frame.css` 与用它的组件同目录，`theme/DocItem/index.tsx` 静态 import
  `../../components/api-frame.tsx` —— 磁盘上就是这个文件，未编译这一侧不存在「产物名改写」。
- 改 `theme/` 与 `components/` 不用先编译，`pnpm start` 直接生效；改注册表也一样（两边都是
  源码），改入口才要 `pnpm build:core`。这些未编译的源码归仓库根 `tsconfig.json` 检查，
  所以 `pnpm lint:type` 就是它们的门：`@theme-prev/DocItem` 的类型产地在解析器包里
  [`types/theme-specifiers.d.ts`](../../plugins/plugin-prev-layer-resolver/types/theme-specifiers.d.ts)，
  `@docusaurus/router` 那几条靠包根的 `module-aliases.d.ts`；
  `@theme-prev/X` 的语义见
  [plugin-prev-layer-resolver 的 README](../../plugins/plugin-prev-layer-resolver/README.md)。

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
- `components/api-frame.css` 是**全局**样式：`.container:has(iframe)` 按「这一格里有 iframe」
  匹配，正文里手写的 iframe 也会让承载它的容器去掉内边距；`.iframe` 这个类名因此是全站的。
  三条 API 层的框也会打到 —— 与它们自己要的那一格同方向（都是去掉内边距与最大宽度），效果没有
  冲突。它们**不复用**这个选择器，各自按类名声明边界：哪天本层的这一条改了口径，那边要跟着红
  而不是静默跟着变。
