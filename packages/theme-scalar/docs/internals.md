# theme-scalar 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、样式与亮暗这两格在 Scalar 这一层怎么做到的、
收掉的那几处各自的判据、各处实测到的数字与取值。使用者要看的（怎么触发、能分享的地址长什么样、
有哪些局限）在 [`README.md`](../README.md)，这里不重复。

源码注释里那些「理由见包 README『…』一节」的指针，落在本节这些章节上的已经改指这份文件。

## 组成

| 文件                              | 编译吗              | 职责                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                   | ✅ `src/` → `dist/` | 入口：`loadContent()` 交回**一份组件与一条规则**（`{ id: 'scalar', component: '@theme/ScalarView' }` 与 `{ key: 'scalar', match: 'boolean', component: 'scalar', render: 'iframe' }`）、层目录；本包的 webpack 差异有**两件** —— 把 Scalar 那份静态样式表摘成独立产物（`isolateRendererCss`，见「样式」一节）与按住 Scalar 那条动态 `import` 的构建告警（`configureWebpack` 里的 `ignoreWarnings`，见「随这一层多出来的构建告警」） |
| `theme/ScalarView/index.tsx`      | ❌ 站点编译         | **框内**那一格里 Scalar 那一份：挑地址、把亮暗落到 `<body>` 那两个类名上、按需取渲染接线（`LazyView`）、报回 `#` 段；「这一页归谁」不在这里判                                                                                                                                                                                                                                                                                       |
| `components/scalar-spec.ts`       | ❌ 站点编译         | `oas3:` / `aas3:` 两把键的读法与先后（只本层认识它们），以及两把都写时那句开发期说明                                                                                                                                                                                                                                                                                                                                                |
| `components/scalar-ui.tsx`        | ❌ 站点编译         | 浏览器端 `createApiReference(元素, 配置)` 挂上去，卸载时 `destroy()`；两头的地址各走一条路（框内 → 外层听 `onSidebarClick`，外层 → 框内把 `hashchange` 转成 `popstate`）；那条 `<link>` 挂 Scalar 的样式表                                                                                                                                                                                                                          |
| `components/scalar-color-mode.ts` | ❌ 站点编译         | 亮暗落地的两个小函数：挂载那一刻交给 Scalar 的布尔、收到外层送的值就换 `<body>` 上那两个类名                                                                                                                                                                                                                                                                                                                                        |
| `components/scalar-ui.css`        | ❌ 站点编译         | 生效在框内那一页：收掉 Scalar 送出来的那条署名与推广位（厂商配置里没有这一格；为什么每条都要 `!important`，见「样式」一节）                                                                                                                                                                                                                                                                                                         |
| `tsconfig.build.json`             | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                                                                                                                                                                                                                                                                                                                                                              |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

**外层那一格与跨 iframe 的那一套都不在本包**：套壳、那条通用框内路由、四条消息的形状、来源校验、
两侧的监听全在 `@show-docs/docusaurus-theme-component-page`（`components/component-frame.tsx` 与
`lib/frame-*.ts(x)`，口径见
[`iframe-protocol.md`](../../theme-component-page/docs/iframe-protocol.md)）。本包交出的只有那份组件与
那条规则，以及「值送到框内之后落到哪个元素上」这一格回调。为什么两侧各推一次消息、为什么框内 →
外层不听 `hashchange`、为什么外层写地址用替换而不是新增，那几条理由记在机制层的文档，
这里不抄第二遍。

卸载 `@show-docs/docusaurus-theme-iframe` 对本层没有影响：本包不依赖它，那条同源框由机制层自己给出。

## 为什么要换一份文档

Scalar 那份组件在自己渲染时会往 `<body>` 上写类名（亮暗那两个）、按 `location` 自己走 hash 路由、
用 `localStorage` 存它自己的选择，还会 `document.querySelector` 找元素。这些动作在站点自己的文档页
里做，就是「两份文档的 `<body>`、两份路由、两份存储混用一格」。iframe 的边界是浏览器给的：框里那份
文档里的类名、路由、localStorage 与 DOM，站点的文档页一行都碰不到。

**这一格边界对 DOM、路由与存储都成立** —— 它引的那份静态样式表在构建期被摘成独立产物，
只由框内那份文档挂一条 `<link>`，不进全站那一份（见「样式」一节）。换文档要解决的是前面那一串
「按整份文档来用」的动作；样式那一格另有防线，代价与实测都记在「样式」一节。

### 两份文档各管什么

|                 | 外层：站点的文档页（`/theme-scalar/docs/scalar-demo`）                       | 框内：那条通用框内页面（`/__component-frame/`）                                |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 本层放的东西    | 一个 `<iframe class="component-frame" title="页面标题">`（机制层的通用套壳） | `ScalarUI` 挂的那一格，根是 Scalar 自己的 `.scalar-app.scalar-api-reference`   |
| 那一格渲染什么  | 只有框，没有正文外壳                                                         | 按 `init` 消息里的登记名（`scalar`）选出来的 `@theme/ScalarView`               |
| Scalar 的运行时 | 不加载，一行都没有（`.scalar-app` 0 个）                                     | 全在这里（实测那一份文档里 `.scalar-app` 3 格，布局根只有 1 格）               |
| 样式表          | 全站那一份 css（**不再含 Scalar 那份**）                                     | 全站那一份 + 一条 `<link>` 指向 Scalar 那份（单独一个产物，实测 277,962 字节） |
| 亮暗模式        | 站点的 `<html data-theme>`，开关在这                                         | 自己 `<body>` 上的 `dark-mode` / `light-mode`，值由外层送来                    |
| 要渲染哪份文档  | 不决定：那一页的 frontmatter 整份送进框内                                    | 由 `components/scalar-spec.ts` 从 frontmatter 里挑                             |

## 框内那一页是哪一条路由

