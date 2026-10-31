# 跨 iframe 共享约定（`packages/theme-component-page/` 的 `lib/`、`components/`、`theme/`）

「这一页整页交给一个**同源**框」那一族的全部公共代码。两件事住在这一份里：

1. **那条框内路由与它的两条消息循环** —— 外层那个 `<iframe>`、框内那一份独立文档、两边怎么对齐；
2. **规则的来源与先后** —— 哪几把 frontmatter 键算命中、命中之后交给哪个组件、同一页写中几把时谁赢
   （见下面「规则表」一节）。

`theme-redoc`、`theme-scalar`、`theme-stoplight` 用的是同一套：站点的文档页里只放一个 `<iframe>`
（那一个框由本包 `components/component-frame.tsx` 渲染），框里是本包注册的那一条路由
（`/__component-frame`），渲染器跑在框内那份文档里。地址栏里 `#` 那一段（选中了哪条接口）与站点的
亮暗模式都住在**外层**那份文档，渲染器在**框内**那份文档，两边得靠 postMessage 对齐 —— 这一格
三个包的代码逐字一样，所以抽到这里；各家的**不同**（框内那一格的尺寸、样式表怎么进来、亮暗落到哪个
元素上、渲染器的脾性）留在各包里。外层那一格的尺寸三条层一样，所以也在这份公共代码里
（见「尺寸与样式表」一节）。

各包交回来的只有两样：一个组件、一条规则。它们不再有自己那条路由（旧版那条
`/redoc-view`、`/scalar-view`、`/stoplight-view` 已经删掉），也不再需要一份中心注册表替它们记形状。

本包的 `lib/` **不是**一条主题层目录：里面没有 `theme/`，层栈里看不见它；别的包把它当普通依赖
import（`"@show-docs/docusaurus-theme-component-page": "workspace:^"`，一句一句写全路径，
`@show-docs/docusaurus-theme-component-page/lib/frame-url.ts` 那样 —— `exports` 的 `./lib/*`
直接把源码交给用它的包，没有汇总出口）。

## 组成

