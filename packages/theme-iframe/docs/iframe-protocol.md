# 跨 iframe 共享约定（`packages/theme-iframe/` 的 `lib/` 与 `src/`）

共享层，两件事住在本包的 `lib/` 与 `src/` 里：

1. **「整页交给一个框」这一族的注册表与配置期工厂** —— 判哪几把 frontmatter 键、框的地址
   怎么拼、框内那条路由注册在哪，都由这一份给出（注册表在 `src/api-frame-registry.ts`，
   浏览器侧经 `lib/` 那条转出引同一份源码）；「装了的那几层各接管哪一页」由本包在配置期交给
   `@show-docs/docusaurus-theme-component-page`（`src/api-frame-contribute.mts`，见下面
   「注册表与分发」一节）；
2. **两侧要说的那几句话** —— iframe 地址、三条 postMessage 的形状与两侧的消息循环。

源码分两处：浏览器侧共用的约定住在 [`theme-iframe`](../README.md) 包的 `lib/` 里
（`exports` 用 `./lib/*` 直接把源码交给用它的包）；注册表与交出清单那一格住在 `src/` 里
（本包入口要用，得进 `tsc`）。

[`theme-redoc`](../../theme-redoc/README.md)、[`theme-stoplight`](../../theme-stoplight/README.md) 与
[`theme-scalar`](../../theme-scalar/README.md) 用的是同一套：站点的文档页里只放一个 `<iframe>`（那一个框由
本包 `components/api-frame.tsx` 渲染），框里是那个包自己注册的一条页面（`/redoc-view`、`/stoplight-view`、
`/scalar-view`），渲染器跑在框里那份文档内。地址栏里 `#` 那一段（选中了哪条接口）与站点的亮暗模式都住在**外层**那份文档，
渲染器在**框内**那份文档，两边得靠 postMessage 对齐 —— 这一格三个包的代码逐字一样，所以抽到这里，
各家的**不同**（框内那一格的尺寸、样式表怎么进来、亮暗落到哪个元素上、渲染器的脾性）留在各包里；
外层那一格的尺寸四条层一样，所以它在这一份里（见「尺寸与样式表」一节）。

这一份 `lib/` **不是**一条主题层目录：里面没有 `theme/`，层栈里看不见它。它有两种被用的方式：
三个 API 包把它当普通依赖 import（`"@show-docs/docusaurus-theme-iframe": "workspace:^"`，写在
`peerDependencies` —— 那份版本契约见下面「注册表与分发」末了；浏览器侧 import 写
`@show-docs/docusaurus-theme-iframe/lib/index.ts`）；配置期那份工厂（`api-frame-theme.mts`）
由各包入口按全 specifier 引。本包的 `theme/ApiFramePage`（命中后替换整个 `DocItem` 的那一格）
**用的就是这一份注册表**；四把键「归谁」由配置期交出的清单判（`src/api-frame-contribute.mts`），
`iframe:` 那条嵌的是**外部站点**，跨源，注册表里是一条 `external` 条目，没有这条消息通道。

## 组成

