# theme-redoc 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、为什么换成一份独立文档、样式与亮暗那两格在
Redoc 这一层怎么做到的、各处实测到的数字与取值。使用者要看的（怎么触发、能分享的地址长什么样、
有哪些局限）在 [`README.md`](../README.md)，这里不重复。

源码注释里那些「理由见包 README『…』一节」的指针，落在本节这些章节上的已经改指这份文件。

## 组成

| 文件                             | 编译吗              | 职责                                                                                                                                                                                                                  |
| -------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                  | ✅ `src/` → `dist/` | 入口：调 `@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts` 那份工厂一次，拿层目录、`/redoc-view` 的注册与 Plugin 形状；本包的 webpack 差异经 `configureWebpack` 交给它（补 `worker_threads` 空模块，见下） |
| `theme/RedocPage/index.tsx`      | ❌ 站点编译         | **框内**那一页：调 theme-iframe 那份框内工厂（`lib/api-frame-view.tsx`）交三格 —— 包名、`RedocUI`（`loadView` 按需取，见「首屏不下载渲染器」）、亮暗的属性名                                                          |
| —— 外层那一格                    | ——                  | **本包没有外层 CSS**：框的尺寸与正文容器让位由 theme-iframe 那份共用的 `components/api-frame.css` 管（见「高度」一节）；`redoc-frame` 只剩类名，用来认「这一格是哪一层赢的」                                          |
| `components/redoc-ui.tsx`        | ❌ 站点编译         | 浏览器端渲染 `RedocStandalone`（只收地址那一种入参），外面套 `HashRouter` 与 `StyleSheetManager`；`LocationMirror` 把路由变化报给外层                                                                                 |
| `components/redoc-color-mode.ts` | ❌ 站点编译         | 交给 `StyleSheetManager` 的编译中间件：把 Redoc 挂在 `:root.dark` 上的那套暗色表改挂到 `<html data-redoc-mode="dark">` 上（见「亮暗模式」一节）                                                                       |
| `components/redoc-ui.css`        | ❌ 站点编译         | 生效在框内那一页：收掉 Redoc 自己的三处东西（它那颗亮暗切换按钮、左栏底部的 Redocly 署名、章节标题旁那一整格操作按钮）。高度为什么不写在这里，见「高度」一节                                                          |
| `tsconfig.build.json`            | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                                                                                                                                                |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

跨 iframe 的那一套（外层套壳、地址怎么拼、三条消息的形状、来源校验、两侧的监听）**不在本包**，
在 `@show-docs/docusaurus-theme-iframe`：外层归它的 `DocItem` 与 `components/api-frame.tsx`，
约定归 `lib/`（口径见 [`iframe-protocol.md`](../../theme-iframe/docs/iframe-protocol.md)）；本包交出的只有注册表里那个命名空间、iframe 那一格自己的尺寸，
以及「值送到框内之后落到哪条属性上」这一格。为什么两侧各推一次消息、为什么框内 → 外层不听
`hashchange`、为什么外层写地址用替换而不是新增，那几条理由记在共享层的文档，这里不抄第二遍
—— 只有**在 Redoc 这一层实测到的形状**留在下面「深链」一节。

## 两份文档各放什么

|                | 外层：站点的文档页（`/theme-redoc/docs/redoc-demo`）                                        | 框内：本包那条页面（`/redoc-view?src=…`）          |
| -------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 本层放的东西   | 一个 `<iframe class="api-frame redoc-frame">`（由 theme-iframe 的 `ApiFrame` 按注册表渲染） | `RedocUI`，即 `.redoc-root` 那一格                 |
| Redoc 的运行时 | 不加载，一行都没有                                                                          | 全在这里                                           |
| 样式表         | 站点的产物 CSS                                                                              | 站点的产物 CSS + Redoc 运行期那张表                |
| 亮暗模式       | 站点的 `<html data-theme>`，开关在这                                                        | 自己 `<html>` 上的 `data-redoc-mode`，值由外层送来 |
| 能分享的地址   | 有，`#` 那一段代表当前那条接口                                                              | 有，但那是「直接打开框里那一页」，见下面「深链」   |

## 首屏不下载渲染器

`redoc` 与 `styled-components` 只在框内这一页**起来之后**才下载：`theme/RedocPage/index.tsx` 交给
框内工厂的是 `loadView: () => import('../../components/redoc-ui.tsx')`。实测（`pnpm build` 之后按
chunk 依赖图算）：

- `/redoc-view` 首屏 **0.39 MB**
- 起来之后按需下载 **2.02 MB**（`redoc` 那一份）