| 文件                                 | 编译吗              | 职责                                                                                                                                                              |
| ------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/frame-messages.ts`              | ❌ 站点编译         | 那四条消息的形状与来源判据，加上「这份数据送得进框里吗」那条走到底的检查（`frameDataError()`）；纯函数，不引 React、不引 DOM                                      |
| `lib/frame-sync.tsx`                 | ❌ 站点编译         | 两侧的消息循环：外层的 `useFrameHandshake()`、框内的 `useFrameBridge()`，加上组件用的 `useFrameMode()` / `useFrameHashReporter()` 与来源校验 `isTrustedMessage()` |
| `lib/frame-url.ts`                   | ❌ 站点编译         | 框内那条地址怎么拼（`frameRouteUrl()`，不带查询参数）、一条地址在这一页能不能用（`upgradeUrl()` / `httpUrlOf()`）                                                 |
| `lib/frame-view.tsx`                 | ❌ 站点编译         | 按需取渲染器那两格：`useLazyView()` 与壳组件 `LazyView`（见「首屏不下载渲染器」一节）                                                                             |
| `lib/frame-route.ts`                 | ❌ 站点编译         | 浏览器侧对那条路由名的转出（源码在 `src/frame-route.ts`，两侧读同一份）                                                                                           |
| `src/frame-route.ts`                 | ✅ `src/` → `dist/` | 路由名 `__component-frame` 与 `componentFrameRoutePath(baseUrl)`；配置期（`src/index.mts` 注册路由）与浏览器期共用的唯一一处                                      |
| `components/component-frame.tsx`     | ❌ 站点编译         | 外层那一个 `<iframe>`：算地址、拼数据、跑握手、把「数据送不进去」那句摆出来                                                                                       |
| `components/component-frame.css`     | ❌ 站点编译         | 外层那一格的尺寸，加两条整幅让位（正文容器去内边距、收掉页脚）                                                                                                    |
| `theme/ComponentFramePage/index.tsx` | ❌ 站点编译         | 框内那一份独立文档：按登记名查组件、四种看得见的状态（未拿到数据 / 查不到 / 装载中 / 组件自己抛）                                                                 |
| `theme/DocItem/index.tsx`            | ❌ 站点编译         | 判表那一步：命中就把整个 `DocItem` 换成规则里那个组件，`render: 'page'` 直接铺、`render: 'iframe'` 换成上面那个框                                                 |
| `lib/isolate-renderer-css.ts`        | ❌ 配置期           | 构建期把一张渲染器样式表从全站 bundle 里摘出来当独立文件发（`theme-scalar` 与 `theme-stoplight` 各调一次）                                                        |

「编译吗」那一列的判据是谁编译 —— 口径的产地在仓库根 README 的「构建包的编译口径」。这一族的特别之处
是那条框内路由**不是文档页**：它由本层插件在 `allContentLoaded` 里经 `actions.addRoute` 注册
（`src/index.mts`），产物是 `build/__component-frame/index.html`。

## 规则表：四把键、两把 spec 键、一份先后

一张表有两个来源，在配置期合成（`src/contribute.mts`）：

- **站点自己那一列**：插件选项里的 `components`（登记名 → 模块说明符）与 `rules`。**这一列的顺序就是
  命中优先级**，本站写的是 scalar → redoc → stoplight → iframe（`docusaurus.config.mjs`）。
- **各包交回的那几列**：装着的插件各自在自己的 `loadContent()` 里交回 `{ componentPage }`
  （官方 `allContent` 把各插件的 content 汇到一起，本层在 `allContentLoaded` 里读）。

没被站点那一列提过的默认规则，按**键名的固定字符串顺序**接在后面 —— 与各包在 `plugins` 里的声明先后、
`allContent` 的枚举次序、异步完成的次序都无关。第一条命中的赢；同一页写中几把键时，开发模式会告警说
后面那几把轮不到。

三种臂（`{ key, component, match, source, render, props }`，逐格判据在 `src/config.mts`）：

- 只写一把键名（`'scalar'`）＝ 用那个包交回的那条默认规则，只把它挪到这一列的这个位置；
- 写完整一条 ＝ **覆写**，不继承包那条的任何一格；
- 写 `{ key: 'redoc', enabled: false }` ＝ 只把这一条从表里去掉，别的键照常。

认不出的登记名、重复的站点键、认不出的 `component` / `render` 都在**构建期**红，不等浏览器发现。

**四把键读的是两处事实**：这一页的 frontmatter，和 MDX 模块上的同名命名导出（loader 追加的
`export const …` 落在后一处）。四种判法（`boolean` / `value` / `options` / `any`）与两处读取由表里
那条规则自己声明，本层不认识任何一把业务键。

三条 API 层的键是布尔（`scalar: true` 只说「这一层接这一页」），**渲染哪份文档**另有两把 spec 键给
（`oas3:` 摆 OpenAPI、`aas3:` 摆 AsyncAPI 3，取第一把非空的）。这一层不判断那个地址指向哪份文档 ——
判据在渲染器那边（按文档根上那个 `openapi` / `asyncapi` 字段分派）。两把 spec 键同时写通常是手误，
按先后取第一把并告警。「用哪一层渲染」与「渲染哪份文档」是两件事：写了布尔键却没给 spec 地址，
这一页仍然换成框，框里摆的是那句「这一页没给 X 要渲染的文档」的说明，不是渲染器，也不是空白
（夹具页 `/theme-redoc/docs/redoc-no-spec` 等三条，e2e 钉的就是这一格）。

`iframe:` 那一把在本层之外：它是 `theme-iframe` 交回的组件与规则（`match: 'value'`，值就是框要渲染的
那份页面），嵌的是**外部站点**、跨源，没有这条消息通道。本层不认识它，也不认识 `scalar` / `redoc` /
`stoplight` 那些键。

框内那条地址（`/__component-frame`）**是这一族共用的**，所以它不携带任何页面数据：地址里既没有 `?src=`
也没有登记名，那一份数据由握手从外层送进来（见「那四条消息」）。由此两条推论：

- 「这一格是哪一层赢的」在页面上只能按**框里长出来的那棵渲染根**判，不能按框的类名或地址（e2e 就这么量）；
- 直接打开 `/__component-frame/` 没有外层，那一页停在「还没拿到数据」那一格 —— 那条地址不是拿来分享的，
  能分享给别人的地址始终是文档页自己的那一条。

判定链因此不再需要扫站点清单判「装了没有」：没装的包不会跑 `loadContent()`、自然不交页，那一页于是
落空、交回普通文档页。也没有「站点那一列里写了没装的层」这种配置 —— 认不出的登记名直接构建期红。

这一格有几道门禁钉着：站点那一列的校验与三种臂由 `test/component-page-config.test.mts` 钉；
两列合成与顺序由 `test/component-page-contrib.test.mts` 钉；生成模块的形状由
`test/component-page-registry.test.mts` 钉；各包入口交回的组件与规则由各包的
`test/package-entries.test.mts` 钉；端到端那条「同一页写多把键时站点那一列里排前面的赢」由
`test/e2e/features/frame-precedence.feature` 钉。真实 build 里「那几条规则真的进了生成模块」由
`tools/scripts/verify-chain.mts` 读那份生成模块钉 —— 少了哪一层或交出的形状变了会判红，
而不是静默退化成「什么都没装」。

新增一条 API 层 = 新包写两份：交一个组件（`@theme/XxxView`）与一条 `render: 'iframe'` 的规则，
框、路由、握手、亮暗与深链都不必碰；再把 `@show-docs/docusaurus-theme-component-page` 声明进新包的
`peerDependencies`（协议变 → 本包升版 → 消费方在安装期被范围拦下，而不是等构建期报错）。
`workspace:^` 发布时落成 `^<当前版本>`，对 `0.x` 来说就是「小版本锁住」。

## 那四条消息

一条通道、一套消息名（前缀 `theme-component-page`，见 `lib/frame-messages.ts`）：

| 消息             | 方向        | 装的是什么                                                                |
| ---------------- | ----------- | ------------------------------------------------------------------------- |
| `ready()`        | 框内 → 外层 | 「框里这份文档起来了，把我要的那一份数据给我」                            |
| `init(id, data)` | 外层 → 框内 | 这一页要渲染哪个组件（登记名）与给它的三份数据                            |
| `mode(mode)`     | 外层 → 框内 | 站点当前是亮色还是暗色（`light` / `dark`）                                |
| `hash(hash)`     | 两个方向    | 地址栏里 `#` 那一段：外层送进去是「换到这条接口」，框内报回来是「我换了」 |