| 文件                           | 编译吗              | 职责                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/index.ts`                 | ❌ 站点编译         | 浏览器侧出口，把下面几份再导出去一次；**不含** `api-frame-theme.mts`（那份引 `node:path`，进不了浏览器 bundle）                                                                                                                                                                                                          |
| `src/api-frame-registry.ts`    | ✅ `src/` → `dist/` | 注册表：四条形同的条目（命名空间、frontmatter 键、类名、路由名……），纯数据、零 import，配置期与浏览器期引同一份源码                                                                                                                                                                                                      |
| `lib/api-frame-registry.ts`    | ❌ 站点编译         | 注册表的浏览器侧转出：`export * from '../src/api-frame-registry.ts'`（`src/` 进 `tsc`，不能反过来引未编译的 `lib/`）                                                                                                                                                                                                     |
| `src/api-frame-contribute.mts` | ✅ `src/` → `dist/` | **配置期**那一格：装了的那几层按注册表顺序各交一页给 component-page；站点插件选项 `themeConfig.apiFrame.order` 换顺序、取子集；拼错的名字与列了没装的层进 `warnings`，入口在 `loadContent()` 打一次                                                                                                                      |
| `lib/api-frame-entries.ts`     | ❌ 站点编译         | **页面侧**那一格：一页归了本层之后，框里渲染哪份文档、写歪了怎么提示（缺 spec 地址 / 两把 spec 键同时写）；`warnFramePages()` 去重后打到控制台（开发模式由 `ApiFramePage` 调）；不引 React，单测与组件引同一份                                                                                                           |
| `lib/api-frame-messages.ts`    | ❌ 站点编译         | 按命名空间造那三条消息的名字，带缓存（同一命名空间每次拿到同一个对象）                                                                                                                                                                                                                                                   |
| `lib/api-frame-view.tsx`       | ❌ 站点编译         | 框内那份**页面工厂** `createApiFrameView()`：三条 API 层的 `theme/XxxPage` 各调它一次，交「包名 + 渲染接线（静态 `view`，或按需取的 `loadView`）+ 亮暗的落法（`modeAttribute` 或 `onMode`）」。注册表守卫、从地址取 spec、`useInnerFrameSync`、`ready` 那一句、报回外层全在这一份里；单测 `test/api-frame-view.test.mts` |
| `lib/api-frame-theme.mts`      | ❌ 配置期           | 入口工厂：三条 API 层的 `src/index.mts` 调它拿 Plugin 形状（挂层目录、注册框内路由、接各自的 webpack 差异）；`.mts` 按上游 lint preset 标 Node 环境                                                                                                                                                                      |
| `lib/frame-messages.ts`        | ❌ 站点编译         | 约定与形状：iframe 地址怎么拼（框内那条 `frameViewSrc` / `specUrlFromSearch`、`iframe:` 那条 `externalFrameURL`）、三条消息怎么造怎么认（**纯函数，不引 React、不引 DOM**）                                                                                                                                              |
| `lib/frame-sync.ts`            | ❌ 站点编译         | 两侧的消息循环：`useOuterFrameSync`（外层那份文档里）、`useInnerFrameSync` 与 `createRouteReporter`（框内那份文档里），加两边都过的来源校验 `isTrustedMessage`（引 DOM 类型的只有这一份，注册表那条配置期链路碰不到 `Window`）                                                                                           |

「编译吗」那一列的判据是谁编译 —— 口径的产地在仓库根 README 的「构建包的编译口径」。这一格的特别之处
是**没有编译产物**：本包的构建项目（`tsconfig.build.json`）只收 `src/`，`lib/` 不进 `tsc`，
`exports` 的 `./lib/*` 直接把源码交给用它的包 —— 浏览器那几份只在浏览器里跑；唯一的例外
`api-frame-theme.mts` 跑在**配置期**（Docusaurus 的 jiti 直接吃这份源码），那一条链从
`theme-*/src/index.mts`（经 `tsc` 的产物）跨到这份源码，两侧编译器不同、文件同一份。

## 注册表与分发：四把匹配键、两把 spec 键、一份默认顺序

`src/api-frame-registry.ts`（浏览器侧经 `lib/api-frame-registry.ts` 转出）是这一族唯一的**形状**来源。
每个条目两种 `kind`：

- `internal`（scalar / redoc / stoplight）：命名空间、**布尔** frontmatter 键（`scalar: true` /
  `redoc: true` / `stoplight: true` —— 只说「这一层接这一页」）、**spec 键**（有序的一组：
  `oas3:` / `aas3:`，这一层渲染哪份文档由组里第一把非空地址给）、框内页面的路由名
  （`scalar-view`……）、spec 参数的查询名（`src`）、`@theme/` 页面别名、外层 `<iframe>` 的
  **第二个**类名（`.scalar-frame`……；第一个是四条层共用的 `.api-frame`，尺寸与容器让位都在它
  上面，见「尺寸与样式表」一节）与 `title`（**兜底值**：页面写了 `frontMatter.title` 时优先用
  页面自己的，`ApiFrame` 那一步）。框里是本包那条插件页面，同源，深链与亮暗靠消息循环对齐。
- `external`（`iframe:`）：只有命名空间、键、类名与 `title` —— 框里是外部站点，地址算法在
  `lib/frame-messages.ts` 的 `externalFrameURL()`：`src` 以 `/` 开头时按当前站点的 origin 补成
  绝对地址，否则原样用；地址栏带 `?path=<相对路径>` 时以它为基准再解一层（参数值由
  `URLSearchParams` 自动解码）。只对**应解的那一段**动手 —— 曾经还有「整串 `decodeURIComponent`」
  的第三步，会把地址里本来合法的 `%` 序列二次解码，已删。服务端渲染阶段拿不到 `window`，那一遍
  走 `httpsOnHttpsSite()`：相对写法原样写进 html，只把绝对 `http:` 按 `siteConfig.url` 的协议
  升掉（这个框先加载、后由 React 改 `src`，html 里留着 http 的话线上首屏还会先撞一次混合内容）。

**命中之后，这一页还要能出框**（判据在 `lib/api-frame-entries.ts` 的 `framePageUrl()` /
`framePageWarnings()`，`ApiFramePage` 与单测引同一份）：

- 三条 API 层：component-page 按 `match: 'boolean'` 判「键写没写 `true`」；命中只说明「用这一层
  渲染」，框里要渲染的文档还要**另有** spec 键给地址（`oas3:` / `aas3:` 里第一把非空的）——
  「用哪一层渲染」与「渲染哪份文档」是两件事。两把都缺（或只有空串），这一页交回普通文档页，
  开发模式告警。
- `iframe:`：component-page 按 `match: 'value'` 判，值就是框要渲染的那份页面，它**不读** spec 键。
  拿到的不像地址（站点覆写组件时什么样都可能传进来）同样交回普通文档页。

spec 键里第一把非空地址被送进框里那条路由的
`src` 参数（`frameViewSrc()` 那一步），框内那页按它取文档。

`frameViewSrc()` 还按 `siteConfig.trailingSlash` 定路径末尾那条斜杠：`false` 时产物是
`{route}.html`、地址保持无斜杠；其余情况（`true` 或没配）产物是 `{route}/index.html`、地址
补上尾斜杠。补这一条是为了**不经过**静态服务器那条「补斜杠」的 301 —— 它的 `Location` 由
部署侧生成，反向代理后面常写成 `http://`，https 页面上这一跳会被浏览器按混合内容拦掉，框
直接空白（实测 `open.test.xinxiangsui.com.cn` 上就是这样：`/stoplight-view?src=…` 301 到
`http://…/stoplight-view/?src=…`，框被拦；`/stoplight-view/?src=…` 直接 200）。