`/__component-frame/` 是 `theme-component-page` 用 `actions.addRoute()` 注册的一条插件路由
（`exact: true`，组件 `@theme/ComponentFramePage`），**三条 `render: 'iframe'` 的层共用这一条**：
本包不注册路由，也没有属于自己的那份框内页面（旧的 `/scalar-view` 随组件自注册那一步一起删了）。
框里渲染哪一个组件由外层那条 `init` 消息里的**登记名**决定。

地址里**不带查询参数**：要渲染哪份文档写在送进去的那份 frontmatter 里，所以这个 `src` 只跟站点走，
服务端与客户端算出完全一样的字符串（尾斜杠跟着 `siteConfig.trailingSlash`，理由记在机制层的
`lib/frame-url.ts`）。产物里真的有一份 `build/__component-frame/index.html`（2,215 字节，里面只有
那句「正在从这一页的文档里取数据…」），所以 `pnpm serve` 对它回 200 —— 但它单独打开时收不到 `init`，
Scalar 那一格也就不会挂载。

## 同源，但每条消息仍然校验

框里那一页与外层同一个源，这套校验防的不是自己 —— 判据、`isTrustedMessage` 与「同源不是沙箱」那
两句都记在机制层的
[`iframe-protocol.md`](../../theme-component-page/docs/iframe-protocol.md)「那四条消息」一节，本层不抄第二遍。
本层只多这一格：要渲染的那份文档由 `components/scalar-spec.ts` 从 `oas3:` / `aas3:` 两把键里挑，
挑出来的地址交给机制层那条 `httpUrlOf` 判协议。

## 样式：那份表只在框内那一页

这一节的结论分两段，前一段是本层与 `theme-redoc` 的分野，后一段是它从「全站都在」改成「只有框内有」
的那一步。

**第一段：Scalar 出厂自带作用域前缀，改不到站点的任何一处。**它那份 Tailwind 编译产物里 1330 条规则
的选择器都带 `.scalar-app:not(#\#):not(#\#):not(#\#):not(#\#)` 前缀（`important: '.scalar-app'`
那格配置），剩下 1116 条不带前缀的，认的全是它自己的类名（`[data-v-…]` 那种 Vue 作用域类、
`.scalar-code-block …`、`.dark-mode` / `.light-mode`）或只是注册自定义属性（`--tw-*`、`--scalar-*`）。
`.scalar-app` 那一格在框内那份文档里（实测 3 格），外层 0 格 —— 于是那些规则在站点页面上没有可命中
的元素。

这一句不是推理，是**对照量出来的**：把那一行 import 注掉重新构建，与注回来之后，在 `/`、
`/theme-redoc/docs/redoc-demo`、`/theme-markmap/docs/markmap-demo` 三份页面上取同一批
31 个站点选择器 × 16 条 computed 属性比 —— **只有 `--tw-shadow` 这一处不一样**（引上那份表之后
`<html>` 上是 `0 0 transparent`，去掉是空串），其余一字不差。那一处是 Tailwind 4 在 `@supports` 里给
`*, :before, :after` 注册的自定义属性默认值，没有哪条站点规则读 `--tw-*`。

**第二段：前缀让样式打不到站点，但拦不住它被每页下载。**这条 import 是静态的，webpack 会把它并进
全站那一份 `assets/css/styles.<hash>.css`，于是每一页都带着它 —— 曾经净增 359 KB（同一份产物的两次
构建对照：去掉那一行 82,841 字节，引上 441,957 字节）。现在这一份由 `src/index.mts` 在构建期摘成独立
产物，与 `theme-stoplight` 用同一份实现
（`@show-docs/docusaurus-theme-component-page/lib/isolate-renderer-css.ts`，两处踩过的坑记在
`theme-stoplight` 的维护者文档「样式」一节），只由框内那份文档挂一条 `<link>`。

于是本层要交两格：哪一份文件、拿哪个假路径去试官方那条 `.css` 规则。**文件那一条认的是解析后的真实
路径**：`@scalar/api-reference/style.css` 是 `exports` 里的一条映射，落在 `dist/style.css` —— 认包根
那条路径会一条都匹配不上（实测：规则插进去了，`.scalar-app` 在 `styles.css` 里一处没少）。

实测产物（`pnpm build` 之后）：

| 产物                                 | 字节    | 内容                                                                     |
| ------------------------------------ | ------- | ------------------------------------------------------------------------ |
| `build/assets/css/styles.<hash>.css` | 113,707 | 站点那一份：`.scalar-app` 只剩 1 处，是本包 `scalar-ui.css` 自己写的那条 |
| `build/assets/css/style.<hash>.css`  | 277,962 | Scalar 那一份：只在框内那份文档里被 `<link>`                             |

先前记的 108K / 236K 是**换压缩器之前**量的 —— 站点那格现在用 lightningcss（见仓库根
`docusaurus.config.mjs` 那条），厂商那份表又从 1.75.0 升到 1.76.0，两处都动过，数字是重新量的。
站点那一份里 `.scalar-app` 从 3 处掉到 1 处：被摘掉的那条规则本身带两个选择器
（`.generate-sdk-button` 与 `.selected-client-action`），每个都写一遍 `.scalar-app.scalar-api-reference`
（1.76.0 起那颗由厂商自己收，见「收掉的几处」一节）。

先前那份表并进全站那一份时，构建里会跟着几条 Css Minimizer 的告警（`postcss-calc` 算不动
`(50 - l) * infinity`、`@container` 那段嵌套被 clean-css 吃掉一条规则）；换压缩器之后都不冒了，
来龙去脉记在「随这一层多出来的构建告警」一节与仓库根 `docusaurus.config.mjs` 的那条注释里。

因为规则带着 `:not(#\#)` 那四段 ID 级权重，**本层想覆盖它就得写 `!important`**。实测：不带
`!important` 的同一条规则注进页面也不生效（`scalar-ui.css` 里那条署名那一格量过一次 ——
不带时收不掉，加上才归零）。
前缀用 `.scalar-app.scalar-api-reference` 这两格类名而不是裸的 `.scalar-app`：框内那份文档里
`.scalar-app` 有 3 格，只带 `scalar-api-reference` 的那一颗是布局根（实测 1 格，`aside`、左栏链接
与正文都在它下面），另外两格是厂商给自己那几格弹层与提示造的（实测其中一格带 `scalar-tooltip`）。