不再按包命名空间造三份：旧版那种「每个包自己一条通道」是因为三条层各有一条路由、各认各的地址；
通用框只需要一条，组件由数据里的登记名区分，外层也只认自己那个 iframe 的窗口。

收到的数据先过形状再过来源：`isFrameHash` 只认空串与 `#` 打头的那些，`isFrameMode` 只认那两个取值，
`isFrameInit` 要求 `componentId` 是非空串、`data` 是普通对象；`isTrustedMessage` 要求事件来自预期的那个
窗口（外层只收自己那个 iframe，框内只收装载它的父窗口）且 `origin` 是本站。两边同一个源，所以这套校验
防的不是自己，而是「别人往这一页 postMessage」时不被当成自家消息。同源也不是恶意代码的沙箱：框里跑的
还是本仓编译出来的组件，这一格隔的是「别把渲染器的 DOM、路由与 localStorage 带进文档页」。

## 数据必须是 JSON

`init` 送的那一份是 `{...props, frontMatter, value}`（`frameInitPayload()`）—— 规则里的静态入参、
这一页的整份文件头、命中的那把键写下的值。三格都得跨文档，所以只允许串 / 数 / 布尔 / `null` /
普通对象 / 数组；`render: 'page'` 那一侧还多一格 `content`，那一格是 React 组件，本来就送不出去，
所以 iframe 这一侧没有它。