`redoc-ui.css` 随 `redoc-ui.tsx` 一起进按需那一路。本层此前就不在首屏上带 Redoc（`redoc` 的入口在
Docusaurus 那条路由里本来就是异步的），这一改动的是**什么时候开始下**：从「路由一进就下」变成
「框内那页起来、真渲染时再下」。

框里那一下会先空着：那条 `import()` 在 effect 里，不是 `React.lazy`，所以没有 `Suspense` 兜底。
共同口径记在 theme-iframe 的 `docs/iframe-protocol.md`「首屏不下载渲染器」一节。

## 为什么要换一份文档

上一版是 Redoc 直接渲染在文档页里，靠运行期圈定把它的第三方样式收进 `.redoc-root`。圈定能收的
只有「一条规则打到哪些元素」这一层，收不到的有两处：Redoc 那 2884 条 CSS 变量仍然定义在
`<html>` 上（它的浮层要靠继承取值），`document.querySelector` 与 localStorage 也仍然由它按
整份文档来用。

iframe 的边界是浏览器给的，不是靠枚举规则拼出来的：框里那份文档里的样式、变量、localStorage、
路由，站点的文档页一行都碰不到。**边界立起来之后，圈定就没有对象可圈了**：框内那份文档整份就是
给 Redoc 的（没有 navbar、没有 footer、没有正文容器），它那些裸标签与 `:root` 上的真属性打到的
都是它自己的元素，站点这一侧一行都收不到。所以那两条圈定规则随改造一起删了，见「样式」一节。

## `/redoc-view` 这条路由怎么注册

`/redoc-view` 是本包入口经 theme-iframe 那份工厂（`lib/api-frame-theme.mts` 的 `contentLoaded`）
用 `actions.addRoute()` 注册的一条插件路由，路由名与组件别名都写在 theme-iframe 的注册表里，
组件是 `@theme/RedocPage`（走层栈解析，与本包其它 `@theme/` 覆写同一个口径），`exact: true`。
构建产物里真的有一份 `build/redoc-view/index.html`，所以 `pnpm serve` 对它回 200。

收拢前路径名在 `src/index.mts` 与 `components/redoc-frame-sync.ts` 里各写了一份常量（两边站在
编译边界两侧，共享不了，改要一起改）；现在注册表那一份源码两侧同引，**只剩一处**。

## 同源，但每条消息仍然校验

框里那一页是站点自己的一条路由，和外层同一个源，`src` 由本包自己拼，本来不存在跨源信任问题。
每条消息还是要过 origin 与来源窗口那两格（共享层的 `isTrustedMessage`）：防的是「别人往这一页
postMessage」时不被当成自家消息，而不是防自己。`/redoc-view?src=…` 是条公开地址，任何人都能
手工拼一条，所以取 spec 那一段只认能解析成 `http:` / `https:` 的（共享层的 `specUrlFromSearch`），
拿不到就整格什么都不渲染。这两格与亮暗、地址那两条
监听一道住在 [`packages/theme-iframe/lib/`](../../theme-iframe/docs/iframe-protocol.md)，三条层共用同一份。

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
> 细节记在 [`theme-stoplight` 的维护者文档](../../theme-stoplight/docs/internals.md) 的「样式」一节与
> `packages/plugin-prev-layer-resolver` 的 README。改了它要 `pnpm clear` 再 `pnpm build`：
> webpack 的持久化缓存不认配置函数的改动。

## 样式：Redoc 那张运行期注入的表不外溢，靠的是文档边界

[`theme-stoplight`](../../theme-stoplight/docs/internals.md) 那一条层要在构建期动手，因为 Elements 的样式是
**磁盘上的静态文件**，会被并进全站那一份 css bundle，iframe 拦不住它。Redoc 不是：它的样式由
`styled-components` 在**运行期**往它自己那份文档的 `<head>` 里插一张
`<style data-styled-version>`，构建期产物里根本没有这份东西，站点那一份 css 里一条都没有。
所以渲染挪进 `/redoc-view` 之后，本层在样式这一格一行代码都不剩 —— 边界就是文档边界。

本层曾经补的是**运行期圈定**：在 `StyleSheetManager` 的 `stylisPlugins`（styled-components
编译每条规则时经过的中间件链）上，给裸标签选择器加 `:where(.redoc-root)` 前缀、把 `:root` 里
那三条真属性（底色、字色、字体）挪进 `.redoc-root`。**这两条已经删了**，因为渲染挪进
`/redoc-view` 之后它们没有对象可圈：