判据两句，都在 `test/e2e/features/scalar.feature` 第一条用例里：「外层文档里没有 Scalar 的
痕迹」（`.scalar-app` 0 个、Scalar 渲染出来的文字也不在外层）与「站点自己的
那几处样式不被 Scalar 改写」（同一批元素在 scalar 页与主页各算一遍 computed style 比相等，不抄
站点该有的值）。后一句按值比，防的是**站点这一侧**哪天直接引了一份 Scalar 的表。

## 亮暗模式：配色跟站点的开关走

Scalar 自带一套亮暗：判据依次是 `localStorage` 里的 `colorMode` → 配置里的 `darkMode` →
操作系统偏好，结果落成 `<body>` 上**两个互斥的类名**（`dark-mode` / `light-mode`），
`@scalar/themes` 每张调色板都按这两个类各发一组变量。实测这一层的信号就是 `<body>` 上
`--scalar-background-1`，站点亮色时 `#fff`、暗色时 `#0f0f0f`。

站点自己也有开关（外层 `<html data-theme>`），两处各判各的就会打架。本层的做法：

- **挂载那一刻**交给它一个明确的布尔（`isDarkColorModeAtLoad()`，读本份文档 `<html>` 上那条由
  Docusaurus 内联脚本按同源 localStorage 写的 `data-theme`）—— 不给 `undefined`，否则它退到
  操作系统那一格；
- **同一格再钉一遍**：`forceDarkModeState` 取的是同一个读数（`'dark'` / `'light'`）。只给
  `darkMode` 是不够的 —— 厂商那条优先级链实测是 `overrideColorMode` → `localStorage` 里的
  `colorMode` → `initialColorMode`（`@scalar/use-hooks` 的 `useColorMode`，
  `ApiReference.vue.script.js` 把 `forceDarkModeState` 原样递成 `overrideColorMode`），
  而 `overrideColorMode` 排第一。框内这一页与站点**同源**，那个 `colorMode` key 谁都读得到：
  老版本留下的、或同域别处写的，都会把 `darkMode` 盖掉。钉上之后本地、线上、任何一台机器起来
  都是同一个形状，站点仍然是唯一的驱动。
  留下一条窄缝，记清楚：厂商那个 watcher 也听操作系统的 `prefers-color-scheme`，页面开着的时候
  换系统主题，它会把**挂载时钉住的那一格**重新落一遍类名，盖掉外层后来送进来的那次；下一次站点
  开关动一下就正回来。不钉这一格时同样会重落，落的却是操作系统那一格 —— 两种都是「不跟站点走」，
  钉过的至少是站点自己当时的值。
- **之后**由外层送：那个值写在**外层**文档上，跨不过 iframe，所以要靠机制层那条 `mode` 消息，
  框内 `useFrameMode(applyScalarColorMode)` 收到就把 `<body>` 上那两个类名换一遍。

`theme-redoc` / `theme-stoplight` 那两层落到 `<html>` 的一条**属性**上，这一层换的是 `<body>` 上
两个**互斥的类名** —— 属性名换不动它。机制层因此不猜落法：`useFrameMode` 收的是调用方交进来的
`apply` 函数（`components/scalar-color-mode.ts`），三条层各写各的。

Scalar 自己那颗左栏底部的亮暗开关用配置收掉：`hideDarkModeToggle: true`（`scalar-ui.tsx`）。
上面那条 `forceDarkModeState` 也能收掉它（厂商的渲染条件是 `!hideDarkModeToggle &&
!forceDarkModeState`），两条都写是因为 `hideDarkModeToggle` 那条才是本层想说的意思。这一层
**不需要**像 redoc 那样写 CSS —— 配置里就有这一格。它露出来时长什么样是实测过的：临时把
那一格设成 `false` 重建，框内文档里多出一个 `aria-label="Set dark mode"` 的元素（没有
`data-testid`），所以 e2e 那句「Scalar 自己那颗亮暗开关不出现」认的是这个标识，不是空选择器。
收掉的理由与另两层同一取舍：配色改由站点驱动之后，点它只改框内那份文档的类名、站点没有任何反应，
一颗按了没反应的按钮，还跟 navbar 上那颗重复。

判据是 `test/e2e/features/scalar.feature` 的第三条用例：先用 `emulateMedia({ colorScheme: 'dark' })`
打开这一页（要在加载前定下来），钉「系统深色、站点亮色」时框内那份文档 `<body>` 上是 `light-mode`
（那条消息确实送到了），再把站点切成暗色，钉 `--scalar-background-1` 真的翻过去、**而且那份文档
没有重新加载**（判的是它自己的 `performance.timeOrigin`，见 `common.steps.mts`），最后拿同一批
站点属性在暗色下把这一页与主页各量一遍比相等。

## 界面文案：走厂商自带的简体那一份

Scalar 的界面文案（左栏「简介」、搜索那一行、代码示例上方那排；本层收掉的下载那两颗与接口标题旁
那颗「测试请求」，字也出自同一份表）不写在组件里，取自它自己那份本地化表。本层按配置交一格：
`localization: { locale: 'zh-cn' }`（`scalar-ui.tsx`）。

三件实测过的事：

- **合法取值是那九份内置的**（`@scalar/api-reference/dist/features/localization/locales/`：
  `ar` / `de` / `en` / `es` / `fr` / `pt` / `ru` / `zh-cn` / `zh-tw`），认的是这种小写带连字符的 id，
  不是 BCP 47 —— `locale` 在 schema 里只是一条 `z.string().optional()`，写错不会报错，
  `resolveLocalization` 取不到就退回默认的那份 `en`（厂商 `use-localization.js` 里
  `defaultLocale: "en"`）。所以这一格要么写对，要么静默没换。