判据是 `frameDataError()` 走到底，而不是拿 `JSON.stringify` 试一次：那种写法要么让那一格消失
（函数、`undefined`、`Symbol` 在 JSON 里落空），要么把它变成另一种东西（`NaN` 与 `Infinity` 写成
`null`，`Date` 写成串，`Map` / `Set` 写成空对象）。框里那份文档于是渲染出一页「看着对」的组件，而缺的
那一格没人说。这里读的是某一页的 frontmatter，配置期对规则里 `props` 那一格做的是同一件事
（`src/config.mts` 的 `assertPureData()`），只是那时看不到某一页写了什么。

送不出去时外层摆一条看得见的说明（`components/component-frame.tsx`），框仍然挂着但一句数据都不送。

这一格防的是**文档作者自己写歪值**，不是攻击面：那条通道只送 JSON 写得出来的东西，也不是一条能被
外部页面驱动的 RPC —— 框内只能问外层要数据，外层只在握手时送这一页自己的那一份。

## 对齐是两侧各推一次的

框里那份文档起来时问一句（`ready`），外层装好监听器时也主动推一轮 —— 两条送的是同一份内容。

为什么不只留一条：外层那只监听器要等它自己的 React 挂载跑完才装上，而 iframe 的 `src` 就写在外层
那份服务端渲染的 html 里，浏览器解析到那一格就开始加载框里那份文档。命中缓存时它完全能先于外层的
水合跑完，于是框里问的那句没人接。实测栽过一回：`page.reload()` 之后（跑着 trace、外层脚本被拖慢
时）框里那份文档一条消息都没收到 —— 深链与亮暗模式两段都是死的，而控制台一个字都不报。反过来只守
iframe 的 `load` 事件是同一个坑的另一个方向（那个事件也能先于监听器发生）。两侧各推一次，谁先谁后
都不丢。

外层那一次主动推还有个前提：框里那份文档已经站在同一个源上。还没开始加载时它是 `about:blank`，
那里的 `origin` 是字符串 `null`，消息会被浏览器按目标源丢掉，只白刷一条控制台报错；这一格靠试读
`contentWindow.location.origin` 判断（抛了就当还没起来）。

服务端渲染那一遍停在「还没拿到数据」那一格，客户端第一次渲染也算同一格，所以两边不会在挂载那一下
对不上；数据到了之后换的只有框内那份文档。

## 四个方向各走一条路

- **框的地址不带任何页面数据**：`frameRouteUrl()` 只按 `siteConfig.trailingSlash` 定路径末尾那条斜杠
  （`false` 时产物是 `{route}.html`、地址保持无斜杠；其余情况产物是 `{route}/index.html`、地址补上
  尾斜杠）。补这一条是为了**不经过**静态服务器那条「补斜杠」的 301 —— 它的 `Location` 由部署侧生成，
  反向代理后面常写成 `http://`，https 页面上这一跳会被浏览器按混合内容拦掉，框直接空白
  （实测 `open.test.xinxiangsui.com.cn` 上就是这样）。深链那一段与亮暗模式也都不进地址，走消息。
- **外层 → 框内**：`useFrameHandshake()` 送 `init` / `mode` / `hash` 三条，`payload` 或 `colorMode`
  每次变化都再推一轮（外层点了亮暗开关，框里不会来问第二次；外层换了 spec 地址，框里跟着换）。
- **框内 → 外层**：`ready` 换来一轮补送；`hash` **听渲染器自己报**，不听 `hashchange`。三个渲染器
  （Redoc 的路由、Elements 的路由、Scalar 的侧栏）换接口走的都是 `history.pushState`，那个方法
  **不触发** `hashchange`（它只由改 `location.hash`、点锚点链接、前进/后退这几条路触发）。实测都是：
  框里点一条接口，`location.hash` 变了、渲染器认到了，`hashchange` 一次都没进来。所以这一头由调用方
  在路由变化时调 `useFrameHashReporter()` 交回的那一句（Scalar 把它接在自己的 `onSidebarClick` 配置上，
  另两家接在自己的路由器上）。**挂载那一次别报**：那一次报的是初始位置 `#/`，而外层可能正带着一条深链，
  先把外层地址栏那一段擦成 `#/`，紧接着外层补送深链时读到的已经是被擦过的值，深链就丢了
  （三条层的 `LocationMirror` 里那格 `first` 钉的就是这一条）。