两条地址（spec 键那条与 `iframe:` 那条）都有一条协议口径：**https 页面上的 `http:` 地址升成
https，只升不降**（域名、路径、查询与非默认端口不动）。框内那一页自己就是 https 的，去取一个
http 的 spec 必被浏览器按混合内容拦掉，不升那一格只能是空的；对方只支持 http 时得换 https 或
放进本站 `static/`。实现是 `frame-messages.ts` 的 `upgraded()`，`specUrlFromSearch()`、
`externalFrameURL()`、`httpsOnHttpsSite()` 三处共用。

**两把 spec 键给的都是一个地址，分发不看文档类型**：`oas3:` 习惯摆 OpenAPI、`aas3:` 习惯摆
AsyncAPI 3，但这一格只要求它是个非空字符串，判据在厂商那边（Scalar 认文档里 `asyncapi:` 那一格，
Redoc 认 `asyncapi.startsWith('3.')`）。两把同时写时按注册表顺序（`oas3` 在前）用第一把，另一把
被忽略 —— 开发模式有一条「两把都写通常是手误」的告警。实测过 AsyncAPI 3 的是 scalar 与 redoc
两层，stoplight 那一层没测。

**条目在注册表里的排列顺序 = 判定优先级的默认值**，但「装了的那几层各接管哪一页」由本包在
**配置期**算好、交给 `theme-component-page`（`src/api-frame-contribute.mts`，交出
`{ pages, warnings }`）：component-page 按交出的顺序逐条判，第一条命中的赢。规则只有一条：
参与交出的层 = 装了的层（`plugins` 或 `themes` 里有其包名、或其包目录内入口路径的
那一项，认法见下面「槽位怎么认层」那一段——判据住在解析器包的 `./plugin-slots`；两份清单合并后
与 Docusaurus 的真实插件表一致）；站点可在本层那一项的
插件选项 `['@show-docs/docusaurus-theme-iframe', { themeConfig: { apiFrame: { order: [...] } } }]`
里用命名空间数组覆盖参与判定的**顺序与子集**。覆盖不放宽装机过滤 —— 列了没装的层照样不交，
否则「框指向不存在路由」这个失败模式会在覆盖下被重新引入。两个推论：