- **简体那份是全的**：`zh-cn.js` 与 `en.js` 各 253 条 key、一条不缺（逐条比过），不会中英夹一半。
  选 `zh-cn` 而不是 `zh-tw` 是因为站点与示例文档都是简体。
- **有一处换不动**：Scalar 报「文档取不到」那句（`Document 'api-1' could not be loaded`）不在这份
  表里，是厂商硬编码的英文（实测在这份安装的 `dist/browser/standalone.js` 里数到 1 处，locale 表
  里也没有对应条目），换语言也还是英文。e2e 那句「Scalar 没有报那份文档取不到」继续按它认。

换语言会牵到 e2e：那几句按文案认的判据因此两种都收（`Copy` 与「复制」、`Ask AI` 与「询问 AI」、
`Test Request` 与「测试请求」）。数量上也量过一次：只认英文是 6 颗、只认中文是 11 颗，并起来才是
那句钉的 17 颗代码块复制按钮 —— 少收一种就会静默变成「少了几颗」。

还有一格是**已知不一致，本层不动**：界面文案由上面那条 `localization.locale` 决定，而两份文档的
`<html lang>` 由站点的 i18n 决定（本站实测是 `zh-Hans`）—— 两条配置各走各路，谁也不读谁。要对齐
得动站点的 i18n，不归这一层。

## 宽度：这一层不动站点那侧的版式，Scalar 的左栏由窗口宽度决定

三条 API 层里只有 Scalar 有一个**视口宽度门槛**：实测 1024 CSS px，量的是**框内那份文档**的视口
宽度（厂商那张表里的一条媒体查询，落在这份文档自己的 `<html>` 上）。不够，整套 API 导航就收成
一颗「打开菜单」抽屉。

站点默认的版式给正文那一格留的是 `calc(100% - var(--doc-sidebar-width))`，文档侧栏 300px，
所以 1440 视口下框 1140、1280 视口下框 980 —— 后者正好差那一档。本层**不**为此去改站点那侧的
版式（先前写过两条 `body:has(.scalar-frame)` 把 `--doc-sidebar-width` 收成 0，让框吃满整幅，
代价是那种页面上站点的页面列表没了；已经去掉。外层那一格本包**没有**自己的 CSS ——
框定高与正文容器让位由 `render: 'iframe'` 那一族共用机制层那份
`components/component-frame.css`）。于是这一格里剩下的事实是：

- **窗口够宽，左栏就展开**：实测 1440×720 视口下框 1140、Scalar 的 `<aside>` 288 宽、六条接口
  链接都可见，站点的文档侧栏 300 宽照旧在。e2e 的视口因此从 `Desktop Chrome` 自带的 1280 加到
  1440（`playwright.config.mts`），那几句「三个接口都在 Scalar 的左栏里」「Scalar 左栏贴满那一份文档的一屏」量的才是展开态；
  高度照旧 720，几层按高度算的判据不动。
- **窗口窄就是抽屉，这是厂商那一条断点，不是本层能钉的**：1280×720 实测框 980，`<aside>` 宽 0、
  链接全在 DOM 里但 `hidden`，正文顶上多一颗「打开菜单」。要在窄窗口里也常开，只能往框内那份
  文档覆写它的断点（跟厂商的响应式打架，而且 980 里再吃掉 288，正文只剩约 690），本层不做。

高度那一条与三层同形（`.component-frame` 的 `calc(100vh - var(--ifm-navbar-height))`），滚动条长在
框内那份文档上，本层不给 Scalar 那一格定高。判据两句：外层「框占满 navbar 以下那一屏」，框内
「Scalar 左栏贴满那一份文档的一屏」（实测 `<aside>` 的 `top: 0`、`bottom = innerHeight`）。

## 首屏不下载渲染器

`@scalar/api-reference` 那一整套（Vue 运行时、主题、九个语言包）只在框内那一格**真渲染时**才下载：
`theme/ScalarView/index.tsx` 交给 `LazyView` 的是模块级那一句
`loadView: () => import('../../components/scalar-ui.tsx')`，不是 `ScalarUI` 本身。

实测（`pnpm build` 之后用 Playwright 在本地静态服务上量整页的传输字节 —— 外层与框内两份文档合起来算，
响应头的 `content-length` 累加，视口 1440×720）：

- 文档页起来之后先落 **693 KB**（13 份文件，里面没有 Scalar）
- 框里那句「正在装载 Scalar…」之后按需再下 **4,152 KB**（4 份：`assets/js/5265.*.js` 3,853 KB
  加那条指向 Scalar 样式表的 `<link>` 271 KB，再加两块小 chunk）
- 单独打开 `/__component-frame/`（没有外层，于是收不到 `init`，一直停在占位那一格）只要 **588 KB**，
  **一份渲染器都不下载**

拆之前那一版同一个页面要 **4.02 MB**：整棵依赖图都挂在路由 chunk 的同步分支上，进这一页得先下完。
`scalar-ui.css` 与厂商那份 `style.css` 也跟着走进按需那一路 —— 前者随 `scalar-ui.tsx`，后者是它的
构建期摘成独立产物（见「样式」一节），不再压在这一页的首屏上，也不再进全站那一份。

框里那一下会先空着：那条 `import()` 在 effect 里，不是 `React.lazy`，所以没有 `Suspense` 兜底。
理由与三家的共同口径记在机制层的
[`iframe-protocol.md`](../../theme-component-page/docs/iframe-protocol.md)「首屏不下载渲染器」一节。

## 正文按需挂载

Scalar 的正文区按需挂载：视口之下还没滚到的那几节不在 DOM 里（默认那一页，认布局根里可见的
`h1`–`h4` 数，实测同一时刻 1440×720 是 2 颗、1440×900 才是 5 颗；整页直达深链那一份，可见的
标题四颗，加高到 900 也不多那一节）。e2e 那句整页直达的判据因此只钉到地址里那条接口为止。

## 两个方向各走一条路

两个方向各走一条路，因为它们要绕过的坑不一样：

