# theme/theme-scalar

主题包：md 的 frontmatter 写 `scalar: <URL>` 时，该文档页整页换成**一个 iframe**，框里是本包
自己那条页面（`/scalar-view`），[Scalar](https://github.com/scalar/scalar) 的
`@scalar/api-reference`（Vue 3 组件）渲染的 OpenAPI 文档跑在那一份文档里。

形状与 [`theme-redoc`](../theme-redoc/README.md)、[`theme-stoplight`](../theme-stoplight/README.md)
是一对一的（入口声明层目录、层里的 `DocItem` 判 frontmatter、命中就换成一个框、跨文档那两格走
[`theme/frame-kit`](../frame-kit/README.md) 那份共享约定）。差的不是形状，是**渲染器怎么挂**和
**样式怎么落地**这两格：

- Scalar 是 Vue 组件，本层用那份面向非 Vue 宿主的 `createApiReference(元素, 配置)` 把它挂进一格
  `<div>`，因此不直接引 `vue`、也不装 React 包装层；
- 它的样式表是**发布好的静态文件**（`@scalar/api-reference/style.css`，335 KB 的 Tailwind 4 编译
  产物），不是 Redoc 那种运行期注入的表 —— 静态文件会被并进全站那一份 css，**iframe 拦不住它**。
  这一格与 `theme-stoplight` 同类，但结论相反：那条层要在构建期给选择器加前缀，这一层不用动手，
  因为 Scalar 出厂时每条规则已经带着 `.scalar-app` 那层前缀了（实测与理由见「样式」一节）；
- 它的亮暗判据是 `<body>` 上**两个互斥的类名**，不是属性（redoc 与 stoplight 那两层都是属性），
  所以共享层那条 `mode` 消息在这一层交的是 `onMode` 回调而不是属性名。

## 组成

| 文件                              | 编译吗              | 职责                                                                                                                                                                                                                    |
| --------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                   | ✅ `src/` → `dist/` | 入口：`getThemePath()` 指向包根的 `theme/`，`contentLoaded()` 用 `addRoute` 注册 `/scalar-view` 那一条页面，`configureWebpack()` 只做一件事：按住 Scalar 那条动态 `import` 的构建告警（见「随这一层多出来的构建告警」） |
| `theme/DocItem/index.tsx`         | ❌ 站点编译         | 层里的组件：命中 `scalar` 时整页换成那一个 iframe（`ScalarFrame`），没命中就交回下层 `DocItem`                                                                                                                          |
| `theme/ScalarPage/index.tsx`      | ❌ 站点编译         | 那条插件路由落到的组件：只放 `ScalarView`，不套站点的任何外壳与 provider（亮暗由外层送进来，见「亮暗模式」一节）                                                                                                        |
| `components/scalar-frame.tsx`     | ❌ 站点编译         | **外层**文档页里那一格：算 iframe 的 `src`，把 ref、本层那份消息约定与站点当前的亮暗交给共享层的 `useOuterFrameSync`                                                                                                    |
| `components/scalar-frame.css`     | ❌ 站点编译         | 外层那一格的版式：框定高占满 navbar 以下那一屏、正文容器去掉内边距与最大宽度（与 redoc / stoplight 同形，站点那侧的版式不动，见「宽度」一节）                                                                           |
| `components/scalar-frame-sync.ts` | ❌ 站点编译         | 本层专属的那四个名字（消息命名空间、框内那条路由的路径、spec 那一条查询参数名、iframe 的类名）；地址怎么拼、消息怎么造都在共享层                                                                                        |
| `components/scalar-view.tsx`      | ❌ 站点编译         | **框内**那一页的正文：从地址里取 spec、渲染 Scalar，服务端那一遍在这一格挡住；跨文档那两格接共享层的 `useInnerFrameSync`（这里交 `onMode`，不是属性名）                                                                 |
| `components/scalar-ui.tsx`        | ❌ 站点编译         | 浏览器端 `createApiReference(元素, 配置)` 挂上去，卸载时 `destroy()`；两头的地址各走一条路（框内 → 外层听 `onSidebarClick`，外层 → 框内把 `hashchange` 转成 `popstate`）                                                |
| `components/scalar-color-mode.ts` | ❌ 站点编译         | 亮暗落地的两个小函数：挂载那一刻交给 Scalar 的布尔、收到外层送的值就换 `<body>` 上那两个类名                                                                                                                            |
| `components/scalar-ui.css`        | ❌ 站点编译         | 生效在框内那一页：收掉 Scalar 送出来的那条署名与推广位、那颗只在本地地址冒出来的「生成 SDK」（厂商配置里没有这两格；为什么每条都要 `!important`，见「样式」一节）                                                       |
| `module-aliases.d.ts`             | 类型                | 引官方 `@docusaurus/module-type-aliases`，给 `useIsBrowser` 与 `*.css` 这些构建期才存在的 import 补类型                                                                                                                 |
| `tsconfig.build.json`             | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                                                                                                                                                  |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

跨 iframe 的那一套（地址怎么拼、三条消息的形状、来源校验、两侧的监听）**不在本包**，
在 [`@show-docs/theme-frame-kit`](../frame-kit/README.md)；本包只交出命名空间、路由名、参数名、
那个类名，以及「值送到框内之后落到哪个元素上」这一格回调。为什么两侧各推一次消息、为什么框内 →
外层不听 `hashchange`、为什么外层写地址用替换而不是新增，那几条理由记在共享层的 README，
这里不抄第二遍。

## 怎么用

```md
---
title: 订单 API
scalar: /openapi.yaml
---
```

命中时本层**不包下层 `DocItem`**（与 theme-redoc、theme-stoplight、`theme-iframe` 同一落点），
所以那一页不会有文档正文外壳、也不会再有导图。

`scalar:` 那个值是**框里那份文档去取哪个地址**，它被编码进 iframe 的 `src`
（`/scalar-view?src=%2Fopenapi.yaml`）。

## 渲染放在独立页面，文档页只嵌它

### 为什么要换一份文档

Scalar 那份组件在自己渲染时会往 `<body>` 上写类名（亮暗那两个）、按 `location` 自己走 hash 路由、
用 `localStorage` 存它自己的选择，还会 `document.querySelector` 找元素。这些动作在站点自己的文档页
里做，就是「两份文档的 `<body>`、两份路由、两份存储混用一格」。iframe 的边界是浏览器给的：框里那份
文档里的类名、路由、localStorage 与 DOM，站点的文档页一行都碰不到。

**这一格边界对 DOM、路由与存储成立，对 CSS 不成立** —— 它引的是静态样式表，会被打进全站那一份，
每一页都下载。那为什么还要换文档？因为换文档要解决的是前面那一串「按整份文档来用」的动作，
样式那一格另有防线（见下一节）。

### 两份文档各管什么

|                 | 外层：站点的文档页（`/scalar-demo`）      | 框内：本包那条页面（`/scalar-view?src=…`）                                   |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| 本层放的东西    | 一个 `<iframe class="scalar-frame">`      | `ScalarUI` 挂的那一格，根是 Scalar 自己的 `.scalar-app.scalar-api-reference` |
| Scalar 的运行时 | 不加载，一行都没有（`.scalar-app` 0 个）  | 全在这里（实测那一份文档里 `.scalar-app` 3 格，布局根只有 1 格）             |
| 样式表          | 全站那一份 css（**含 Scalar 那 335 KB**） | 同一份 css，外加 Docusaurus 给这一页的几格内联表                             |
| 亮暗模式        | 站点的 `<html data-theme>`，开关在这      | 自己 `<body>` 上的 `dark-mode` / `light-mode`，值由外层送来                  |
| 能分享的地址    | 有，`#` 那一段代表当前那条接口            | 有，但那是「直接打开框里那一页」，见「深链」                                 |

`/scalar-view` 是本包在 `contentLoaded()` 里用 `actions.addRoute()` 注册的一条插件路由，
组件写 `@theme/ScalarPage`（走层栈解析，与本包其它 `@theme/` 覆写同一个口径），`exact: true`。
构建产物里真的有一份 `build/scalar-view/index.html`（2177 字节），所以 `pnpm serve` 对它回 200。

路径名 `scalar-view` 在 `src/index.mts` 与 `components/scalar-frame-sync.ts` 里各写了一份常量：
两边站在编译边界两侧（前者进 `dist/`，后者由站点编译），共享不了，**改要一起改**。

### 同源，但每条消息仍然校验

框里那一页是站点自己的一条路由，和外层同一个源，`src` 由本包自己拼，本来不存在跨源信任问题。
每条消息还是要过 origin 与来源窗口那两格（共享层的 `isTrustedMessage`）：防的是「别人往这一页
postMessage」时不被当成自家消息，而不是防自己。`/scalar-view?src=…` 是条公开地址，任何人都能手工
拼一条，所以取 spec 那一段只认能解析成 `http:` / `https:` 的（共享层的 `specUrlFromSearch`，本层用
`scalarSpecUrlFromSearch` 转手调它），拿不到就整格什么都不渲染。

## 样式：那份表全站都在，拦不住 —— 但也不用拦

这一节是本层与 `theme-redoc` 最大的分野，先说结论：**iframe 拦不住静态样式表，这里靠的是 Scalar
出厂自带的作用域前缀，实测它没有改到站点的任何一处。**

`@scalar/api-reference/style.css` 是一条静态 `import`，webpack 把它并进全站那一份
`assets/css/styles.<hash>.css`，于是**每一页**都下载它，包括从没命中 `scalar:` 的主页。实测口径
是同一份产物的两次构建对照：去掉那一行 import，站点那一份 css 是 82,841 字节；引上它是
441,957 字节 —— 净增 359,116 字节，主页与 redoc、markmap 那三页都带着它。这与
`theme-stoplight` 那一层的处境一模一样：那里 Elements 的静态表也是全站
一份，iframe 拦不住，所以那一条层在构建期给每条选择器加 `.stoplight-root` 前缀。

**这一层不做那一步，因为 Scalar 出厂就自己做完了。**它那份 Tailwind 编译产物里 1330 条规则的选择器
都带 `.scalar-app:not(#\#):not(#\#):not(#\#):not(#\#)` 前缀（`important: '.scalar-app'` 那格配置），
剩下 1116 条不带前缀的，认的全是它自己的类名（`[data-v-…]` 那种 Vue 作用域类、`.scalar-code-block …`、
`.dark-mode` / `.light-mode`）或只是注册自定义属性（`--tw-*`、`--scalar-*`）。`.scalar-app` 那一格
在框内那份文档里（实测 3 格），外层 0 格 —— 于是那些规则在站点页面上没有可命中的元素。

这一句不是推理，是**对照量出来的**：把那一行 import 注掉重新构建，与注回来之后，在 `/`、
`/redoc-demo`、`/markmap-demo` 三份页面上取同一批 31 个站点选择器 × 16 条 computed 属性比 ——
**只有 `--tw-shadow` 这一处不一样**（引上 Scalar 那份表之后 `<html>` 上是 `0 0 transparent`，
去掉是空串），其余一字不差。那一处是 Tailwind 4 在 `@supports` 里给 `*, :before, :after` 注册
的自定义属性默认值，没有哪条站点规则读 `--tw-*`。

代价要记一句真话：**多出来的那 359 KB 每一页都下载**，不只命中页。要收掉得让那条 import 只跟着
框内那一路由走（Docusaurus 的 CSS 是一份全站产物，本层没有这个开关），或者按 `theme-stoplight`
那一条层那样在构建期动手 —— 两条都比这一格的现状贵，所以先记下代价，不动手。

因为规则带着 `:not(#\#)` 那四段 ID 级权重，**本层想覆盖它就得写 `!important`**。实测：不带
`!important` 的同一条规则注进页面也不生效（`scalar-ui.css` 里那两条各量过一次 —— 署名那一格、
那 3 颗「生成 SDK」，不带时一处都收不掉，加上才归零）。
前缀用 `.scalar-app.scalar-api-reference` 这两格类名而不是裸的 `.scalar-app`：框内那份文档里
`.scalar-app` 有 3 格，只带 `scalar-api-reference` 的那一颗是布局根（实测 1 格，`aside`、左栏链接
与正文都在它下面），另外两格是厂商给自己那几格弹层与提示造的（实测其中一格带 `scalar-tooltip`）。

判据两句，都在 `test/e2e/features/scalar.feature` 第一条用例里：「外层文档里没有 Scalar 的运行时
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
- **之后**由外层送：那个值写在**外层**文档上，跨不过 iframe，所以要靠共享层那条 `mode` 消息，
  框内收到就调 `applyScalarColorMode()` 换 `<body>` 上那两个类名。

`theme-redoc` / `theme-stoplight` 那两层交给共享层的是**属性名**（`data-redoc-mode` /
`data-theme`），这一层给的是**回调**：只有 Scalar 用两个互斥类名，一个属性名换不动它。共享层
`useInnerFrameSync` 的入参因此是一个二选一（`modeAttribute` XOR `onMode`），见
[`theme/frame-kit` 的 README](../frame-kit/README.md)。

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

Scalar 的界面文案（左栏「简介」、搜索那一行、代码示例上方那排、下载那两颗、接口标题旁那颗
「测试请求」…）不写在组件里，取自它自己那份本地化表。本层按配置交一格：
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

还有一格是**已知不一致，本层不动**：框内那份文档 `<html lang>` 仍是 `en`（由 Docusaurus 的 i18n
配置决定，站点整体就是 `en`），而 Scalar 的界面是简体。要让两者对齐得动站点的 i18n，不归这一层。

## 宽度：这一层不动站点那侧的版式，Scalar 的左栏由窗口宽度决定

三条 API 层里只有 Scalar 有一个**视口宽度门槛**：实测 1024 CSS px，量的是**框内那份文档**的视口
宽度（厂商那张表里的一条媒体查询，落在这份文档自己的 `<html>` 上）。不够，整套 API 导航就收成
一颗「打开菜单」抽屉。

站点默认的版式给正文那一格留的是 `calc(100% - var(--doc-sidebar-width))`，文档侧栏 300px，
所以 1440 视口下框 1140、1280 视口下框 980 —— 后者正好差那一档。本层**不**为此去改站点那侧的
版式（先前写过两条 `body:has(.scalar-frame)` 把 `--doc-sidebar-width` 收成 0，让框吃满整幅，
代价是那种页面上站点的页面列表没了；已经去掉，`scalar-frame.css` 现在与 redoc / stoplight 同形，
只有框定高那一条与正文容器去内边距那一条）。于是这一格里剩下的事实是：

- **窗口够宽，左栏就展开**：实测 1440×720 视口下框 1140、Scalar 的 `<aside>` 288 宽、六条接口
  链接都可见，站点的文档侧栏 300 宽照旧在。e2e 的视口因此从 `Desktop Chrome` 自带的 1280 加到
  1440（`playwright.config.mts`），那几句「三个接口都在左栏里」「左栏贴满一屏」量的才是展开态；
  高度照旧 720，几层按高度算的判据不动。
- **窗口窄就是抽屉，这是厂商那一条断点，不是本层能钉的**：1280×720 实测框 980，`<aside>` 宽 0、
  链接全在 DOM 里但 `hidden`，正文顶上多一颗「打开菜单」。要在窄窗口里也常开，只能往框内那份
  文档覆写它的断点（跟厂商的响应式打架，而且 980 里再吃掉 288，正文只剩约 690），本层不做。

高度那一条与三层同形（`height: calc(100vh - var(--ifm-navbar-height))`），滚动条长在框内那份文档
上，本层不给 Scalar 那一格定高。判据两句：外层「框占满 navbar 以下那一屏」，框内
「框里左栏贴满那一份文档的一屏」（实测 `<aside>` 的 `top: 0`、`bottom = innerHeight`）。

## 路由与深链：`#tag/orders/POST/orders` 那一段

三条层的 hash 长得不一样，各按各的写法记在这里，别抄：

- Scalar：`#tag/orders/POST/orders` —— 按**标签 + 方法 + 路径**拼，`#` 后面**没有**前导斜杠；
- Redoc：`#/orders/createorder` —— 有前导斜杠，`operationId` 被小写；
- Elements：`#/operations/createOrder` —— 有前导斜杠，`operationId` 原样。

这一串不是洁癖：**多写一个斜段是静默失灵**。实测外层地址写成 `#/tag/orders/POST/orders` 时，
那一段确实送进了框内、框内地址也确实成了那一串，但 Scalar 认不出这个 id，页面停在文档概览上
（标题只剩 2 颗、`scrollY` 一直是 0），控制台一个字都不报。

两个方向各走一条路，因为它们要绕过的坑不一样：

- **框内 → 外层**：听配置里的 `onSidebarClick`（`scalar-ui.tsx`）。框里点一条接口走的是
  `history.pushState`，它**不触发** `hashchange` —— 与 `theme-redoc` / `theme-stoplight` 实测到的
  同一格，所以这一层不听事件、听回调。
- **外层 → 框内**：共享层收到那一段就写本份文档的 `location.hash`。这一步**会**触发
  `hashchange`，而 Scalar 只在挂载那一次读地址、另外只听 `popstate`，所以 `scalar-ui.tsx` 把前者
  转成后者（`new PopStateEvent('popstate')`）。这一转不成环：Scalar 自己写历史用的是
  `pushState` / `replaceState`，两条都不触发 `hashchange`。

能发给别人的是**外层**那条地址（`/scalar-demo#tag/orders/POST/orders`）。hash 段不参与取文件，
整页加载它回 200；iframe 的 `src` 里**不**塞那一段（服务端与客户端要算出同一个字符串），
它靠框里那句 `ready` 换进框内。为什么不是外层在 iframe 的 `load` 事件上推、两侧各推一次的来由，
记在 [`theme/frame-kit` 的 README](../frame-kit/README.md)。

有一条跟着 redoc 那一份搬过来的教训，在 Scalar 这一层换了形状但同样成立：**它拿到坏地址不抛异常**，
而是在正文区打一句 `Document 'api-1' could not be loaded`（实测），页面其余部分照常。判据钉在
「Scalar 没有报那份文档取不到」那一句。

## 收掉的几处 Scalar 自己的东西

七处。口径是：**厂商自己塞的品牌位、跟站点重复的开关、那几件只在本地冒出来的东西收掉；给写文档
和部署这一页的人用的功能收掉，给读文档的人用的不收**。

- **那颗亮暗开关**：配置收的（`hideDarkModeToggle: true`），不渲染，DOM 里没有，所以 e2e 那句
  按数量判。理由见「亮暗模式」。
- **那颗「Ask AI」按钮**：配置收的（`agent: { disabled: true }`）。厂商那一格的判据按顺序是
  配置里 `agent.disabled` 优先 → 本机地址就开 → 配了 `agent.key` 才开，而这一层没有 key，于是
  它也是**只在本地冒出来**的东西（实测收之前：`/scalar-demo` 框里那份文档有 1 颗文案为「Ask AI」
  的按钮，直接打开 `/scalar-view` 也是 1 颗；收之后两处都 0 颗）。它要 `agent.key` 才是在公网上
  能用起来的那一格（厂商判据里那第三路），本层没有那个 key，也不打算把对话交给它。
- **那颗「Test Request」**：配置收的（`hideTestRequestButton: true`，厂商默认 `false`）。收它不是
  因为品牌位，是因为**它真的会把请求发出去**：那一格读的是这份文档自己的 `servers`，任何人点一下
  就从站点的页面上朝那个地址发一条请求，而这一层摆的是一份给别人看的接口文档，凭据与 CORS 都不在
  本层的承诺里。厂商那一路的判据还说明它连累了别的格子：正文里的鉴权选择器与它同源（`Content.vue`
  的 `showAuthSelector` 那句注释写的是 "tied to `hideTestRequestButton`"），所以这一格收掉的是
  「从这一页发请求」整条路。**不收的是看的能力**：填参数、代码示例、下载那份文档照旧。
  e2e 那句按文案认（那颗按钮的文案取自本地化表里的 `content.testRequest: "Test Request"`，
  没有 `data-testid`）。
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
  一颗（那条栏上有一处拷贝入口），框内那份文档里 `.scalar-app` 从 7 颗变成 3 颗（直接打开
  `/scalar-view` 从 9 颗到 5 颗）。工具栏上那颗「生成 SDK」只是它摆的第三次：厂商自己在客户端
  选择器与每条接口的代码示例页脚也渲染同一颗（`ClientSelector` / `Operation` 那两个布局），那两处的
  路收在下面那条里。
- **左栏底部那条「powered by Scalar」署名与 Scalar 那张推广位**：`scalar-ui.css` 里一条
  `display: none !important` 收掉整格。走 CSS 而不是配置是因为配置里**没有这一格**：查过
  `@scalar/types@0.24.0` 那份 `api-reference-configuration` 的 schema，`hide*` 一共七条
  （`hideDarkModeToggle`、`hideDownloadButton`、`hideSearch`、`hideModels`、`hideModelNames`、
  `hideClientButton`、`hideTestRequestButton`），管署名与推广位的一条都没有。
  选择器认的是**它是什么**（装着指向 `https://scalar.com/?utm_source=powered-by` 那条链接的
  `aside` 直接子格），不是 Tailwind 那串 `flex flex-col gap-3 px-3 pb-3` —— 换个版本类名就重排。
  收的是那一整格，但**左栏整格不收**：`e2e` 里配了一句「左栏那一格还在」。
- **那颗「生成 SDK」**：也是 CSS 收的（`scalar-ui.css` 里 `.generate-sdk-button` 与
  `.selected-client-action` 那一条）。为什么没有配置可走：那颗的判据整个住在代码里
  （`features/generate-sdk/use-generate-sdk.js` 的 `isLocalUrl(window.location.href)`，配一个
  `enabled` 的那一格调用方根本没传），上面那七条 `hide*` 里也没有管它的。于是它是**只在本地冒出来**
  的那一族：实测 `localhost` 起站点时框里有 3 颗（客户端选择器右上角 1 颗 + 接口代码示例页脚 2 颗），
  线上那份 0 颗。收它的另一半理由是它不只是个链接 —— 点下去打开的是它自己那个对话框，会把这份
  文档上传到 `scalar.com`。厂商留的另一条路没有走：文档 `info` 里写 `x-scalar-sdk-installation`
  （`hasRenderableSdks` 认它）也能让那颗就地消失，但它同时把客户端选择器换成「SDK 安装说明」那张卡，
  动的是**这份演示文档的内容与正文一整块**，比收一颗按钮大。

**给读文档的人多摆的一处**：每条接口标题旁那颗 operationId 徽标（`showOperationId: true`，厂商默认
`false`）。抄 curl、生成客户端的人认的就是这一串，这份 `static/openapi.yaml` 三条都有
（`listOrders` / `createOrder` / `getOrder`）。实测它是标题旁 `div.flex.flex-wrap.gap-1` 里的一颗
`div`，e2e 那句按「整段文案正好等于 `createOrder`」认，把代码示例里那几个同样出现的字排除掉。

还有一格是**表态，不改行为**：`telemetry: false`。厂商默认 `true`，但实测这份安装的 1.75.0 里
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
分组洗成两份物理副本，`/stoplight-demo` 在 SSG 阶段报 `ReactContextError`，靠
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
- `Css Minimizer plugin … postcss-calc: Lexical error on line 1: Unrecognized text`，报错的那一处是
  `(50 - l) * infinity` —— 出自 Scalar 那份 `style.css`（这个模式在 `@stoplight/elements` 那边搜不到），
  是 Tailwind 4 那种「自定义属性参与 calc」的写法，postcss-calc 算不动就原样留着。

同一次构建里还有三条 minimizer 告警（`Empty property '--csstools-color-scheme--light'` 与两条
`Invalid font values`）不属于这一格：那个属性名来自 Docusaurus 自带的 postcss 预设，本层那张表里没有它。
另有一条 `[zustand persist middleware] …'mosaic-theme'…` 是 `theme-stoplight` 那层带进来的。

## 局限

- **每条接口在产物里没有自己的 html**。外层地址是真的，但内容仍然只有 `build/scalar-demo/index.html`
  一份，接口那一格是框里客户端渲染出来的。
- **框里那一页对搜索引擎与抓取工具不可见**：iframe 的内容按惯例不算进宿主页面。
- **多出来的那 359 KB 样式表每一页都下载**（见「样式」一节）。这一格是实测的净增，不是猜测。
- **站点那一列窗口窄的时候会挤**：命中页与 redoc、stoplight 一样保留站点的文档侧栏（300px），
  而 Scalar 的左栏要**框**宽 ≥1024 才展开 —— 视口 1280 时框只有 980，整套 API 导航收成一颗
  「打开菜单」抽屉。量法与那一档断点见「宽度」一节。
- **正文区是按需挂载的**：视口之下还没滚到的那几节不在 DOM 里（默认那一页，认布局根里可见的
  `h1`–`h4` 数，实测同一时刻 1440×720 是 2 颗、1440×900 才是 5 颗；整页直达深链那一份，可见的
  标题四颗，加高到 900 也不多那一节）。e2e 那句整页直达的判据因此只钉到地址里那条接口为止。
- **`#` 归 Scalar 用**：站点常规那种「正文里某个小标题的锚点」在这一页上不成立。
- **`/scalar-view` 会进站点地图**：`addRoute` 注册的路由在 Docusaurus 眼里就是一条页面，实测
  `build/sitemap.xml` 里有它。缺 `src` 时那一页整屏空白，被索引到也没有内容可展示。
- **亮暗模式只有一个来源**：框内那份文档自己不再判断。直接打开 `/scalar-view?src=…`（没有外层
  送值）时那一格停在加载时内联脚本写下的那份，之后不跟站点开关。
- 站点根目录得真的有 `static/openapi.yaml` 那种本站可读的 spec；外网 spec 要另配 CORS。

## 状态：已接入站点，浏览器里那两份文档都真渲染

`docusaurus.config.mjs` 的 `plugins` 里排在最后（层栈最外），站点根的 `package.json` 声明了
`"@show-docs/docusaurus-theme-scalar": "workspace:^"`。`pnpm build`、`pnpm verify:chain` 与
`pnpm test:e2e` 都绿（16 条用例，四条是这一层的），层栈里能看到 `theme/theme-scalar/theme`。

已实测到的（都在 `test/e2e/features/scalar.feature` 那四条用例里）：

- 外层：`build/scalar-demo/index.html` 里是 `<iframe class="scalar-frame"
src="/scalar-view?src=%2Fopenapi.yaml">`；这一页没有 `<article>` 正文外壳、`.scalar-app` 0 个、
  没有 Scalar 渲染出来的文字，`.container` 的内边距是 0，框的上沿贴着 navbar
  下沿、下沿贴着视口，框宽 1140（1440 视口减掉站点那 300 的文档侧栏，它在这一页照常摆着）。
- 框内：Scalar 的布局根（`.scalar-app.scalar-api-reference`）在、左栏三个接口 `#tag/orders/GET|POST/orders…` 都在（**默认就是展开的**，
  不像 redoc / stoplight 要先点分组）、点新建订单时详情换成它**并且外层地址栏那一段跟着换**（这一句
  同时钉住框内 → 外层那条消息）；左栏 `<aside>` 上沿贴 0、下沿贴满那份文档的底；它那颗亮暗开关
  不在（0 颗 `aria-label*="Set "`）、那条开发者工具栏也不在（0 颗 `.api-reference-toolbar`）、
  那颗「Ask AI」也不在（0 颗文案为「Ask AI」的按钮）、那颗「Test Request」也不在（0 颗文案含
  Test Request 的按钮），左栏底部那一颗是 `a.open-api-client-button`（1 颗）而不是 MCP 那两颗
  （0 颗带 MCP 字样的按钮或链接）、接口标题旁那颗 `createOrder` 徽标在，
  署名那一格 `display: none` 而左栏整格还在、那 3 颗「生成 SDK」也各是 `display: none`
  （先钉两种形状在 DOM 里认得出来，再判看不见）；17 颗代码块复制
  按钮都还在（按 `Copy` 与「复制」两种文案一起认，见「界面文案」）；界面是简体的（实测左栏那排是
  「简介」「打开搜索」「下载 OpenAPI 文档」）；全程没有运行期错误。
- 深链：整页加载 `/scalar-demo#tag/orders/POST/orders`，托管侧回 200，框里把那条接口摆出来
  （直达那一份清单钉到 `新建订单` 为止，原因见「局限」里按需挂载那一条）。
- 亮暗：操作系统按深色打开这一页，站点仍是亮色、框内 `<body>` 上也是 `light-mode`（这一格现在由
  `forceDarkModeState` 钉住，同源 `localStorage` 里那条 `colorMode` 也压不动它）；操作系统换回
  亮色再重载，框内配色**不动**（那一格的读数还是同一个）；站点切成暗色，`--scalar-background-1`
  从 `#fff` 翻过去**而且那份文档没重新加载**（`performance.timeOrigin` 没换数）；再拿同一批站点
  属性在暗色下把这一页与主页各量一遍，值相同。
- 框内那条地址独立打开：带 `src` 就渲染（也没有站点的 navbar），`src` 去掉就什么都不摆
  （`.scalar-app` 0 个，那句 `could not be loaded` 也不出现）。
- 产物体积：Scalar（连 Vue）落在懒加载 chunk 里（实测 `assets/js/2386.*.js`，3.8 MB 上下），
  主页那份 html 不引它；样式表那 359 KB 是全站一份，见「样式」。

没实测到的：AsyncAPI / GraphQL 那两种入口没试；Scalar 的 `hideModels` 那一类配置项没有逐条验，
本层只用了 `agent`、`darkMode`、`forceDarkModeState`、`hideDarkModeToggle`、
`hideTestRequestButton`、`localization`、`mcp`、`onSidebarClick`、`showDeveloperTools`、
`showOperationId`、`telemetry`、`url` 这十二格。其中每一条都对着 `@scalar/types@0.24.0` 那份
`api-reference-configuration` 的 schema 与装好的 `@scalar/api-reference@1.75.0` 里读它的那一处核过，
不是照着别的版本的文档抄的。