- 没装的层不再像以前那样照样命中、渲染出一个指向不存在路由的框（浏览器里 `…-view` 回 404
  一片空白），而是那一页落空，交回普通文档页。实测：注释掉 `plugins` 里 scalar 那一条重建，
  `build/theme-scalar/docs/scalar-demo/index.html` 里 `<iframe>` 数从 1 变 0，写了四把键的夹具页换成 redoc 框。
- 落空从「坏框」（肉眼可见）变成「页面看起来正常但键没生效」（看不见）。配置级那几类
  （覆盖清单里拼错的名字、列了没装的层）在 `loadContent()` 里说一次；页面级那两类
  （命中了却没给 spec 地址、两把 spec 键同时写）由 `ApiFramePage` 在**开发模式**交给
  `warnFramePages()`，每条一次 dev server 会话只打一遍，构建产物不打。**不再有**的三类：
  「布尔键写了但那一层没装」（那一层根本不交页）、「只给了 spec 键没写布尔键」（没有哪一层认领
  这一页）、「覆盖挂在认不出本层的槽位上」（选项现在由本层自己拿到，孤立的覆盖不再存在）。
  「布尔键写成了别的形状」由 component-page 那条通用告警说（`test/component-page-entries.test.mts`）。

为什么覆盖挂在**插件选项**里而不是站点 `themeConfig`：`apiFrame.order` 是本层自己的配置，
Docusaurus 把插件选项校验好后原样交给入口工厂，配置期就能算完 —— 这条链不再依赖浏览器侧生成
配置的序列化形状，也不再需要在浏览器里读 `siteConfig.plugins`。那两份清单仍是**原始配置形状**，
四种写法都要认：裸字符串（包名或路径）、`[包名, 选项]`、`[路径, 选项]`、`{name}` 对象
（`siteVersion` 那类归一化元数据是另一格）。

**槽位怎么认层**：那两条判据（`pluginSlotName()` 认形状、`slotIsNamespace()` 认名字与层的对应）
住在解析器包的 `./plugin-slots`，本包里只调 `declaredNamespaces()` + `slotIsNamespace()`。
放在那儿而不是留在这里，是因为各层配置期那句「缺了解析器就当场点名」用的是同一条判据 ——
判据住在解析器包，任何一层都能问这一句，不必先装 `theme-iframe`。所以**不存在**「本层认路径、
三条 API 层只认包名」的不对称：裸包名相等，或路径落在该包的目录段内
（`docusaurus-theme-x` 与去 `docusaurus-` 前缀的 `theme-x` 两种目录段都认，`dist/index.mjs`、
`src/index.mts` 都可以），路径声明的层照样算装机。本站全部按包名声明。