- **框内 → 外层**：听配置里的 `onSidebarClick`（`scalar-ui.tsx`）。框里点一条接口走的是
  `history.pushState`，它**不触发** `hashchange` —— 与 `theme-redoc` / `theme-stoplight` 实测到的
  同一格，所以这一层不听事件、听回调。报出去那一句是 `theme/ScalarView` 从机制层
  `useFrameHashReporter()` 拿的。
- **外层 → 框内**：机制层收到那一段就写本份文档的 `location.hash`。这一步**会**触发
  `hashchange`，而 Scalar 只在挂载那一次读地址、另外只听 `popstate`，所以 `scalar-ui.tsx` 把前者
  转成后者（`new PopStateEvent('popstate')`）。这一转不成环：Scalar 自己写历史用的是
  `pushState` / `replaceState`，两条都不触发 `hashchange`。

有一条跟着 redoc 那一份搬过来的教训，在 Scalar 这一层换了形状但同样成立：**它拿到坏地址不抛异常**，
而是在正文区打一句 `Document 'api-1' could not be loaded`（实测），页面其余部分照常。判据钉在
「Scalar 没有报那份文档取不到」那一句。

## 深链

能发给别人的是**外层**那条地址（`/theme-scalar/docs/scalar-demo#tag/orders/POST/orders`）。hash 段不参与取文件，
整页加载它回 200；iframe 的 `src` 里**不**塞那一段（全站共用一条地址），它靠框里那句 `ready` 之后
外层补送的那一条 `hash` 消息换进框内。为什么不是外层在 iframe 的 `load` 事件上推、两侧各推一次的
来由，记在
[`iframe-protocol.md`](../../theme-component-page/docs/iframe-protocol.md) 的「对齐是两侧各推一次的」一节。

多写一个斜段是**静默失灵**：实测外层地址写成 `#/tag/orders/POST/orders` 时，那一段确实送进了
框内、框内地址也确实成了那一串，但 Scalar 认不出这个 id，页面停在文档概览上（标题只剩 2 颗、
`scrollY` 一直是 0），控制台一个字都不报。

## 收掉的几处 Scalar 自己的东西

八处。口径是：**厂商自己塞的品牌位、跟站点重复的开关、那几件只在本地冒出来的东西收掉；给写文档
和部署这一页的人用的功能收掉，给读文档的人用的不收**。

- **那颗亮暗开关**：配置收的（`hideDarkModeToggle: true`），不渲染，DOM 里没有，所以 e2e 那句
  按数量判。理由见「亮暗模式」。
- **那颗「Ask AI」按钮**：配置收的（`agent: { disabled: true }`）。厂商那一格的判据按顺序是
  配置里 `agent.disabled` 优先 → 本机地址就开 → 配了 `agent.key` 才开，而这一层没有 key，于是
  它也是**只在本地冒出来**的东西（实测收之前：`/theme-scalar/docs/scalar-demo` 框里那份文档有 1 颗
  文案为「Ask AI」的按钮；收之后 0 颗）。它要 `agent.key` 才是在公网上能用起来的那一格（厂商判据里
  那第三路），本层没有那个 key，也不打算把对话交给它。
- **那颗「Test Request」**：配置收的（`hideTestRequestButton: true`，厂商默认 `false`）。收它不是
  因为品牌位，是因为**它真的会把请求发出去**：那一格读的是这份文档自己的 `servers`，任何人点一下
  就从站点的页面上朝那个地址发一条请求，而这一层摆的是一份给别人看的接口文档，凭据与 CORS 都不在
  本层的承诺里。厂商那一路的判据还说明它连累了别的格子：正文里的鉴权选择器与它同源（`Content.vue`
  的 `showAuthSelector` 那句注释写的是 "tied to `hideTestRequestButton`"），所以这一格收掉的是
  「从这一页发请求」整条路。**不收的是看的能力**：填参数、代码示例照旧。
  e2e 那句按文案认（那颗按钮的文案取自本地化表里的 `operation.testRequest: "Test Request"`，
  没有 `data-testid`）。
- **正文顶上那一格「下载 OpenAPI 文档」**：配置收的（`documentDownloadType: 'none'`）。厂商那份
  `DownloadLink` 按这一格取值决定摆不摆（`yaml` / `json` / `both` 才渲染，`direct` 要有 spec 地址，
  其余整格不生成）。上面那条口径说「给读文档的人用的不收」，这一格是个边界：那两颗递的是**原始文件**，
  不是看文档的能力，而文件本身对读的人并没有藏起来 —— 地址就写在这一页的 frontmatter 里，
  `static/` 下那份 yaml 直接请求也能存。这一层只是不再把它做成一颗按钮递到手边。
  走 `documentDownloadType` 而不是同名的旧写法 `hideDownloadButton: true`，是因为后者在
  `@scalar/types@0.25.0` 里已标 deprecated：它会把这一格换算成 `none`（行为一样），同时往控制台
  补一句 `[DEPRECATED]`。**收之前的实测**：`/theme-scalar/docs/scalar-demo` 框里 1 颗 `.download-container`、2 颗
  `.download-button`（JSON 与 YAML 各一颗）；收之后两处都 0 颗。e2e 那句按这两条类名加一条
  `[aria-label*="OpenAPI"]` 判，后者兜的是哪天那颗换成不带这串类名的按钮。
  AsyncAPI 那一版是同一个机制、另一组文案：默认配置下实测是 1 颗 `.download-container`
  （class `download-both`）+ 2 颗 `.download-button`，无障碍标签是「下载 AsyncAPI 文档（JSON）」与
  「下载 AsyncAPI 文档（YAML）」。所以 e2e 那句的无障碍标签按中英文两种都收
  （`[aria-label*="下载"], [aria-label*="Download"]`）。
