# 跨 iframe 共享约定（`theme/theme-iframe/lib/`）

共享层，两件事住在这一份 `lib/` 里：

1. **「整页交给一个框」这一族的注册表、分发与配置期工厂** —— 判哪几把 frontmatter 键、框的地址
   怎么拼、框内那条路由注册在哪，都由这一份给出（见下面「注册表与分发」一节）；
2. **两侧要说的那几句话** —— iframe 地址、三条 postMessage 的形状与两侧的消息循环。

源码住在 [`theme-iframe`](../README.md) 包的 `lib/` 里，
`exports` 用 `./lib/*` 直接把源码交给用它的包。

[`theme-redoc`](../../theme-redoc/README.md)、[`theme-stoplight`](../../theme-stoplight/README.md) 与
[`theme-scalar`](../../theme-scalar/README.md) 用的是同一套：站点的文档页里只放一个 `<iframe>`（那一个框由
本包 `components/api-frame.tsx` 渲染），框里是那个包自己注册的一条页面（`/redoc-view`、`/stoplight-view`、
`/scalar-view`），渲染器跑在框里那份文档内。地址栏里 `#` 那一段（选中了哪条接口）与站点的亮暗模式都住在**外层**那份文档，
渲染器在**框内**那份文档，两边得靠 postMessage 对齐 —— 这一格三个包的代码逐字一样，所以抽到这里，
各家的**不同**（尺寸、样式表怎么进来、亮暗落到哪个元素上、渲染器的脾性）留在各包里。

这一份 `lib/` **不是**一条主题层目录：里面没有 `theme/`，层栈里看不见它。它有两种被用的方式：
三个 API 包把它当普通依赖 import（`"@show-docs/docusaurus-theme-iframe": "workspace:^"`，写在
`peerDependencies` —— 那份版本契约见下面「注册表与分发」末了；浏览器侧 import 写
`@show-docs/docusaurus-theme-iframe/lib/index.ts`）；配置期那份工厂（`api-frame-theme.mts`）
由各包入口按全 specifier 引。同包的 `theme/DocItem` 与 `components/api-frame.tsx`
（frontmatter `iframe:` 那一层的外壳）**用的就是这一份注册表** —— 四把键由那一份 `DocItem`
按注册表**与站点插件选项**判（`api-frame-entries.ts`）；`iframe:` 那条嵌的是**外部站点**，跨源，
注册表里是一条 `external` 条目，没有这条消息通道。

## 组成