这一格有几道门禁钉着：分支语义（默认、覆盖、过滤、每一条 `warnings`）由
`test/api-frame-contribute.test.mts` 在单测里钉（纯函数，不需要浏览器），判据本身由
`test/plugin-slots.test.mts` 钉；本层入口交出的形状与两条安装前提由
`test/package-entries.test.mts` 钉；页面侧那两条告警与框地址的取法由
`test/api-frame-entries.test.mts` 钉。覆盖率红线盖住 `src/` 与 `lib/` 的每个分支（见
`vitest.config.mts` 的 `coverage.include`，浏览器那两份靠 jsdom，见 `test/frame-sync.test.mts`）。
真实 build 里「四条页真的交到了 component-page 的清单里」由
`tools/scripts/verify-chain.mts` 第 3 节读那份生成模块钉 —— 少了哪一层或交出的形状变了会判红，
而不是静默退化成「什么都没装」。
用例「同一页写两把键时，注册表里排前面的赢」钉这条配置期清单的端到端行为。

新增一条 API 层 = 注册表加一条 + 新包写两份（入口调一次 `createApiFrameTheme()`、框内那一页
`theme/XxxPage` 调一次 `createApiFrameView()`，各家那个渲染用的 UI 组件作为参数交给它），
并把中心声明进新包的 `peerDependencies`（协议变 → 中心升版 → 消费方在安装期被范围拦下，
而不是等构建期工厂抛错）。本站这些包已经发过版（`theme-*` 是 `0.1.0`~`0.1.2`、
`plugin-prev-layer-resolver` 是 `0.2.1`，只有 `plugin-lazy-compilation` 还是 `0.0.0`）：
`workspace:^` 发布时落成 `^<当前版本>`，对 `0.x` 来说就是「小版本锁住」—— 协议一变、中心升到下一个小版本，
消费方在安装期就被范围拦下。只有 `0.0.0` 那份在发版升版之前拦不住任何东西；另外 `workspace:`
协议在非 pnpm 包管理器下的行为未实测。外层一概不动。
两边那两份工厂都拿命名空间去注册表取条目，取不到直接抛 ——
宁可构建期红，不带一条没人注册的路由。

## 那三条消息

命名空间取用它的主题包的包名，三条 `type` 就是 `<包名>/route`、`/ready`、`/mode`：

| 消息          | 方向        | 装的是什么                                                               |
| ------------- | ----------- | ------------------------------------------------------------------------ |
| `route(hash)` | 外层 → 框内 | 外层地址栏里 `#` 那一段，即当前选中了哪条接口                            |
| `ready()`     | 框内 → 外层 | 「框里这份文档起来了，把我要的那两格给我」                               |
| `mode(mode)`  | 外层 → 框内 | 站点当前是亮色还是暗色（`light` / `dark`）                               |
| `route(hash)` | 框内 → 外层 | 框里换了一条接口，报回去让外层改地址栏（走 `createRouteReporter`，见下） |

各用各的命名空间是**必需的**：同一站点上三条层可以同时挂着（本仓就是），共用一份 `type` 的话
一条 `ready` 会被几边同时认下，外层会把 Redoc 那页的地址往 Elements 或 Scalar 的框里送。

收到的数据先过形状再过来源：`isRoute` 只认空串与 `#` 打头的 `hash`，`isMode` 只认那两个取值，
`isTrustedMessage` 要求事件来自预期的那个窗口（外层只收自己那个 iframe，框内只收装载它的父窗口）
且 `origin` 是本站。两边同一个源，所以这套校验防的不是自己，而是「别人往这一页 postMessage」时
不被当成自家消息。

`specUrlFromSearch` 也在这一层：从框内那份文档的地址里取 spec 地址，**只认能解析成 `http:` /
`https:` 的**。`/redoc-view/?src=…` 那种地址是公开的、谁都能手工拼一条，而渲染器拿到的是「去取这个
地址」的指令，本层不替它把非 URL 的东西喂进去。取回来之后还有一步协议归一：页面是 https 时
`http:` 升成 https（见上面「注册表与分发」里那条口径）。