- **外层写地址用 `replaceState`**，不是 `pushState`：框里换一条接口不该在浏览器历史里多出一格，
  否则「后退」变成在同一页的两条接口之间来回走。反过来，前进/后退改的是外层地址，`popstate` 时
  外层把它再送进框里一次，两边才还是同一条接口。

框内收到 `hash` 之后做的事是写 `window.location.hash`：这一步触发 `hashchange`，渲染器认不认这一格
是各家的事 —— Redoc 与 Elements 的路由直接按它走；Scalar 只在挂载那一次读地址、另外只听 `popstate`，
所以那一层把 `hashchange` 转成一次 `popstate` 再交给它。换过去之后**整份文档不重新加载**。
换配色也是同理 —— 用例「框里的配色跟着站点翻过去，那份文档没有重新加载」钉的是那份文档自己的起始时刻
（`performance.timeOrigin`，每加载一份新文档就是另一个数），因为重新加载也能翻对颜色，
但会把渲染器的展开状态和滚动位置一起冲掉。

## 为什么不用框架的那条存储同步

同源的两份文档共享 localStorage，看着不必自己接。本层不走这条路：框内那份文档不套
`@theme/Layout/Provider`（它底下六个 provider 里这一页一个都用不上，`ColorModeProvider` 还依赖站点
配置、会往同一份 localStorage 上写）。本层只要「现在是亮还是暗」一个值，由外层读 `useColorMode()`
送进来，组件用 `useFrameMode(apply)` 落到这一份文档上。落到哪一格**三家不一样**，所以机制层只给
「什么时候落」，不给「落成什么」：Redoc 与 Elements 按 `<html>` 上一条属性判（把它们那份暗色表的
生效条件换到这条属性上），Scalar 换的是 `<body>` 上互斥的两个类名（`dark-mode` / `light-mode`，
属性名换不动它）。那两格都由调用方写成 `apply` 交进来。一个来源，两边不会打架。

代价要记一句：直接打开 `/__component-frame/` 时没有外层送值，那一页停在「还没拿到数据」那一格，
连组件都不渲染。那三条旧的 `/{layer}-view/?src=…` 地址已经不存在了。

## 首屏不下载渲染器

三条 API 层的渲染器（Scalar 那一整套 Vue、Redoc + styled-components、Elements + 它的 polyfill）
各带几 MB 依赖。它们**只在框内那一页看起来之前**下载：各包那个 `@theme/XxxView` 组件交给
`LazyView` 的是 `loadView: () => import('../../components/xxx-ui.tsx')` 而不是组件本身，静态
`import` 一条都不留在会被框内文档同步引到的模块里（口径见 `lib/frame-view.tsx`）。

产物形状的原理没变，变的是路由：三条层现在共用 `/__component-frame` 这一份 html，各自的渲染器
仍然只在取到自己那一格时才下载 —— 因为按需那条 `import()` 在各包的组件里，不在共用的那份文档里。

代价是一条：框里那一下先空着。走的是 effect 里那条 `import()` 而不是 `React.lazy`，所以没有
`Suspense` 兜底可言（`DocItem` 那几层用 `lazy` 是因为它们挂在服务端也要渲染的文档树上；框内这一页
本来就不在服务端渲染）。取不到时在框里摆一条「这一页的渲染器装载失败」的说明，不往外抛。

## 尺寸与样式表

**外层那一格共用一份**：`components/component-frame.css` 的 `.component-frame` 给框定高
（`calc(100vh - var(--ifm-navbar-height))`）、`display: block`、去边框，`.container:has(iframe)`
让正文容器去掉内边距与最大宽度，`.main-wrapper:has(.component-frame) + .footer` 收掉站点页脚 ——
三条 API 层的 `<iframe>` 都挂同一个类名，所以这几条只有一处。
`.container:has(iframe)` 是全局的，正文里手写的 `<iframe>` 也会让承载它的容器去掉内边距；这是它本来就
声明的全站边界，不是疏漏。页脚那一条认 `.component-frame` 而不认裸 `iframe`：正文里手写的框不该顺带
把整站页脚收掉。