- 外层那份文档（站点的 `/theme-redoc/docs/redoc-demo`）里根本没有这张表 —— 实测 styled 表 0 张、`.redoc-root`
  0 个、Redoc 渲染出来的文字也不在这份文档里。Redoc 的运行时压根不在这页上加载。
- 框内那份文档整份就是给 Redoc 的：`theme/RedocPage/index.tsx` 就是 theme-iframe 那份框内工厂
  造出的一页，
  没有 navbar、没有 footer、没有正文容器。Redoc 那些裸 `button` 与 `:root` 上的真属性打到的
  都是它自己那一屏，「不外溢」在这份文档里不是一个需要防的事。

删掉之后实测（框内那份文档，站点亮色）：那张表 427 条样式规则、裸 `button` 那条原样是
`button`（不再是 `:where(.redoc-root) button`）、`:root` 的底色/字色/字体就落在那份文档的
`<html>` 上（`--bg-color` 实测 `#ffffff`，切暗色后翻成 `#22242b`）。Redoc 自己那颗 `Copy`
按钮的边框仍是 `solid 1px` —— 这一格以前要靠「前缀必须写成 `:where()`」才不被动坏，现在
本层不碰它的选择器，这条判据也就没有对象了。

那条中间件链上**只剩一件事**：把 Redoc 挂在 `:root.dark` 上的那套暗色表改挂到框内那份文档自己的
`<html data-redoc-mode="dark">`（值由外层送来）。它防的不是外溢，而是「同一页上两个亮暗开关打架」，
实现在 `components/redoc-color-mode.ts`，理由与实测记在下一节「亮暗模式」。

判据两句，都在 `test/e2e/features/redoc.feature` 第一条用例里：「外层文档里没有 Redoc 的
痕迹」（按 styled 表张数、`.redoc-root` 个数、有没有 Redoc 的文字三项钉）与「站点自己的那几处
样式不被 Redoc 改写」（同一批元素在 redoc 页与主页各算一遍 computed style 比相等，不抄站点该有
的值）。曾经那两句「框内那份文档外溢到站点元素的只剩那一条」与「圈定没有把 Redoc 自己的样式压掉」
随圈定一起删了 —— 它们钉的是圈定的效果，效果没了，判据留着就只是在钉一个不存在的机制。

Redoc 自己也不能把样式作用域化：`styled-components` 有一个把样式表插进 Shadow Root 的 `target`
选项，但 Redoc 上面那些 `createPortal` 与 9 处 `document.querySelector` 都按整份文档找元素，
上游从 2021 年起挂着同一个问题（Redocly/redoc#1548）。本层不再需要这个能力 —— 需要的是
「换一个宿主文档」，那就是 `/redoc-view`。

## 亮暗模式：配色跟站点的开关走，不跟操作系统走

Redoc 自带一套亮暗，判据是它自己的：读 `matchMedia('(prefers-color-scheme: dark)')`
（外加它存进 localStorage 的那份 `redoc.colorMode`），把 `light` / `dark` 写到 `<html>` 的
类名上，整套暗色配色挂在 `:root.dark` 打头的选择器上。`redoc@3.0.1` 实测 54 条选择器、
501 条声明：其中 499 条是变量（含 `:root.dark` 那一格的 330 条），真属性两条 ——
`<html>` 上的 `color-scheme` 与滚动条滑块的 `background-color`。

站点也有一个开关，但形状不一样 —— Docusaurus 写的是 `<html data-theme="light|dark">`。
两处各判各的就会打架：**实测「站点亮色 + 操作系统深色」时这一页自己变暗，navbar 还亮着。**

改法就一条：运行期那条中间件链（`StyleSheetManager` 的 `stylisPlugins`）看见 `:root.dark` 打头的
选择器，把它换成 `:root[data-redoc-mode="dark"]`（`components/redoc-color-mode.ts` 的
`DARK_PALETTE_PREFIX`）。圈定删掉之后，这条链上只剩这一件事 —— 它改的是「什么条件下生效」，
不是「打到哪些元素」。三个理由：

- **优先级不动。** 类选择器与属性选择器在优先级里同档（各算 (0,1,0)），`:root.dark` 和
  `:root[data-redoc-mode="dark"]` 同为 (0,2,0)，带后代的其余 53 条也一样。本层只换生效条件，
  不动层叠关系，Redoc 那些规则之间的先后照旧。
- **那 499 条变量没有抄。** 抄一份进来就是养两份，Redoc 升版改了取值这边不会知道；改的只是
  这一整套配色的生效条件。