## 对齐是两侧各推一次的

框里那份文档起来时问一句，外层装好监听器时也主动推一次 —— 两条送的是同一份内容。

为什么不只留一条：外层那只监听器要等它自己的 React 挂载跑完才装上，而 iframe 的 `src` 就写在外层
那份服务端渲染的 html 里，浏览器解析到那一格就开始加载框里那份文档。命中缓存时它完全能先于外层的
水合跑完，于是框里问的那句没人接。实测栽过一回：`page.reload()` 之后（跑着 trace、外层脚本被拖慢
时）框里那份文档一条消息都没收到 —— 深链与亮暗模式两段都是死的，而控制台一个字都不报。反过来只守
iframe 的 `load` 事件是同一个坑的另一个方向（那个事件也能先于监听器发生）。两侧各推一次，谁先谁后
都不丢。

外层那一次主动推还有个前提：框里那份文档已经站在同一个源上。还没开始加载时它是 `about:blank`，
那里的 `origin` 是字符串 `null`，消息会被浏览器按目标源丢掉，只白刷一条控制台报错；这一格靠试读
`contentWindow.location.origin` 判断（抛了就当还没起来）。

## 四个方向各走一条路

- **iframe 的 `src` 不带 `hash`**：`frameViewSrc()` 只把 spec 地址编码进去。`src` 因此只由
  frontmatter 决定，服务端与客户端算出同一个字符串，SSR 那份 html 与客户端第一次渲染不会在这一格上
  对不上。亮暗模式同理不塞进地址 —— 它会跟着开关变。
- **外层 → 框内**：`useOuterFrameSync` 送 `route` 与 `mode`，`colorMode` 每次变化都再推一次
  （外层点了亮暗开关，框里不会来问第二次）。
- **框内 → 外层**：**听渲染器自己报**，不听 `hashchange`。三个渲染器（Redoc 的路由、Elements 的路由、
  Scalar 的侧栏）换接口走的都是 `history.pushState`，那个方法**不触发** `hashchange`（它只由改
  `location.hash`、点锚点链接、前进/后退这几条路触发）。实测都是：框里点一条接口，`location.hash`
  变了、渲染器认到了，`hashchange` 一次都没进来。所以这一头由调用方在路由变化时调
  `createRouteReporter()` 造的那个函数（Scalar 那边把它接在自己的 `onSidebarClick` 配置上，
  另两家接在自己的路由器上）。**挂载那一次别报**：那一次报的是初始位置 `#/`，而外层可能正带着一条
  深链，先把外层地址栏那一段擦成 `#/`，紧接着外层补送深链时读到的已经是被擦过的值，深链就丢了
  （`theme-redoc` 与 `theme-stoplight` 两家 `LocationMirror` 里那格 `first` 钉的就是这一条）。
- **外层写地址用 `replaceState`**，不是 `pushState`：框里换一条接口不该在浏览器历史里多出一格，
  否则「后退」变成在同一页的两条接口之间来回走。反过来，前进/后退改的是外层地址，`popstate` 时
  外层把它再送进框里一次，两边才还是同一条接口。

框内收到 `route` 之后做的事是写 `window.location.hash`：这一步触发 `hashchange`，渲染器认不认这一格
是各家的事 —— Redoc 与 Elements 的路由直接按它走；Scalar 只在挂载那一次读地址、另外只听 `popstate`，
所以那一层把 `hashchange` 转成一次 `popstate` 再交给它。换过去之后**整份文档不重新加载**。
换配色也是同理 —— 用例
「框里的配色跟着站点翻过去，那份文档没有重新加载」钉的是那份文档自己的起始时刻
（`performance.timeOrigin`，每加载一份新文档就是另一个数），因为重新加载也能翻对颜色，
但会把渲染器的展开状态和滚动位置一起冲掉。

## 为什么不用框架的那条存储同步