`theme-iframe` 那个外部框（`iframe:` 那一把）是 `render: 'page'` 的普通组件，那份 CSS 不能假设已经在
页上，所以它自己那份 `components/external-frame.css` 里同文写着这三条（同时命中也只生效一次）。

**框内那一格与样式表怎么进来，三家不一样**，留在各包里：

- Redoc 按「整份文档跟着滚动」排版，框内那份文档不能定高；它的样式由 styled-components 在运行期插进
  框内那份文档的 `<head>`，站点那一份 css bundle 里根本没有它。
- Elements 自带内层滚动，框内那一格要定高；它的样式是一张**静态**样式表，Docusaurus 会把每一个 css
  导入都并进全站那一份 bundle，所以本层要改构建配置把那份文件当成资源发出去。
- Scalar 也是静态样式表、也并进全站那一份，所以它同样要改构建配置把那份文件当成资源发出去 ——
  走的是与 Elements 同一份实现（`@show-docs/docusaurus-theme-component-page/lib/isolate-renderer-css.ts`），
  只交自己的文件与探针路径。它出厂时每条规则已经带着 `.scalar-app` 前缀，越不出框内那一格，
  但前缀管的是「打不到站点」，管不了「每页都下载」（实测与代价记在
  [`theme-scalar` 的 docs/internals.md](../../theme-scalar/docs/internals.md) 的「样式」一节）。

还有一条**只在 e2e 里看得见**的约定：「这一页正文容器真的为框让位」那一句判据认的是
「包含**主题那个框**的 `.container`」（`test/e2e/steps/common.steps.mts` 里那条 `:has()`），
而不是页面上任意一个 `.container` —— 否则夹具正文里手写的框会让那一句假绿。

三包各自的 `docs/internals.md` 里各有一节写自己那一条。

## 状态：三条层都从这一份走，浏览器里实测过

`pnpm build`、`pnpm verify:chain` 与 `pnpm test:e2e` 都绿。这一族的行为由那三个包的用例间接钉住，
判据分别在 `test/e2e/features/redoc.feature`、`test/e2e/features/stoplight.feature` 与
`test/e2e/features/scalar.feature`（AsyncAPI 那一族在 `test/e2e/features/asyncapi.feature`）；
三条层共用的那几句（切暗色、做记号、比对翻色前后、容器让位、框占满那一屏）住在
`test/e2e/steps/common.steps.mts`，量框内那份文档的那几个辅助函数在 `test/e2e/helpers.mts`。
本层自己的那一条（站点配置的组件接管一页、以及直接打开框内路由）在
`test/e2e/features/component-page.feature`。

这一族自己那份源码另有单测**直接**钉着（消息形状、两条循环、地址、按需装载、规则表合成），
每个文件钉哪一面、以及覆盖率红线量哪几份，都记在 `test/README.md`。

## 局限

- **改了它要三条层一起回归**：这一族的浏览器侧文件是源码出口，三个包直接引源码，所以改动会同时进
  三条层的浏览器 bundle。`lib/` 与 `components/` 的每个分支都挂在覆盖率红线上（两条循环也在，靠
  jsdom 把「递交交给浏览器」那一步换成直接点监听器与查 `postMessage`），所以接线方式一改就会红；
  但**真浏览器上那条通道**——跨文档、异步、以及渲染器认不认那一段——只有 `pnpm test:e2e`
  里那十几条用例量得到，而它只在本地跑。
- **它只服务「整页交给一个框」这一种形状**：想把渲染器嵌进 `DocItem` 的正文区（页面上还有别的
  内容），路由与亮暗那两格仍然要跨文档，但外层那一格的尺寸归调用方自己管，本层不提供。
- 那条通道上没有握手之外的东西：框里那份文档加载失败或超时，外层只会看到一个空框，
  本层不做重试，也不报错给外层。
- 那条通道不是 RPC：四条消息之外没有请求/应答的形状，组件要更多能力就该在这里点名加一条，
  而不是攒出一个协议。
- 协议没有版本号：`type` 里带的是本包的包名，取值改了要靠两边同时改（都在本仓，同一个提交里）。