- **驱动它的那个值只有一个来源。** 站点自己那个开关写的是 `<html data-theme>`，而这一页现在
  在**另一份文档**里；框内那份文档 `<html>` 上那条 `data-theme` 只是加载时内联脚本按当时的
  localStorage 写死的一份，之后没人维护（见下一小节）。所以本层自己开一条属性，值由外层送进来
  —— 送进来的就是站点当前那一格，两边不会打架。反过来，Redoc 写上去那个 `.dark` 类名对站点是
  死的：站点产物 CSS 里**没有**一条裸 `.dark` 规则（搜过，只有
  `.darkNavbarColorModeToggle_*:hover` 和 `[data-theme-choice=dark] .darkToggleIcon_*` 两种带
  前后缀的），拿它驱动配色等于把这一页挂在一个站点根本不认识的开关上。

### 模式怎么跨过 iframe 的边界

navbar 那颗按钮点的是**外层**文档的 `<html data-theme>`，而配色在**框内**那份文档里，所以这一格
要跨文档送一个值。**送与收都住在共享层**：外层 `useOuterFrameSync` 读调用方给它的 `useColorMode()`
结果推 `mode`，框内 `useInnerFrameSync` 收到后按调用方给的属性名写到自己 `<html>` 上
（源码在 `@show-docs/docusaurus-theme-iframe` 的 `lib/`，口径见 [`iframe-protocol.md`](../../theme-iframe/docs/iframe-protocol.md)；本层交出的是属性名
`data-redoc-mode`，三条消息的名字由共享层按命名空间（本包的包名）现造）。为什么这条属性不直接叫 `data-theme` ——
`theme-stoplight` 那边就叫这个，因为 Elements 的暗色表本来就挂在这条属性上，搬过去就地生效；
Redoc 的暗色表挂在它自己按操作系统写的 `:root.dark` 上，本层要改的是它的生效条件（上面那一节），
开一条自己的属性才不会和那份加载时写死的 `data-theme` 混在一起。落地是这样的：

- 站点起得来的那一次：**两侧各推一次** —— 框里那份文档先向外层要一次（就是深链用的那句 `ready`），
  外层装好自己的监听器也主动推一次；两条送的是同一份内容（地址里那一段 + 当前模式）。为什么要两条
  而不是一条，实测过程记在 [`iframe-protocol.md`](../../theme-iframe/docs/iframe-protocol.md) 的「对齐是两侧各推一次的」一节。
- 之后外层点开关：那一次变化框里收不到（它只问一次 ready），由外层主动推。共享层那个 effect 的
  依赖带着模式，变了就重挂一次监听器并连带把新值送出去。
- 模式**不**塞进 iframe 的 `src`：那个地址必须服务端与客户端算出同一个字符串（同
  [`iframe-protocol.md`](../../theme-iframe/docs/iframe-protocol.md)「四个方向各走一条路」里 `src` 不带 hash 那一条的
  理由），而它会跟着开关变。

曾经这一格是靠框架接的：框内那份页面套 `@theme/Layout/Provider`，用它底下的 `ColorModeProvider`
维护 `<html data-theme>` 并监听 `storage` 事件（站点的开关写的就是同源的 localStorage，键名
`theme`）。改成本层送值之后那一层整个删了：那六个 provider 里这一页一个都用不上，而
`ColorModeProvider` 依赖站点配置、还会往同一份 localStorage 上写；只留一个「现在是亮还是暗」的
值，比维持两份文档的那条记录同步简单得多。少了那一层之后框内 `<html>` 上那条 `data-theme`
就只是加载时写死的一份，本层不读它，所以也不会出现「颜色对、但两份文档各自记了一份模式」。

Redoc 左栏底部那颗它自己的切换按钮收掉了（`redoc-ui.css` 里
`.redoc-root [data-testid='color-mode-switcher'] { display: none }`）：配色改由外层的模式驱动之后，
它点下去只改框内那份文档的 `<html>` 类名，页面不会有任何反应 —— 一颗按了没反应的按钮，
还跟 navbar 上那颗重复。是 `display: none`，元素仍然在 DOM 里，所以 e2e 那句按可见性判、不按数量判。

判据是 `test/e2e/features/redoc.feature` 的第三条用例「亮暗模式跟站点走，不跟操作系统走」：
先用 `emulateMedia({ colorScheme: 'dark' })` 打开这一页（要在加载前定下来，Redoc 是渲染时读
`matchMedia` 的），钉「系统深色、站点亮色」这一格里**外层与框内两份文档都是亮色**（框内看的是
那条 `<html data-redoc-mode>`，也就是那条消息确实送到了），同时框内那份文档的 `<html>` 上确实带着
Redoc 写的那个 `dark` 类 —— 类名在、配色却是站点这一头的，才证明驱动的已经不是它。再把站点切成暗色，钉框内的底色真的翻过去、**而且那份文档没有重新加载** ——
后一半判的是那份文档自己的起始时刻（`performance.timeOrigin`，每加载一份新文档就是另一个数，
换配色不动它）：重新加载也能翻对颜色，但会把 Redoc 的展开状态和滚动位置一起冲掉，所以要单独钉。
最后一句把站点自己那几处样式在**暗色下**也照「两个页面各算一遍 computed style
比相等」量一次（含 `<html>` 上的 `color-scheme`，实测与主页同值）。