同源的两份文档共享 localStorage，站点的开关写的就是同源那条记录，看着不必自己接。本层不走这条路：
框内那份文档不套 `@theme/Layout/Provider`（它底下六个 provider 里这一页一个都用不上，
`ColorModeProvider` 还依赖站点配置、会往同一份 localStorage 上写）。本层只要「现在是亮还是暗」
一个值，由外层读 `useColorMode()` 送进来。落到框内那一份文档身上时**两家按属性、一家按类名**，
所以 `useInnerFrameSync` 的入参是一个二选一（`modeAttribute` XOR `onMode`）：按属性判亮暗的渲染器
给属性名（Elements 那边是 `data-theme`，Redoc 那边是 `data-redoc-mode`），Scalar 那两个互斥类名
（`dark-mode` / `light-mode`）写在 `<body>` 上、属性名换不动它，就给自己的回调。理由见各包
`docs/internals.md` 的「亮暗模式」一节。一个来源，两边不会打架。

代价要记一句：直接打开 `/redoc-view/?src=…`、`/stoplight-view/?src=…` 或 `/scalar-view/?src=…`
时没有外层送值，那一份文档的模式格是空的（Scalar 那一层落到挂载那一刻读到的那份内联属性上），
也就是亮色。那三条地址本来也不该发给别人。

## 首屏不下载渲染器

三条 API 层的渲染器（Scalar 那一整套 Vue、Redoc + styled-components、Elements + 它的 polyfill）
各带几 MB 依赖。它们**只在框内那一页看起来之前**下载：`theme/XxxPage/index.tsx` 交给工厂的是
`loadView: () => import('../../components/xxx-ui.tsx')` 而不是组件本身，静态 import 一条都留在
本包 `components/` 里。

产物的形状（`pnpm build` 之后按 chunk 依赖图量的；「首屏」= 入口 chunk 的同步依赖闭包 + 主 chunk）：

| 框内页面          | 首屏    | 起来之后按需下载 |
| ----------------- | ------- | ---------------- |
| `/scalar-view`    | 0.39 MB | 3.65 MB          |
| `/redoc-view`     | 0.39 MB | 2.02 MB          |
| `/stoplight-view` | 0.39 MB | 1.82 MB          |

改之前 `/scalar-demo` 那一页首屏是 **4.02 MB**：Scalar 整棵依赖图（97 个 chunk）都挂在路由
chunk 的同步分支上，进这一页就要先下完它们。现在它们跟着 `loadView` 那条 `import()` 走。

Elements 那一份拖了上一轮才拆开：它的模块曾被静态 require 住（入口那句
`import { COLOR_MODE_ATTRIBUTE }`），于是 SplitChunks 把 Elements 主体（1.82 MB）与这份入口并进
同一个 chunk，`import()` 拿到的只是同一个 chunk 里的另一个模块 —— 产物里那是「首屏」不是「按需」。
把那个常量摘到一份不引 Elements 的浅文件之后，入口只剩 0.39 MB，1.82 MB 跟着 `import()` 走。

代价是一条：框里那一下先空着。走的是 effect 里那条 `import()` 而不是 `React.lazy`，所以没有
`Suspense` 兜底可言（`DocItem` 那几层用 `lazy` 是因为它们挂在服务端也要渲染的文档树上；框内这一页
本来就不在服务端渲染）。取不到时只往控制台留一句，这一页的正文留空，不往外抛。

## 尺寸与样式表

**外层那一格共用一份**：`components/api-frame.css` 的 `.api-frame` 给框定高
（`calc(100vh - var(--ifm-navbar-height))`）、`display: block`、去边框，`.container:has(iframe)`
让正文容器去掉内边距与最大宽度，`.main-wrapper:has(.api-frame) + .footer` 收掉站点页脚 ——
四条层的 `<iframe>` 都挂 `.api-frame`，所以这几条只有一处。
把各层重复的那三条 `.container:has(.X-frame)` 收进这一条时核过等价：那一格是 `.container` 自己，
父链上没有别的宽度约束，`max-width: 100%` 与原先那些 `unset` 都落到「铺满」。
各层那个专属类名（`.scalar-frame`……）现在只用来认「这一格是哪一层赢的」：e2e 按它判赢家，
再没有只属于一层的版式规则（页脚那一条以前写在 `theme-stoplight` 自己那份里，另外三条因此漏掉）。