- **左栏底部那两颗「Generate MCP」/「Connect MCP」**：配置收的（`mcp: { disabled: true }`）。
  厂商那一格（`sidebarCta`）按 `mcp.disabled` 优先 —— 钉成 disabled 就直接退回 API client 那颗
  入口；不设时按「本机地址摆 explore、线上摆 client」走，本地与线上又是两个形状。这一层不卖
  「装进编辑器」那两条链接。**这一格与下面那条署名同住**：左栏底部那一整格（CTA 那一行加署名那一行）
  本来就被 `scalar-ui.css` 收成 `display: none`，所以 e2e 那句在 **DOM 那一层**判（0 颗带 MCP 字样
  的按钮或链接、1 颗 `a.open-api-client-button`），按可见性判只会量到我们自己那条 CSS。
- **正文顶上那条开发者工具栏**：配置收的（`showDeveloperTools: 'never'`）。Scalar 那一格的默认值
  是 `localhost`，判据是 `isLocalUrl(window.location.href)` —— 站点跑在 `pnpm start` 与 e2e 的本地
  服务上正好命中，于是**同一份产物在本地和线上长得不一样**。本层没有 `workspace`，那条栏真的摆出来
  的是标题与「改配置」那颗（分享、部署、生成 SDK 那三颗要有 workspace 才渲染），读文档的人用不上；
  按 `never` 钉死之后本地与线上是同一个形状。实测代价：框里含「Copy」的按钮少
  一颗（那条栏上有一处拷贝入口），框内那份文档里 `.scalar-app` 从 7 颗变成 3 颗（放开这一格量过：
  7 颗，钉死后 3 颗）。**1.76.0 起这一格还顺带收掉两处**：厂商把它递成
  `useGenerateSdk({ disabled: () => showDeveloperTools === 'never' })`，那颗「生成 SDK」于是整个
  不渲染；厂商 `sidebarCta` 的本机分支也先看它（这一层那格推广位本来就被 `mcp.disabled` 压成
  API client 那颗入口，厂商这一条是另一条独立的路）。本层原先自己加的那条收「生成 SDK」的 CSS
  因此摘掉了（见下面那条）。
- **左栏底部那条「powered by Scalar」署名与 Scalar 那张推广位**：`scalar-ui.css` 里一条
  `display: none !important` 收掉整格。走 CSS 而不是配置是因为配置里**没有这一格**：查过
  `@scalar/types@0.25.0` 那份 `api-reference-configuration` 的 schema，`hide*` 一共七条
  （`hideDarkModeToggle`、`hideDownloadButton`、`hideSearch`、`hideModels`、`hideModelNames`、
  `hideClientButton`、`hideTestRequestButton`），管署名与推广位的一条都没有。那七条是这一族的名字，
  与上面「收掉几处」的处数无关；而且 `hideDownloadButton` 这一条本层没有用 —— 它已标 deprecated，
  下载那一格走的是 `documentDownloadType`。
  选择器认的是**它是什么**（装着指向 `https://scalar.com/?utm_source=powered-by` 那条链接的
  `aside` 直接子格），不是 Tailwind 那串 `flex flex-col gap-3 px-3 pb-3` —— 换个版本类名就重排。
  收的是那一整格，但**左栏整格不收**：`e2e` 里配了一句「左栏那一格还在」。
- **那颗「生成 SDK」**：**厂商 1.76.0 自己收的**，本层不再用 CSS 单收它。厂商那一颗的判据本来整个
  住在代码里（`features/generate-sdk/use-generate-sdk.js` 的 `isLocalUrl(window.location.href)`，
  配置里没有一格管它），于是它是**只在本地冒出来**的那一族：1.75.0 时实测 `localhost` 起站点框里
  有 3 颗（客户端选择器右上角 1 颗 + 接口代码示例页脚 2 颗），线上那份 0 颗 —— 本层原先自己加了
  一条 CSS（`scalar-ui.css` 里 `.generate-sdk-button` 与 `.selected-client-action`）把它们收掉。
  1.76.0 起厂商把 `useGenerateSdk` 的 `disabled` 接到 `showDeveloperTools === 'never'` 上
  （`ApiReference.vue` 里 `disabled: () => mergedConfig.value.showDeveloperTools === "never"`），
  那一格为真时 `GenerateSdkButton` 返回空注释节点 —— **那颗按钮整个不渲染**，不止是看不见。
  本层那一格 `showDeveloperTools: 'never'` 早就按死了，于是那条 CSS 与它那句「先钉 DOM 里
  认得出来」的 e2e 判据一起摘掉，e2e 现在按数量判 0。
  跟着的一条依赖约束：本包 `@scalar/api-reference` 的范围因此抬到 `^1.76.0` —— 装到 1.75.0 的
  消费者会看到那颗按钮重新冒出来（那一版厂商还没接 `disabled`）。
  厂商留的另一条路仍然没有走：文档 `info` 里写 `x-scalar-sdk-installation`（`hasRenderableSdks`
  认它）也能让那颗就地消失，但它同时把客户端选择器换成「SDK 安装说明」那张卡，动的是**这份演示
  文档的内容与正文一整块**，比收一颗按钮大。

**给读文档的人多摆的一处**：每条接口标题旁那颗 operationId 徽标（`showOperationId: true`，厂商默认
`false`）。抄 curl、生成客户端的人认的就是这一串，这份 `static/openapi-scalar.yaml` 三条都有
（`listOrders` / `createOrder` / `getOrder`）。实测它是标题旁 `div.flex.flex-wrap.gap-1` 里的一颗
`div`，e2e 那句按「整段文案正好等于 `createOrder`」认，把代码示例里那几个同样出现的字排除掉。

还有一格是**表态，不改行为**：`telemetry: false`。厂商默认 `true`，但实测这份安装的 1.76.0 里
`dist/plugins/posthog/index.js` 没有任何地方 import（不载插件就什么都不发），所以这一格现在等于
没写；留下来是按本层的口径表一句，也是给厂商哪天默认载上时的一道防线。

`display: none` 那一句仍在 DOM 里，所以 e2e 按可见性判、不按数量判，并且先钉「这一格在 DOM 里
认得出来」再钉「看不见」，免得选择器哪天匹配不上就静默通过。

