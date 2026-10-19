# theme/theme-redoc

主题包：md 的 frontmatter 写 `redoc: <URL>` 时，该文档页整页换成
[Redoc](https://github.com/Redocly/redoc) 渲染的 OpenAPI 文档。

形状与 [`theme-stoplight`](../theme-stoplight/README.md) 是一对一的（入口声明层目录、
层里的 `DocItem` 判 frontmatter、组件只在浏览器端渲染），差的三处是：这一格要补的 Node 侧
依赖不一样、**样式圈定发生在运行期而不是构建期**、以及它自带一个路由，本层把它钉成 hash（都见下）。

## 组成

| 文件                              | 编译吗              | 职责                                                                                                                                                                                                         |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.mts`                   | ✅ `src/` → `dist/` | 入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算就是 `../theme`），加 `configureWebpack()`                                                                                                           |
| `theme/DocItem/index.tsx`         | ❌ 站点编译         | 层里的组件：命中 `redoc` 时整页换成 `RedocUI`，没命中就交回下层 `DocItem`                                                                                                                                    |
| `components/redoc-ui.tsx`         | ❌ 站点编译         | 只在浏览器端渲染 `RedocStandalone`（SSR 阶段返回 `null`），外面套一层 `HashRouter` 与一层 `StyleSheetManager`；`url` 走 `specUrl`，`data` 走内联文档                                                         |
| `components/redoc-style-scope.ts` | ❌ 站点编译         | 交给 `StyleSheetManager` 的 styled-components 编译中间件：把 Redoc 运行期注入的裸标签选择器与 `:root` 里的真属性圈进 `.redoc-root`，并把它的暗色表改挂到站点的 `data-theme` 上（见「样式」「亮暗模式」两节） |
| `components/redoc-ui.css`         | ❌ 站点编译         | 本包自己那部分版式：用 `:has()` 让正文容器去掉内边距与最大宽度，以及收掉 Redoc 那颗自己的亮暗切换按钮（高度为什么不写在这里，见「高度」一节）                                                                |
| `module-aliases.d.ts`             | 类型                | 引官方 `@docusaurus/module-type-aliases`，给 `useIsBrowser` 与 `*.css` 这些构建期才存在的 import 补类型                                                                                                      |
| `tsconfig.build.json`             | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                                                                                                                                       |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

## 怎么用

```md
---
title: 订单 API
redoc: /openapi.yaml
---
```

命中时本层**不包下层 `DocItem`**（与 theme-stoplight 同一位置，与 `theme-iframe` 那层不同），
所以那一页不会有文档正文外壳、也不会再有导图。要「其它页照常、这页是 API 文档」就是这个位置。

## 浏览器 bundle 要补的那一格 Node 侧依赖

`redoc` 发的是**打好的 ESM 包**（`bundles/redoc.js`），不是散着的源码，外面那层 webpack 仍要按
静态分析解析它里面的每一条 `require`。它有一支 Node 分支，先判 `typeof module !== 'undefined'`，
真的一侧去 `new (require('worker_threads').Worker)(…)`，假的一侧 `import('worker_threads')`。

浏览器里那个条件为假、跑不到，但**解析这一步照样红**：`Module not found: worker_threads`。
补法是客户端那一遍在 `resolve.fallback` 里给 `worker_threads: false`（空模块），服务端原样返回 ——
SSG 跑在 Node 里，那模块本来就有。

> 这里选 `false` 而不是 polyfill，与 theme-stoplight 那边给 `url` / `buffer` 配**真** polyfill
> 并不矛盾：那两个是「按 URL 取 spec」这条路上真会执行到的代码，置空会在运行时抛；
> `worker_threads` 那支是给「离线把文档再算一遍」用的，本仓这条路径不碰它，补个 polyfill
> 只是把浏览器 bundle 撑大一圈。

> 同款坑：`configureWebpack()` **只返回自己新增的那一格**，不能改完整个 config 再返回去。
> 细节记在 [`theme-stoplight` 的 README](../theme-stoplight/README.md) 末尾与
> `plugins/plugin-prev-layer-resolver` 的 README。改了它要 `pnpm clear` 再 `pnpm build`：
> webpack 的持久化缓存不认配置函数的改动。

## 样式：构建期圈不住，改在运行期圈进 `.redoc-root`

theme-stoplight 用 `configurePostCss()` + `postcss-prefixwrap` 把第三方全局样式圈进
`.stoplight-root`，靠的是那份 CSS 是**磁盘上的静态文件**、能进 PostCSS 管道。

Redoc 不是：它的样式由 `styled-components` 在**运行时**往 `<head>` 里插一张
`<style data-styled-version>`，构建期产物里根本没有这份 CSS 可供改写。所以圈定发生在
样式生成的那一步 —— `StyleSheetManager` 的 `stylisPlugins`（实现在
`components/redoc-style-scope.ts`，组件里包在 `RedocStandalone` 外面）。这条链是
styled-components 编译每条规则时经过的中间件，能动的有三样：这条规则的选择器列表
（`element.props`）、这条规则里的声明（`element.children`）、以及往外层那个数组里增删规则。

圈定前在外溢什么是量的：把那张表的每条规则真的拿去问 DOM，命中的元素里有 `.redoc-root`
**之外**的、且改的不是 `--*` 那种自定义变量。`redoc@3.0.1` 量出来三条，现在剩一条：

| 选择器    | 圈定前                                    | 现在                                                |
| --------- | ----------------------------------------- | --------------------------------------------------- |
| `button`  | 裸标签，打到 navbar 那个亮/暗切换按钮上   | 变成 `:where(.redoc-root) button`，收进来了         |
| `:root`   | 2882 条变量 + `<html>` 上的底色/字色/字体 | 变量仍留 `:root`，那三条真属性挪到 `.redoc-root` 上 |
| `:root *` | 全局 `box-sizing: border-box`             | **故意不圈**，见下                                  |

上面这三条量的是**站点亮色**下的那张表。同一张表里另有 63 条挂在 `:root.dark` 上的暗色规则，
它们外溢的形式不一样 —— 要等条件命中才生效，所以亮色这一遍扫不出来；单独记在「亮暗模式」一节。

三个决定各有一条实测撑着：

- **前缀必须写成 `:where(.redoc-root)`**。直接写 `.redoc-root button` 会把这条规则的优先级从
  (0,0,1) 抬到 (0,1,1)，抬过去它就压过 Redoc 自己那些 (0,1,0) 的类名规则 —— 等于本层把第三方
  的组件样式改写了。实测过这个错法：右栏那颗 `Copy` 按钮的边框从 `solid 1px` 变成 `none`。
  `:where()` 自身优先级是 0，加上去只收窄范围、不动层叠关系，60 个 Redoc 内部元素的计算样式
  前后一字不差。
- **CSS 变量留在 `:root`，只挪真属性**。Redoc 的下拉、提示、弹窗是
  `createPortal(…, document.body)` 挂到 body 的，不在 `.redoc-root` 里面；变量挪走它们就取不到
  值。留在 `<html>` 上的那 2882 条与站点自己用到的 `var(…)` **零重名**（实测过），
  所以这一格残留是看不见的。
- **`:root *` 与 `html` / `body` 不打前缀**。前者只写一条 `box-sizing: border-box`，站点自己的
  `*` 规则同值（抽样计算样式差为 0），圈它只会让挂到 body 的浮层丢掉 border-box；后两者加前缀
  就变成「`.redoc-root` 里的 html」，永远匹配不到，等于把 Redoc 自己那条规则静默删掉。

`redoc-ui.css` 里**不再**有按回站点按钮的那类规则 —— 它以前靠特异度（`html:has(…) + 类` 是
(0,2,1)）压住裸 `button`，现在由上面的机制代劳，一条属性一条属性追的写法整个删了。

判据在 `test/e2e/features/redoc.feature`，三条一起钉：外溢集合**等于** `{ :root * }`（Redoc
将来多写一条全局规则、或者改了写法让圈定失效，用例就红；这一句量的是站点亮色，暗色那一格见
「亮暗模式」与「局限」）；站点这一侧不受影响（同一批元素在
redoc 页与主页各算一遍 computed style 比相等，不抄站点该有的值）；圈定没把 Redoc 自己改坏
（那条裸 `button` 确实变成了带范围的写法、它自己的按钮边框还在、`--bg-color` 仍在 `<html>` 上
取得到）。

要真隔离还得换路子：把那一页放进 iframe（`theme-iframe` 那层就是干这个的，边界由浏览器给），
或者选一个样式可作用域化的渲染器（theme-stoplight 那份是静态 CSS，所以圈得住）。
`styled-components` 自己还有一个把样式表插进 Shadow Root 的 `target` 选项，Redoc 用不了：
它上面那些 `createPortal` 与 9 处 `document.querySelector` 都按整份文档找元素，
上游从 2021 年起挂着同一个问题（Redocly/redoc#1548）。

## 亮暗模式：配色跟站点的开关走，不跟操作系统的偏好走

Redoc 自带一套亮暗，判据是它自己的：读 `matchMedia('(prefers-color-scheme: dark)')`
（外加它存进 localStorage 的那份 `redoc.colorMode`），把 `light` / `dark` 写到 `<html>` 的
类名上，整套暗色配色挂在 `:root.dark` 打头的选择器上。`redoc@3.0.1` 实测 63 条：330 条变量、
`tag-*` / `card-*` 那些接口配色、滚动条滑块，外有一条真属性 `color-scheme`。

站点也有一个开关，但形状不一样 —— Docusaurus 写的是 `<html data-theme="light|dark">`。
两处各判各的就会打架：**实测「站点亮色 + 操作系统深色」时这一页自己变暗，navbar 还亮着。**

改法就是接着上面那套运行期圈定多做一件事：中间件看见 `:root.dark` 打头的选择器，把它换成
`:root[data-theme="dark"]`（`components/redoc-style-scope.ts` 的 `DARK_PALETTE_PREFIX`）。
三个理由：

- **优先级不动。** 类选择器与属性选择器在优先级里同档（各算 (0,1,0)），`:root.dark` 和
  `:root[data-theme="dark"]` 同为 (0,2,0)，带后代的其余 62 条也一样。跟裸标签那条必须写成
  `:where()` 是同一个道理：本层只换「什么条件下生效」，不动层叠关系。
- **那 330 条变量没有抄。** 抄一份进来就是养两份，Redoc 升版改了取值这边不会知道；改的只是
  这一整套配色的生效条件。
- **挂在站点自己 CSS 用的那个钩子上。** Docusaurus 的暗色规则写的就是
  `html[data-theme=dark] { … }`，同一个钩子意味着 navbar 那颗按钮点下去两边一起翻。反过来，
  站点产物 CSS 里**没有**一条裸 `.dark` 规则（搜过，只有 `.darkNavbarColorModeToggle_*:hover`
  和 `[data-theme-choice=dark] .darkToggleIcon_*` 两种带前后缀的），所以 Redoc 写上去那个类名
  对站点是死的 —— 拿它驱动配色等于把这一页挂在一个站点根本不认识的开关上。

Redoc 左栏底部那颗它自己的切换按钮收掉了（`redoc-ui.css` 里
`[data-testid='color-mode-switcher'] { display: none }`）：配色改由 `data-theme` 驱动之后，
它点下去只改自己那个类名，页面不会有任何反应 —— 一颗按了没反应的按钮，还跟 navbar 上那颗重复。
是 `display: none`，元素仍然在 DOM 里，所以 e2e 那句按可见性判、不按数量判。

实测（924×793 那扇窗口）：`<html>` 上是 `data-theme="dark"` 时，`.redoc-root` 的底色
`rgb(34, 36, 43)`、`--bg-color` 是 `#22242b`；翻回亮色是 `rgb(255, 255, 255)` / `#ffffff`。
翻完之后那张表里 `:root.dark` 打头的剩 0 条、`:root[data-theme="dark"]` 63 条。

判据是 `test/e2e/features/redoc.feature` 的第三条用例「亮暗模式跟站点走，不跟操作系统走」：
先用 `emulateMedia({ colorScheme: 'dark' })` 打开这一页（要在加载前定下来，Redoc 是渲染时读
`matchMedia` 的），钉「系统深色、站点亮色」这一格里页面仍然是亮的，同时 `<html>` 上确实带着
Redoc 写的那个 `dark` 类 —— 类名在、配色却是站点这一头的，才证明驱动的已经不是它。
再把站点切成暗色，钉这一页的底色真的翻过去。两句都不抄色值，比的是「换操作系统偏好时值不变、
换站点模式时值变」。最后一句把站点自己那几处样式在**暗色下**也照「两个页面各算一遍 computed
style 比相等」量一次（含 `<html>` 上的 `color-scheme`，实测与主页同值）。

## 高度：不给这一格定高，navbar 那一截报给 Redoc 自己

本包的 CSS 里跟排版有关的只有一条：`.container:has(.redoc-root)` 去掉正文容器的内边距与最大宽度，
否则 Redoc 那三栏布局被 Bootstrap 式的 `max-width` 挤在中间。
（stoplight 那层还有一条 `+ .footer` 的规则，这一层没抄 —— 本站 `themeConfig` 里没写
`footer`，那个元素根本不渲染，规则是死的。）

**没有第二条给 `.redoc-root` 定高的规则，是故意的**，虽然 stoplight 那层有。两家排版模型不一样：
Stoplight Elements 自带内层滚动，塞进一格固定高度里就行；Redoc 按「整页跟着文档滚」排版 ——
它的左栏是一条 sticky，高度写的是 `calc(100dvh - var(--navbar-stack-height))`，
停靠位写的是 `top: var(--navbar-stack-height)`，正文里每个分节的
`scroll-margin-top` 也从这条变量取值。

而 `--navbar-stack-height` 是 Redoc 自己在渲染时算的：它读 `options.scrollYOffset`
（类型上就是 `() => number`，「上面被占掉多高」），把返回值同时写成容器上的
`--navbar-height` 与 `--navbar-stack-height`。本层以前没传这个函数，实测那两条行内变量就是
`0px` —— 于是左栏按「上面什么都没有」铺满一整屏（924×793 的窗口里 793px），
比这一页真正空出来的那一格（navbar 以下 733px）高出 navbar 那一截。

上一版还叠了另一处错：`.redoc-root` 定高 `calc(100vh - var(--ifm-navbar-height))` 加
`overflow: hidden`。两个后果：

- 里面那层 `> div` 的 `height: 100%` 根本压不住 Redoc 自己的 `min-height: 100vh`
  （CSS 里 `min-height` 赢过 `height`），那一格还是 793px；
- 定高加 `overflow: hidden` 凭空造出一层滚动容器，点接口、以及整页直达那条深链时，
  Redoc 滚的是**这一格**而不是文档 —— 实测它的 `scrollTop` 停在 502，左栏整条往上跑出可视区，
  navbar 以下只剩一片底色（就是「高度没顶满」那个观感）。

现在改成：这一层让 Redoc 占住文档流，navbar 那一截由 `scrollYOffset()` 量出来报给它
（取 `.navbar` 那个元素的实际高度，不抄 `--ifm-navbar-height` 的数值 —— navbar 换行时前者才准）。
实测同一扇窗口（924×793，navbar 60px）：左栏 733px、上沿贴着 navbar 下沿、下沿正好在视口下沿，
底部那条「API docs by Redocly」跟着落回屏内；点接口时滚的是文档，落点也不会被 navbar 盖住。

判据在 e2e 那句「左栏占满 navbar 以下那一屏」：上沿差、下沿差各留 1px 容差，
再加一句 `.redoc-root` 的 `scrollTop` 必须是 0（它不该是滚动容器）。两条用例都钉 ——
深链那一条才是当初真正翻车的场景。

## 路由：本层钉成 hash

Redoc 3 是**支持 hash 路由**的，只是不在我们用的那个入口上。它有两扇门：

- `init()` / `hydrate()`（`redoc/bundles/redoc.standalone.js` 的出口）收 `InitOptions`，
  里面有 `router?: 'hash' | 'history'`，**默认就是 hash**；
- `RedocStandalone`（React 入口，本层用的这个）类型上**没有** `router` 这一格。它内部那个
  `withRouter` 是「外面已经有路由 context 就用外面的，没有才自己造一个」，而自己造的那个在
  浏览器里是 `BrowserRouter`（打好的包里写的是 `typeof window < 'u' ? BrowserRouter : MemoryRouter`）——
  所以直接用它就得到一份按路径的路由。

本层走的是**在外面套一层 `HashRouter`**：`react-router` 用的是 `redoc` 自己那份（同一个模块实例，
本包 `package.json` 里已经声明 `"react-router": "^7.18.4"`），这样它那句 `useInRouterContext()`
才认得到、不会再造一个 `BrowserRouter`。没选 `init()`：它绕开 React 树自己 `createRoot`，
拿不到站点那一层的 context，而且从 `bundles/*` 进来的文件里有动态 `require`，
webpack 在客户端和服务端两遍都报 `Critical dependency: the request of a dependency is an expression`。

换成 hash 之后 `basePath` 也不用传了：hash 段自己就是一份完整地址（`#/orders/createorder`），
与这一页挂在站点哪一处无关，`RedocStandalone` 默认的 `/` 就对。

有一条老教训跟着换了对象但依然成立：**Redoc 认不出当前地址时一个字都不报**，而是把**它自己那份
404** 摆在正文区 —— 左栏、搜索框、样式全在，页面看着完全正常，中间写着 `No page at this address`。
判据钉在 e2e 的那句「Redoc 自己的 404 没有出现」。

## 深链：地址里的 hash 指哪条接口

点左栏那条接口，地址变成 `/redoc-demo#/orders/createorder`（Redoc 把 `operationId` 小写进地址）。
**这条能直接发给别人**：hash 段不参与取文件，浏览器请求的还是 `/redoc-demo` 那份 html，
产物里有它，所以 `pnpm serve` 回 **HTTP 200**；页面加载完，Redoc 自己读 hash 把那条接口摆进正文区。
一处不一样：整页直达时它**从地址指的那一格往下铺**，正文里的标题清单比「先打开页面再点下去」少两条
（只有 `列出订单`、`新建订单` 这两个 `h2`，API 标题与分组那两条不在）。那是 Redoc 自己的路由行为，
不是本层丢了内容，所以 e2e 两条用例各钉各的清单，没有共用一句判据。

## 局限

- **每条接口在产物里没有自己的 html**。地址是真的，但内容仍然只有 `build/redoc-demo/index.html`
  一份，接口那一格是客户端渲染出来的 —— 爬虫、按状态码判活的监控看到的是页面本身，不是那条接口。
- 这一页的 `#` 归 Redoc 用：站点常规那种「正文里某个小标题的锚点」在这一页上不成立
  （本页整页交给 Redoc，本来也没有那种锚）。
- 按路径的那一版地址（`/redoc-demo/orders/createorder`）现在退回站点自己的 404 页 ——
  实测 `pnpm serve` 对它回 404 加官方「找不到页面」。那种形状从没进过提交，也没有发出去的链接
  要照顾，所以这里不做「路径 → hash」的翻译。
- 顺带记一条查证过的 Docusaurus 形状，真要接住一个产物里没有的路径时用得上：「地址找不到」
  有**两个**出口，而只有一个经过 `@theme/NotFound`（客户端路由一条都没匹配上时，`ComponentCreator('*')`
  渲染它）。另一条是匹配到文档那棵树的根、底下却没有这一页 —— 官方 `theme-classic` 的 `DocRoot`
  拿不到当前文档元数据时**直接**渲染 `NotFound/Content`，它源码注释写着「只渲染内容，免得套两层外壳」。
  所以要覆写就覆写 `NotFound/Content`，覆写 `NotFound` 会漏掉后一个出口。
- Redoc 那 2882 条 CSS 变量仍然定义在 `<html>` 上，运行期圈定**故意**留着它们：它挂到
  `body` 的浮层要靠继承取值（详见「样式」一节）。看得见的属性已经挪进 `.redoc-root`，
  这批变量与站点自己用到的 `var(…)` 实测零重名。
- 亮暗模式改挂到 `data-theme` 之后，Redoc 自己那套判定**照跑不误**：它仍然按操作系统的偏好往
  `<html>` 的类名上写 `light` / `dark`，仍然往 localStorage 存一份 `redoc.colorMode`。
  这两样对本页现在是死的（配色不看类名，站点也没有裸 `.dark` 规则），只是留在 DOM 与
  localStorage 里。哪天 Redoc 改了判据、让那个类名参与别的规则，这一页的配色就会重新和站点
  脱钩 —— 用例「站点的亮暗模式不受操作系统影响」钉的就是「类名确实在、配色却是站点这一头的」，
  跑偏会红。
- 同理，「外溢集合等于 `{ :root * }`」那一条是在**站点亮色**下量的。站点一进暗色，改挂过去的那
  63 条命中的就是 `<html>` 本身，里面除变量外还有一条真属性 `color-scheme`；这一格的后果由
  「站点自己的那几处样式在暗色下也不被 Redoc 改写」那一句按值量（站点自己写的也是 `dark`，同值）。
- `scrollYOffset` 是**渲染时**量一次 navbar 的高度，不是监听出来的：窗口缩放后 navbar 换了行
  （高度变了），这一格要等 Redoc 下一次重渲染才跟上。本站的 navbar 不会换行，所以没为它加监听。
- 站点根目录得真的有 `static/openapi.yaml` 那种本站可读的 spec；外网 spec 要另配 CORS。

## 状态：已接入站点，浏览器里那一页真渲染

`docusaurus.config.mjs` 的 `plugins` 里排在最后（层栈最外），站点根的 `package.json` 声明了
`"@show-docs/docusaurus-theme-redoc": "workspace:^"`。`pnpm build`、`pnpm verify:chain` 与
`pnpm test:e2e` 都绿，层栈里能看到 `theme/theme-redoc/theme`。

已实测到的（都在 `test/e2e/features/redoc.feature` 那几条用例里）：`redoc` 进了懒加载 chunk
（`assets/js/460.*.js`，2 MB 上下；没命中 `redoc:` 的页面不下载它）、`/openapi.yaml` 取到了、
左栏三个接口点开就在导航里、点新建订单时详情面板换成它、这一页没有 `<article>` 正文外壳、
`.container` 的内边距是 0、左栏占满 navbar 以下那一屏、外溢经过运行期圈定只剩 `:root *` 那一条、
Redoc 那颗自己的亮暗按钮看不见，全程没有运行期错误。
另一条用例走的是**深链**：整页加载 `/redoc-demo#/orders/createorder`，托管侧对它回 200，
上面那几步（换成 Redoc、容器不留白、详情对得上）在产物里同样成立。
第三条走的是**亮暗模式**：操作系统按深色打开这一页，页面仍是亮色（`<html>` 上那个 Redoc 自己写的
`dark` 类确实在）；站点切成暗色，这一页的底色跟着翻过去；再拿同一批站点属性在暗色下把这一页与
主页各量一遍，值相同。

顺带记两处不报错的形状：SSR 那一遍本层返回 `null`，所以 `build/redoc-demo/index.html` 里
这一格是空的；`pnpm build` 时控制台会冒一句
`[zustand persist middleware] … 'mosaic-theme' … does not contain a 'removeItem' method` ——
那是预渲染阶段加载 Redoc 模块时它自己的 store 在抱怨，不影响产物，也不是本仓的代码。

没实测到的：`data`（内联文档）那一支只过类型，浏览器里没跑过（示例页走的是 `url`）；
AsyncAPI / GraphQL 那两种 `specType` 没试。
`data` 那一支留着不删的理由是**与兄弟层对齐**：[`theme-stoplight` 的组件](../theme-stoplight/components/stoplight-ui.tsx)
是同一形状的 `Props`（`url` 与 `data` 二选一），那一支同样没有浏览器用例。两条层的取舍应当一样，
要删就一起删、要补用例就一起补，别只动一个。