## 收掉的四处 Redoc 自己的东西

其中**三处走 CSS**，全在 `components/redoc-ui.css`（生效在框内那份文档），全是 `display: none`
（元素仍留在 DOM 里，所以 e2e 那几句按可见性判、不按数量判）：

- **左栏底部那颗亮暗切换按钮** —— `[data-testid='color-mode-switcher']`。配色改由外层送进来的
  那个模式驱动之后，点它只会改 `<html>` 的类名、页面不会有任何反应，还跟 navbar 上那颗重复
  （见「亮暗模式」一节）。
- **左栏底部那条「API docs by Redocly」署名** ——
  `.menu-content > div > span:has(a[href^='https://redocly.com/'])`。
- **每个章节标题右边那一整格操作按钮** —— `[data-testid='page-actions']`，里面是「Copy」加一个
  「More actions」下拉（Open in Claude / ChatGPT 两项在里面）。

认的都是**它是什么**（那条链接指向哪儿、这一格是哪个功能格），不是 styled-components 那个随机
类名（署名那一格的 `HUGFg` 换个版本就重排）。

署名只收自己那一格，不收整格：它与「收起侧栏」那颗按钮（`[data-component-name="Sidebar/SidebarActions"]`）
在同一个 flex 格里（实测那格 284×50、`justify-content: space-between`），整格收掉会把收起侧栏一起
带走。章节标题那一格则按需求整格收掉。代码块里那几颗「复制到剪贴板」不在这格里面，一行规则都碰不到它们。

**那一整格为什么还是 CSS 而不是配置：配置项确实存在，但 `redoc@3.0.1` 不读它。**

- 这一格在官方配置 schema 里有自己的位置：`@redocly/config@0.66.0`（redoc 那份 `options` 类型
  就是从它推出来的）里有 `navigation.actions.items`，枚举含 `copy`、`view`、`chatgpt`、`claude`
  这些，另有一条布尔 `navigation.actions.hide`；写进 `options` 连类型都过。
- 但装进浏览器的那份实现不认：整个 bundle 里 `navigation:{actions:{items: …}}` 只出现一次，是
  Redoc 自己内部一份写死的产品配置常量（喂「Connect to MCP」那颗按钮的），不是从传进来的
  `options` 读的。渲染这一格的开关是标题节点上的 `showPageActions`，而每个标题节点都是写死
  `showPageActions: true` 造出来的（概览、分组、每条接口、每种 GraphQL 类型都在内）；这一格往下
  唯一的分岔只是「这一节有没有 spec 地址」，没有第三条路能把它关掉。
- 两发实测都不认：`{ navigation: { actions: { hide: true } } }` 之后这一格照旧；判据是第二发
  `{ navigation: { actions: { items: ['claude'], hide: false } } }` —— 真读了配置，主按钮就该换成
  「Open in Claude」，实测仍是「Copy + More actions」，一项没变。
- 另一条看着像的配置 `codeSnippet.copy.hide` 管的是**代码块**里那几颗复制（正是这一层要留着的那些），
  而且同样接不上：它读的还是上面那份内部产品配置，实测传进去一处都没少。

判据在 `test/e2e/features/redoc.feature` 第一条用例里：「Redoc 那条署名不出现，同一格里的收起侧栏还在」
与「章节标题旁那一整格操作按钮不出现」，另加「Redoc 代码块里的复制按钮还在」—— 最后一句是给上一句当对照，
证明收掉的是那一格，不是所有叫「复制」的东西。

**第四处走的是配置，不是 CSS：正文最前面那一格「Download OpenAPI description」。**
`redoc-ui.tsx` 里 `options.hideDownloadButtons: true` 一条就够 —— 这一格在 `redoc@3.0.1` 里读得到：
选项归一化那一格写的是 `hideDownloadButtons: k1(t.hideDownloadButtons, !1)`，概览与页头那两处拼章节
时都按它分岔（`!a && i?.length && l.push(wCe(i))`）。本层没传 `downloadUrls`，而它自己会拿取 spec 的
那个地址补一条（`{url: new URL(specUrl, document.baseURI).href}`），于是关着的时候框内正文那一栏的
第一格就是 `[data-testid="panel-download-openapi-description"]`，里面一条链接指向
`/openapi-redoc.yaml`；关掉之后整格不生成，那一格的位置换成 `panel-servers`。判据因此按**数量**写，
不按可见性写，另配一句「正文第一格是 Servers」当对照，免得 testid 哪天改了名变成假绿。