**代码块里那些复制按钮一个都不收**（实测点开一条接口之后框里有 17 颗，其中 6 颗的文案带 `Copy`、
11 颗带「复制」）：那是「把这段示例拷走用」，不是品牌位。Scalar 不给那几颗 `data-testid`，e2e 那句
按按钮自己的文案认，两种语言都收（见「界面文案」）。

## Node 侧依赖：这一层不需要补

`theme-stoplight` 要给 `url` / `buffer` 配真 polyfill，`theme-redoc` 要给 `worker_threads` 置空。
本层实测**一条都不需要**：`@scalar/api-reference` 的浏览器出口没有走到那些 Node 分支，构建期没有
`Module not found`，打开页面也没有 `ReferenceError`（`e2e` 那句「浏览器里没有运行期错误」兜的正是
后者 —— stoplight 那一层当初就是构建全绿、页面一开就 `process is not defined`）。

真正需要记的是**依赖图**那一格，不是 polyfill：接进这一层时 `@docusaurus/theme-common` 被 peer
分组洗成两份物理副本，`/theme-stoplight/docs/stoplight-demo` 在 SSG 阶段报 `ReactContextError`，靠
`pnpm-workspace.yaml` 里那条 `overrides: { '@types/react': ~18.3.31 }` 收回去。来龙去脉与两次
对照实验（去掉就红、加回来就绿，都清了 webpack 持久缓存）记在 `pnpm-workspace.yaml` 那份注释与
仓库根 README。

### 随这一层多出来的构建告警

都不影响产物（`pnpm build` 仍 `[SUCCESS]`，`pnpm serve` 与 e2e 全绿），但要记下来，免得哪天被当成
本层的 bug 去查：

- `Critical dependency: the request of a dependency is an expression` —— 出处是
  `@scalar/api-reference/dist/standalone/lib/load-plugins-from-urls.js`，客户端与服务端两遍各报一次。
  那是它「浏览器里按 URL 动态加载插件」那一支用的动态 `import`（源码里写的是 `import(url)`，specifier
  是运行时才有的表达式）；本层不走 standalone 那个入口，这一支被打进产物也没人调。它只给自己带了
  一句 `/* @vite-ignore */` 降噪，**webpack 不认那个注释**，所以在 Docusaurus（webpack）下必报。
  与 `theme-redoc` 那条「没选 `init()`」的理由是同一类（那边因此换用了 React 入口），本层换不掉：
  这一格就在被引模块的依赖树里，不在另一扇门上。
  **处理**：`src/index.mts` 的 `configureWebpack()` 用 webpack 的 `ignoreWarnings` 按模块名按住这一条
  （判据是 `@scalar/api-reference` 里这个具体文件，不是全局消息匹配，别处真出了同名告警照旧报）。
  按住的前提是原样留给浏览器执行就是正确行为 —— 这一支只服务 `pluginUrls` 配置，本层没有配它。
  这一格是本层自己的 `configureWebpack()`：v3 把各包自带的框内页面收进机制层那条共用路由之后，
  本包不再经任何工厂，webpack 那两格都直接写在入口里。
- ~~`Css Minimizer plugin … postcss-calc: Lexical error on line 1: Unrecognized text`，报错的那一处是
  `(50 - l) * infinity`~~ —— 出自 Scalar 那份 `style.css`（这个模式在 `@stoplight/elements` 那边搜不到），
  是 Tailwind 4 那种「自定义属性参与 calc」的写法，postcss-calc 算不动就原样留着。**这一条现在不冒了**：
  站点把 CSS 压缩器换成了 lightningcss（仓库根 `docusaurus.config.mjs` 的 `future.faster` 那一格，
  理由与三条告警一起消失的实测记在那份注释里）。同一次构建里原先还跟着三条 minimizer 告警
  （`Empty property '--csstools-color-scheme--light'` 与两条 `Invalid font values`），一并没了。
  换压缩器之前那些都只是在报，压缩器忽略过去、文件照发，不影响产物。

清过 webpack 持久缓存重新构建（`pnpm clear && pnpm build`）量过一次：除上面那条被 `ignoreWarnings`
按住的之外，**一句告警都不冒**，只有两遍编译的耗时与最后那句 `[SUCCESS]`。

## 状态：已接入站点，浏览器里那两份文档都真渲染

`docusaurus.config.mjs` 的 `plugins` 里装了本包与 `theme-component-page`（不装 `theme-iframe` 也
照常渲染）；同页写中多把框键时谁先命中看站点 component-page 那一列 `rules` 的顺序，本层那条 `scalar`
在那一列里排在最前（`componentPage` 那条站点自己的规则之后）。站点根的 `package.json` 声明了
`"@show-docs/docusaurus-theme-scalar": "workspace:^"`。`pnpm build`、`pnpm verify:chain` 与
`pnpm test:e2e` 都绿（35 条用例，四条是这一层的），层栈里能看到 `packages/theme-scalar/theme`
（只剩 `ScalarView` 那一格）。

已实测到的（都在 `test/e2e/features/scalar.feature` 那四条用例里）：

- 外层：`build/theme-scalar/docs/scalar-demo/index.html` 里是
  `<iframe class="component-frame" src="/__component-frame/" title="Scalar 示例">`；这一页没有
  `<article>` 正文外壳、`.scalar-app` 0 个、
  没有 Scalar 渲染出来的文字，`.container` 的内边距是 0，框的上沿贴着 navbar
  下沿、下沿贴着视口，框宽 1140（1440 视口减掉站点那 300 的文档侧栏，它在这一页照常摆着）。