**框内那一格与样式表怎么进来，三家不一样**，留在各包里：

- Redoc 按「整份文档跟着滚动」排版，框内那份文档不能定高；它的样式由 styled-components 在运行期插进
  框内那份文档的 `<head>`，站点那一份 css bundle 里根本没有它。
- Elements 自带内层滚动，框内那一格要定高；它的样式是一张**静态**样式表，Docusaurus 会把每一个 css
  导入都并进全站那一份 bundle，所以本层要改构建配置把那份文件当成资源发出去。
- Scalar 也是静态样式表、也并进全站那一份，所以它同样要改构建配置把那份文件当成资源发出去 ——
  走的是与 Elements 同一份实现（`@show-docs/docusaurus-theme-iframe/lib/isolate-renderer-css.ts`），
  只交自己的文件与探针路径。它出厂时每条规则已经带着 `.scalar-app` 前缀，越不出框内那一格，
  但前缀管的是「打不到站点」，管不了「每页都下载」（实测与代价记在
  [`theme-scalar` 的 docs/internals.md](../../theme-scalar/docs/internals.md) 的「样式」一节）。

还有一条**只在 e2e 里看得见**的约定：`.container:has(iframe)` 是全局的，正文里手写的 `<iframe>`
也会让承载它的容器去掉内边距。所以「这一页正文容器真的为框让位」那一句判据认的是
「包含**主题那个框**的 `.container`」（`test/e2e/steps/common.steps.mts` 里那条 `:has()`），
而不是页面上任意一个 `.container` —— 否则夹具正文里手写的框会让那一句假绿。

三包各自的 `docs/internals.md` 里各有一节写自己那一条。

## 状态：三条层都从这一份走，浏览器里实测过

`pnpm build`、`pnpm verify:chain` 与 `pnpm test:e2e` 都绿。这一层的行为由那三个包的用例间接钉住，
判据分别在 `test/e2e/features/redoc.feature`、
`test/e2e/features/stoplight.feature` 与
`test/e2e/features/scalar.feature`；三条层共用的
那几句（切暗色、做记号、比对翻色前后、容器让位、框占满那一屏）住在
`test/e2e/steps/common.steps.mts`，量框内那份文档的那几个
辅助函数在 `test/e2e/helpers.mts`。

这一族自己那份源码另有单测**直接**钉着（分发、注册表、配置期工厂、消息形状、两条 hook），
每个文件钉哪一面、以及覆盖率红线量哪几份，都记在 `test/README.md`。

## 局限

- **改了它要三条层一起回归**：它的产物出口不存在，三个包直接引源码，所以改动会同时进三条层的
  浏览器 bundle。`lib/` 那十四份文件的每个分支都挂在覆盖率红线上（两条 hook 也在，靠 jsdom 把
  「递交交给浏览器」那一步换成直接点监听器与查 `postMessage`），所以接线方式一改就会红；
  但**真浏览器上那条通道**——跨文档、异步、以及渲染器认不认那一段——只有 `pnpm test:e2e`
  里那十二条用例量得到，而它只在本地跑。
- **它只服务「整页交给一个框」这一种形状**：想把渲染器嵌进 `DocItem` 的正文区（页面上还有别的
  内容），路由与亮暗那两格仍然要跨文档，但外层那一格的尺寸归调用方自己管，这一层不提供。
- 那条通道上没有握手之外的东西：框里那份文档加载失败、超时或 `src` 取不到，外层只会看到一个空框，
  本层不做重试，也不报错给外层。
- 协议没有版本号：`type` 里带的是包名，取值改了要靠两边同时改（都在本仓，同一个提交里）。