AsyncAPI 那一版是同一个机制、另一个 testid：用默认配置渲染那份 AsyncAPI 文档，正文第一格是
`[data-testid="panel-download-asyncapi-description"]`，标题「Download AsyncAPI description」，
里面那条链接指向那份 `asyncapi.yaml`。所以判据里那一条用的是**前缀**（`[data-testid^="panel-download"]`），
两种文档类型都收得住。

## 高度：外层给框定高，框内不给 Redoc 定高

两侧各有一条规则，方向相反，因为两份文档的排版模型不同。

**外层**：本包**没有**外层那份 CSS —— 框的尺寸与正文容器让位四条层共用一条规则，住在
`theme-iframe` 的 `components/api-frame.css`（`.api-frame` 定高
`calc(100vh - var(--ifm-navbar-height))` + `.container:has(iframe)` 去内边距与最大宽度）。
`.redoc-frame` 这个类名照旧挂在 `<iframe>` 上，用途只剩一个：e2e 用它认「这一格是 redoc 那把键赢的」。
为什么这里**要**给框定高，而框内那一份不给 Redoc 定高，见下面「框内」那段与
[`iframe-protocol.md` 的「尺寸与样式表」一节](../../theme-iframe/docs/iframe-protocol.md)。

**框内**（`redoc-ui.css`）：**不**给 `.redoc-root` 定高，也不开 `overflow: hidden`。Redoc 按
「整份文档跟着滚动」排版 —— 它的左栏是一条 sticky，高度写的是
`calc(100dvh - var(--navbar-stack-height))`，停靠位与正文里每个分节的 `scroll-margin-top` 都从
这条变量取值；给它外面再套一格固定高度就凭空造出一层滚动容器，点接口时 Redoc 滚的是那一格而不是
文档 —— 实测过：`scrollTop` 停在 502，左栏整条往上跑出可视区，上方只剩一片底色。（stoplight 那层
定高是对的，因为 Stoplight Elements 自带内层滚动，模型不一样。）

而 `--navbar-stack-height` 是 Redoc 自己在渲染时算的：它读 `options.scrollYOffset`
（类型上就是 `() => number`，「上面被占掉多高」），把返回值同时写成容器上的 `--navbar-height` 与
`--navbar-stack-height`；**不给这个函数就按 0 算**（`redoc` 里那一格写的是
`Math.max(fn?.() ?? 0, 0)`）。本层就不给：这一格只跑在框内那份文档上，那里根本没有 navbar，
曾经那句量 `.navbar` 高度的写法恒量到 0（实测那两条行内变量就是 `0px`），左栏于是正好铺满
框内那一份文档的整屏 —— 也就是外层那一格的高度。

判据两句，各在一份文档上量：外层「框占满 navbar 以下那一屏」（上沿差、下沿差各留 1px 容差），
框内「Redoc 左栏贴满那一份文档的一屏」（上沿贴着那份文档的顶、下沿贴着它的底，再加 `.redoc-root` 的
`scrollTop` 必须是 0 —— 它不该是滚动容器）。

顺带一处：命中的是**文档页**，所以站点的 docs 侧栏仍然在那一列里（实测框的左偏移 300px，就是
侧栏那一列的宽度）。要把整屏连侧栏一起给渲染器，用 theme-iframe 那一层。

## 路由：框内那份文档钉成 hash

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

## 深链：Redoc 这一层实测到的形状

能发给别人的是**外层**那条地址：`/theme-redoc/docs/redoc-demo#/orders/createorder`。hash 段不参与取文件，浏览器
请求的还是这一页自己的那份 html，产物里有它，所以 `pnpm serve` 回 **HTTP 200**。四个方向各走
哪条路、为什么框内 → 外层不听 `hashchange`、为什么外层写地址用 `replaceState`，记在
[`iframe-protocol.md`](../../theme-iframe/docs/iframe-protocol.md) 的「四个方向各走一条路」与「对齐是两侧各推一次的」
两节；这里只留这一层实测到的那一条：

- **直达一条深链时 Redoc 的正文比「先打开再点下去」短**：它从地址指的那一格往下铺，标题清单少
  两条（只有 `列出订单`、`新建订单` 这两个 `h2`，API 标题与分组那两条不在）。那是 Redoc 自己的
  路由行为，不是本层丢了内容，所以 e2e 两条用例各钉各的清单，没有共用一句判据。