| 文件                        | 编译吗      | 职责                                                                                                                                                                                                                                             |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/index.ts`              | ❌ 站点编译 | 浏览器侧出口，把下面几份再导出去一次；**不含** `api-frame-theme.mts`（那份引 `node:path`，进不了浏览器 bundle）                                                                                                                                  |
| `lib/api-frame-registry.ts` | ❌ 站点编译 | 注册表：四条形同的条目（命名空间、frontmatter 键、类名、路由名……），纯数据、零 import，配置期与浏览器期引同一份                                                                                                                                  |
| `lib/api-frame-entries.ts`  | ❌ 站点编译 | 判定清单的分发 `resolveFrameDistribution(plugins, frontMatter)`：装了的层参与判定，注册表顺序为默认，插件选项 `themeConfig.apiFrame.order` 可覆盖顺序与子集；落空原因进 `warnings`，开发模式由 `DocItem` 打出；纯函数，单测与 `DocItem` 引同一份 |
| `lib/api-frame-messages.ts` | ❌ 站点编译 | 按命名空间造那三条消息的名字，带缓存（同一命名空间每次拿到同一个对象）                                                                                                                                                                           |
| `lib/api-frame-theme.mts`   | ❌ 配置期   | 入口工厂：三条 API 层的 `src/index.mts` 调它拿 Plugin 形状（挂层目录、注册框内路由、接各自的 webpack 差异）；`.mts` 按上游 lint preset 标 Node 环境                                                                                              |
| `lib/frame-messages.ts`     | ❌ 站点编译 | 约定与形状：iframe 地址怎么拼、三条消息怎么造怎么认、`src` 里那段 spec 怎么取（**纯函数，不引 React、不引 DOM**）                                                                                                                                |
| `lib/frame-trust.ts`        | ❌ 站点编译 | 来源校验 `isTrustedMessage`：它引 DOM 类型，单独一份，免得注册表那条配置期链路上碰到 `Window`                                                                                                                                                    |
| `lib/frame-sync.ts`         | ❌ 站点编译 | 两侧的消息循环：`useOuterFrameSync`（外层那份文档里）、`useInnerFrameSync` 与 `createRouteReporter`（框内那份文档里）                                                                                                                            |

「编译吗」那一列的判据是谁编译 —— 口径的产地在仓库根 README 的「构建包的编译口径」。这一格的特别之处
是**没有编译产物**：本包的构建项目（`tsconfig.build.json`）只收 `src/`，`lib/` 不进 `tsc`，
`exports` 的 `./lib/*` 直接把源码交给用它的包 —— 浏览器那几份只在浏览器里跑；唯一的例外
`api-frame-theme.mts` 跑在**配置期**（Docusaurus 的 jiti 直接吃这份源码），那一条链从
`theme-*/src/index.mts`（经 `tsc` 的产物）跨到这份源码，两侧编译器不同、文件同一份。

## 注册表与分发：四条键、一份默认顺序

`lib/api-frame-registry.ts` 是这一族唯一的**形状**来源。每个条目两种 `kind`：

- `internal`（scalar / redoc / stoplight）：命名空间、frontmatter 键（`scalar:` / `redoc:` /
  `oas3:`）、框内页面的路由名（`scalar-view`……）、spec 参数的查询名（`src`）、`@theme/` 页面别名、
  外层 `<iframe>` 的类名（`.scalar-frame`……）与 `title`（**兜底值**：页面写了 `frontMatter.title`
  时优先用页面自己的，`ApiFrame` 那一步）。框里是本包那条插件页面，同源，
  深链与亮暗靠消息循环对齐。
- `external`（`iframe:`）：只有命名空间、键、类名与 `title` —— 框里是外部站点，地址算法归
  `components/api-frame.tsx` 里那两步（`/` 打头补 origin、`?path=` 再解一层；曾经还有
  「整串 `decodeURIComponent`」的第三步，会把地址里合法的 `%` 序列二次解码，删了）。

**条目的排列顺序是判定优先级的默认值**，但决定权在站点，分发在 `lib/api-frame-entries.ts`
（`resolveFrameDistribution(siteConfig.plugins, frontMatter)`，交出 `{ entries, warnings }`）。
规则**只有一条**：参与判定的层 = 装了的层（`plugins` 里有其包名的那一项）；站点可在本层那一项的
插件选项 `['@show-docs/docusaurus-theme-iframe', { themeConfig: { apiFrame: { order: [...] } } }]`
里用命名空间数组覆盖参与判定的**顺序与子集**。覆盖不放宽装机过滤 —— 列了没装的层照样不判，
否则「框指向不存在路由」这个失败模式会在覆盖下被重新引入。两个推论：

- 没装的层不再像以前那样照样命中、渲染出一个指向不存在路由的框（浏览器里 `…-view` 回 404
  一片空白），而是那一格落空，交回普通文档页。实测：注释掉 `plugins` 里 scalar 那一条重建，
  `build/scalar-demo/index.html` 里 `<iframe>` 数从 1 变 0，写了四把键的夹具页换成 redoc 框。
- 落空从「坏框」（肉眼可见）变成「页面看起来正常但键没生效」（看不见），所以分发把每一次落空
  的原因收进 `warnings`（键写了但层没装 / 被覆盖清单排除 / 覆盖里写了注册表认不出的命名空间 /
  覆盖挂在认不出是本层的槽位上），`DocItem` 在**开发模式**用 `console.warn` 打出来；构建产物不打，
  那种页面对读者没有可修的东西。

为什么覆盖挂在**插件选项**而不是站点 `themeConfig`：实测浏览器侧那份 `themeConfig`
（`pnpm build` 后 `.docusaurus/docusaurus.config.mjs` 的顶层那格）只来自官方 merge，而 merge
只收 `themes` 注册表 —— 本层注册在 `plugins` 里，插件选项进不了那格。原始 `plugins` 是选项
唯一到得了浏览器侧的位置；它的每一项是**原始配置形状**，四种写法都要认：裸字符串（包名或路径）、
`[包名, 选项]`、`[路径, 选项]`、`{name}` 对象（`siteVersion` 那类归一化元数据是另一格）。
按路径声明本层时按**包目录**认（`/theme-iframe/` 或 `/docusaurus-theme-iframe/` 这一段路径），
不钉具体入口文件名（`dist/index.mjs`、`src/index.mts` 都算）；本站按包名声明。

这一格有两道门禁钉着：分支语义（默认、覆盖、过滤、每一条 `warnings`）由
`test/api-frame-entries.test.mts` 在单测里钉（纯函数，不需要浏览器）；而「浏览器侧 `plugins`
原样保留包名、插件选项到得了浏览器」是 Docusaurus 的**实现细节而非公开承诺**，由
`demo/scripts/verify-chain.mts` 第 3 节对真实生成的 `.docusaurus/docusaurus.config.mjs` 钉 ——
升级后序列化形状变了会判红，而不是静默退化成「什么都没装」。
用例「同一页写两把键时，注册表里排前面的赢」钉默认分发的端到端行为。

新增一条 API 层 = 注册表加一条 + 新包写两份（入口调一次 `createApiFrameTheme()`、框内一份 view），
并把中心声明进新包的 `peerDependencies`（协议变 → 中心升版 → 消费方在安装期被范围拦下，
而不是等构建期工厂抛错）。现阶段本站所有包版本都是 `0.0.0`，这份契约**拦不住任何东西**，
是为发版升版之后预留的；另外 `workspace:` 协议在非 pnpm 包管理器下的行为未实测。外层一概不动。
工厂拿命名空间去注册表取条目，取不到直接抛 ——
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
`https:` 的**。`/redoc-view?src=…` 那种地址是公开的、谁都能手工拼一条，而渲染器拿到的是「去取这个
地址」的指令，本层不替它把非 URL 的东西喂进去。

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
  另两家接在自己的路由器上）。
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
（`dark-mode` / `light-mode`）写在 `<body>` 上、属性名换不动它，就给自己的回调。理由见各层 README
的「亮暗模式」一节。一个来源，两边不会打架。

代价要记一句：直接打开 `/redoc-view?src=…`、`/stoplight-view?src=…` 或 `/scalar-view?src=…`
时没有外层送值，那一份文档的模式格是空的（Scalar 那一层落到挂载那一刻读到的那份内联属性上），
也就是亮色。那三条地址本来也不该发给别人。

## 尺寸与样式表不在这里

iframe 那一格的 CSS（定高、正文容器让位、页脚收不收、站点的侧栏让不让位）与渲染器自己那份样式表
怎么进来，**三家不一样**，所以都留在各包里：

- Redoc 按「整份文档跟着滚动」排版，框内那份文档不能定高；它的样式由 styled-components 在运行期插进
  框内那份文档的 `<head>`，站点那一份 css bundle 里根本没有它。
- Elements 自带内层滚动，框内那一格要定高；它的样式是一张**静态**样式表，Docusaurus 会把每一个 css
  导入都并进全站那一份 bundle，所以本层要改构建配置把那份文件当成资源发出去。
- Scalar 也是静态样式表、也并进全站那一份，但这一层**不改构建配置**：它出厂时每条规则已经带着
  `.scalar-app` 前缀，越不出那一格（实测与代价记在
  [`theme-scalar` 的 README](../../theme-scalar/README.md) 的「样式」一节）。

三包的 README 各有一节写自己那一条。

## 状态：三条层都从这一份走，浏览器里实测过

`pnpm build`、`pnpm verify:chain` 与 `pnpm test:e2e` 都绿。这一层的行为由那三个包的用例间接钉住，
判据分别在 [`test/e2e/features/redoc.feature`](../../test/e2e/features/redoc.feature)、
[`test/e2e/features/stoplight.feature`](../../test/e2e/features/stoplight.feature) 与
[`test/e2e/features/scalar.feature`](../../test/e2e/features/scalar.feature)；三条层共用的
那几句（切暗色、做记号、比对翻色前后、容器让位、框占满那一屏）住在
[`test/e2e/steps/common.steps.mts`](../../test/e2e/steps/common.steps.mts)，量框内那份文档的那几个
辅助函数在 [`test/e2e/helpers.mts`](../../test/e2e/helpers.mts)。

## 局限

- **改了它要三条层一起回归**：它的产物出口不存在，三个包直接引源码，所以改动会同时进三条层的
  浏览器 bundle。单测不覆盖这一层（`pnpm test` 只测 `plugin-prev-layer-resolver`），拦它的是
  `pnpm test:e2e` 里那十二条用例，只在本地跑。
- **它只服务「整页交给一个框」这一种形状**：想把渲染器嵌进 `DocItem` 的正文区（页面上还有别的
  内容），路由与亮暗那两格仍然要跨文档，但外层那一格的尺寸归调用方自己管，这一层不提供。
- 那条通道上没有握手之外的东西：框里那份文档加载失败、超时或 `src` 取不到，外层只会看到一个空框，
  本层不做重试，也不报错给外层。
- 协议没有版本号：`type` 里带的是包名，取值改了要靠两边同时改（都在本仓，同一个提交里）。