- 框内：Scalar 的布局根（`.scalar-app.scalar-api-reference`）在、左栏三个接口 `#tag/orders/GET|POST/orders…` 都在（**默认就是展开的**，
  不像 redoc / stoplight 要先点分组）、点新建订单时详情换成它**并且外层地址栏那一段跟着换**（这一句
  同时钉住框内 → 外层那条消息）；左栏 `<aside>` 上沿贴 0、下沿贴满那份文档的底；它那颗亮暗开关
  不在（0 颗 `aria-label*="Set "`）、那条开发者工具栏也不在（0 颗 `.api-reference-toolbar`）、
  那颗「Ask AI」也不在（0 颗文案为「Ask AI」的按钮）、那颗「Test Request」也不在（0 颗文案含
  Test Request 的按钮）、正文顶上那一格下载也不在（0 颗 `.download-container` 与 `.download-button`，
  再补一条 0 颗 `aria-label*="OpenAPI"` 兜类名哪天换掉），左栏底部那一颗是 `a.open-api-client-button`（1 颗）而不是 MCP 那两颗
  （0 颗带 MCP 字样的按钮或链接）、接口标题旁那颗 `createOrder` 徽标在，
  署名那一格 `display: none` 而左栏整格还在、那颗「生成 SDK」整个不在 DOM 里（0 颗
  `.generate-sdk-button` 与 `.selected-client-action` —— 1.76.0 起厂商跟着 `showDeveloperTools`
  一起收，见「收掉的几处」一节）；17 颗代码块复制
  按钮都还在（按 `Copy` 与「复制」两种文案一起认，见「界面文案」）；界面是简体的（实测左栏那排是
  「简介」「打开搜索」「复制默认值」）；全程没有运行期错误。
- 深链：整页加载 `/theme-scalar/docs/scalar-demo#tag/orders/POST/orders`，托管侧回 200，框里把那条接口摆出来
  （直达那一份清单钉到 `新建订单` 为止，原因见「正文按需挂载」一节）。
- 亮暗：操作系统按深色打开这一页，站点仍是亮色、框内 `<body>` 上也是 `light-mode`（这一格现在由
  `forceDarkModeState` 钉住，同源 `localStorage` 里那条 `colorMode` 也压不动它）；操作系统换回
  亮色再重载，框内配色**不动**（那一格的读数还是同一个）；站点切成暗色，`--scalar-background-1`
  从 `#fff` 翻过去**而且那份文档没重新加载**（`performance.timeOrigin` 没换数）；再拿同一批站点
  属性在暗色下把这一页与主页各量一遍，值相同。
- 写了键却没给文档地址（`scalar-no-spec` 那一页）：命中还是命中、框照挂，框里摆的是本层那句
  「这一页没给 Scalar 要渲染的文档」，Scalar 那一格不挂载（`.scalar-app` 0 个，那句
  `could not be loaded` 也不出现）。
- 产物体积：Scalar（连 Vue）落在懒加载 chunk 里（实测那块 `assets/js/5265.*.js`，3.8 MB 上下），
  主页那份 html 不引它；样式表那份也在构建期摘成独立产物（277,962 字节），只在框内那份文档里被
  `<link>`，见「样式」。

## AsyncAPI 3：换一把 spec 键，同一份渲染路径

`aas3:` 与 `oas3:` 是同一组 spec 键（`oas3:` 摆 OpenAPI、`aas3:` 摆 AsyncAPI 3），本层拿到的都
只是一个地址，判据在厂商那边：Scalar 认文档里 `asyncapi:` 那一格是不是字符串
（`isAsyncApiDocument()`），是了就走 AsyncAPI 那一套渲染分支（`scalar-asyncapi-*` 那些块）。
所以本层**一行代码都不用改**：spec 键 → 送进框内的那份 frontmatter → 组件那份 `url` →
`createApiReference` 的 `url`，这一条路与文档类型无关。

实测（`static/asyncapi-scalar.yaml` 那份 AsyncAPI 3.0.0 的文档，示例页
`packages/theme-scalar/docs/scalar-asyncapi-demo.md`，判据在 `test/e2e/features/asyncapi.feature`）：

- 框里那份文档真的按 AsyncAPI 摆出来：标题是那份文档的 `info.title`，左栏里是**通道**，点通道
  进到详情，详情那一段也换过去了（`h2` 是通道名、`h3` 是那条操作名）。
- **hash 的形状变了**：OpenAPI 那一版是 `#tag/orders/POST/orders`（标签 + 方法 + 路径），AsyncAPI
  那一版是 `#channel/ordercreated`（通道 id），进到某条操作再往下一段
  `#channel/ordercreated/operation/receiveordercreated`。**两种都没有前导斜杠** —— 与 Redoc
  那边（`#/channels/ordercreated`）不一样，别拿一边去推另一边。
- 左栏那条通道链接带的是**完整地址**（不是 `#` 段），所以配置里那个 `onSidebarClick` 收到之后要
  `new URL(href, window.location.href).hash` 取那一段（`scalar-ui.tsx` 里就是这么写的）——
  这一格与 OpenAPI 那一族同形，不用改。
- 收掉的那几处在这一版里照旧成立：正文顶上那一格下载仍然不生成（`documentDownloadType: 'none'`
  对 AsyncAPI 一样生效，DOM 里 `.download-container` / `.download-button` 为 0，按无障碍标签认的
  下载按钮也为 0）、它那颗亮暗开关不见、左栏底部两颗 MCP 入口不见、署名那一格仍被 CSS 收掉。
- 界面文案仍是简体那一份（`localization.locale: 'zh-cn'` 对 AsyncAPI 那一套界面也生效）。
- 亮暗那套不变：落法是 `<body>` 上互斥的两个类名，与文档类型无关。

判据只钉「形状」不钉「哪一行」：通道名、操作名、标题都取自那份文档的原文，改了文档就要改用例。

没实测到的：GraphQL 那一种入口；Scalar 的 `hideModels` 那一类配置项没有逐条验，
本层只用了 `agent`、`darkMode`、`forceDarkModeState`、`hideDarkModeToggle`、
`hideTestRequestButton`、`localization`、`mcp`、`onSidebarClick`、`showDeveloperTools`、
`showOperationId`、`telemetry`、`url` 这十二格。其中每一条都对着 `@scalar/types@0.25.0` 那份
`api-reference-configuration` 的 schema 与装好的 `@scalar/api-reference@1.76.0` 里读它的那一处核过，
不是照着别的版本的文档抄的。