框内 → 外层那一条由 `redoc-ui.tsx` 里那个 `LocationMirror` 站在 `HashRouter` 里面用
`useLocation()` 报出去（`createRouteReporter()` 造的函数）；「刚挂载那一次不报」的理由见
iframe-protocol 的「四个方向各走一条路」一节。`/redoc-view?src=%2Fopenapi-redoc.yaml` 本身也是条能
直接打开的地址（产物里有那份 html），不带外层那段 hash，也不该有人拿它当分享链接。

## AsyncAPI 3：同一把 spec 键换一份文档

`oas3:` 那把 spec 键**不挑文档类型** —— 本层拿到的只有一个地址，判据在厂商那边：Redoc 3 认文档
里 `asyncapi:` 那一格（`redoc@3.0.1` 的 bundle 里有 `asyncapi.startsWith('3.')` 这一格，
`SpecType` 枚举是 `'openapi' | 'asyncapi' | 'graphql'`）。所以本层**一行代码都不用改**：
`oas3:` → 框内 `src` → 组件那份 `url` → `RedocStandalone` 的 `specUrl`，这一条路与文档类型无关。

实测（`static/asyncapi-redoc.yaml` 那份 AsyncAPI 3.0.0 的文档，示例页
`packages/theme-redoc/docs/redoc-asyncapi-demo.md`，判据在 `test/e2e/features/asyncapi.feature`）：

- 框里那份文档真的按 AsyncAPI 摆出来：标题是那份文档的 `info.title`，左栏里是**通道**而不是
  标签分组，点通道进到详情，详情那一段也换过去了。
- **hash 的形状变了**：OpenAPI 那一版是 `#/orders/createorder`（标签 + 小写 `operationId`），
  AsyncAPI 那一版是 `#/channels/ordercreated`（通道 id），进到某条操作再往下一段
  `#/channels/ordercreated/operations/receiveordercreated`。**两种都带前导 `/`** —— 与
  Scalar 那边的 `#channel/ordercreated`（没有前导斜杠）不一样，别拿一边去推另一边。
- 收掉的那几处在这一版里照旧成立：正文最前面那一格下载仍然不生成（`hideDownloadButtons` 对
  AsyncAPI 一样生效，DOM 里 `[data-testid^="panel-download"]` 为 0，正文第一格是 `panel-servers`）；
  它那颗亮暗开关、Redocly 那条署名、章节标题旁那一整格操作按钮仍看不见。
- 亮暗那套不变：改挂生效条件的中间件链认的是 `:root.dark` 打头的选择器，与文档类型无关。
  实测那一版的暗色表也是 54 条 `:root.dark`，与 OpenAPI 那一版**逐条相同**。

判据只钉「形状」不钉「哪一行」：通道名、操作名、标题都取自那份文档的原文，改了文档就要改用例。

没实测到的：GraphQL 那一种 `specType`。

## 状态：已接入站点，浏览器里那两份文档都真渲染

`docusaurus.config.mjs` 的 `plugins` 里在 scalar 之前、stoplight 之后（这一条先后现在只影响
`@theme/` 层栈的覆写关系；四把键的判定顺序在 theme-iframe 的注册表默认与站点覆盖里定，与它无关），
站点根的
`package.json` 声明了 `"@show-docs/docusaurus-theme-redoc": "workspace:^"`。`pnpm build`、
`pnpm verify:chain` 与 `pnpm test:e2e` 都绿，层栈里能看到 `packages/theme-redoc/theme`（只剩
`RedocPage` 那一格）。

已实测到的（都在 `test/e2e/features/redoc.feature` 那四条用例里）：

- 外层：`build/theme-redoc/docs/redoc-demo/index.html` 里是 `<iframe class="api-frame redoc-frame" src="/redoc-view?src=%2Fopenapi-redoc.yaml">`；
  这一页没有 `<article>` 正文外壳、styled 表 0 张、`.redoc-root` 0 个，`.container` 的内边距是 0，
  框的上沿贴着 navbar 下沿、下沿贴着视口（navbar 60px），站点的 docs 侧栏仍在（框左偏移 300px）。
- 框内：`.redoc-root` 那一格在、左栏三个接口点开就在导航里、点新建订单时详情换成它**并且外层地址栏
  那一段跟着换**（这一句同时钉住框内 → 外层那条 postMessage）；那张运行期样式表在框里（实测 427 条
  样式规则，本层不再改写它的选择器：裸 `button` 还是 `button`、`:where(.redoc-root)` 前缀 0 条）；
  左栏占满框内那份文档的整屏、`.redoc-root` 不是滚动容器；
  它那颗自己的亮暗按钮、Redocly 那条署名、章节标题旁那一整格操作按钮都看不见（CSS 收的，元素还在
  DOM 里），而同一格里的「收起侧栏」与代码块里那几颗复制按钮都还在；正文最前面那一格下载在 DOM 里
  就归零（配置收的，同一句钉住正文第一格是 `panel-servers`）；全程没有运行期错误。
- 深链：整页加载 `/theme-redoc/docs/redoc-demo#/orders/createorder`，托管侧回 200，框里把那条接口摆出来
  （正文清单是直达那一份：`列出订单`、`新建订单`），上面那几步（换成 iframe、容器不留白、框占满
  navbar 以下那一屏）同样成立。
- 亮暗：操作系统按深色打开这一页，两份文档都还是亮色（框内那份 `<html>` 上 Redoc 自己写的 `dark`
  类确实在、外层送进来的那条 `data-redoc-mode` 是 `light`）；站点切成暗色，框里那份文档的底色跟着
  翻过去**而且那份文档没重新加载**（它的起始时刻 `performance.timeOrigin` 还是切换前那一个数）；
  再拿同一批站点属性在暗色下把这一页与主页各量一遍，值相同。
- 框内那条地址独立打开：带 `src` 就渲染，`src` 去掉就什么都不摆（不出现 Redoc 那份 404）。

顺带记两处不报错的形状：SSR 两遍都不渲染 —— 外层那份 html 里只有 iframe 标签本身，框内那份也是
空的（组件只在浏览器端出东西）；`redoc` 进了懒加载 chunk（实测产物里 `assets/js/973.*.js`，
2.1 MB 上下；主页那份 html 里既没有它也没有 Elements 那一个 `564.*.js`，也就是没命中的页面不下载它），
框内那一页与本层那两个组件各自另成小 chunk。

> `pnpm build` 时控制台会冒一句 `[zustand persist middleware] … 'mosaic-theme' … does not contain a
'removeItem' method` —— 那一格**不属于本层**：`mosaic-theme` 是 `@stoplight/mosaic` 的存储键
> （产物里只有 `@stoplight/elements` 与 `@stoplight/mosaic` 两个包提到它），是预渲染
> `/stoplight-view` 时求值 Elements 模块树里那个 store 在抱怨，不影响产物。口径记在
> [`theme-stoplight` 的维护者文档](../../theme-stoplight/docs/internals.md) 的「状态」一节。

没实测到的：GraphQL 那一种 `specType`（AsyncAPI 3 那一版见上面「AsyncAPI 3」一节）。

`RedocUI` 原先还留着「给内联文档」那一支（`spec` 收解析好的对象或 YAML/JSON 文本），和
`theme-stoplight` 的组件是同一形状的 `Props`。
两支在两条层里都没有调用方（frontmatter 取的就是一个地址），所以两条一起删了，理由记在
stoplight 那份 README 的「使用」一节。删剩的那两格入参（`url` 与 `onRouteChange`）本来就是三条层
同一个形状，所以类型也不再多份：三个组件引的是框内工厂那份 `ApiFrameViewProps`
（`theme-iframe` 的 `lib/api-frame-view.tsx`）。

## 框内那份文档的 `<html>` 上落了什么（实测）

Redoc 往那里写 2884 条 CSS 变量，另有底色、字色、字体三条真属性（改造前那三条是被运行期圈定挪进
`.redoc-root` 的，现在原样落在 `<html>` 上）。那批变量与站点自己用到的 `var(…)` 实测零重名。

改挂过去的那 54 条暗色规则命中的也是这份文档的 `<html>` 本身，里面除变量外有两条真属性：实测暗色下
`color-scheme` 是 `dark`、底色翻成 `#22242b`（亮色那一份底色是 `#ffffff`）。

## 顺带记一条查证过的 Docusaurus 形状

真要接住一个产物里没有的路径时用得上：「地址找不到」有**两个**出口，而只有一个经过
`@theme/NotFound`（客户端路由一条都没匹配上时，`ComponentCreator('*')` 渲染它）。另一条是匹配到
文档那棵树的根、底下却没有这一页 —— 官方 `theme-classic` 的 `DocRoot` 拿不到当前文档元数据时
**直接**渲染 `NotFound/Content`，它源码注释写着「只渲染内容，免得套两层外壳」。
所以要覆写就覆写 `NotFound/Content`，覆写 `NotFound` 会漏掉后一个出口。
