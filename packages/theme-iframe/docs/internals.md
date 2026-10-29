# theme-iframe 维护者文档

这份写的是**改这一族之前要知道的事**：包内组成、接入站点验到哪一步、新增一条 API 层要动哪几格、
本包的编译口径。使用者要看的（`iframe:` 怎么用、判定清单与覆盖、已知的边界）在
[`README.md`](../README.md)，跨 iframe 的约定在 [`iframe-protocol.md`](./iframe-protocol.md)。

源码注释里那些「理由见包 README『…』一节」的指针，落在本节这些章节上的已经改指这份文件。

## 状态：已接入站点

`docusaurus.config.mjs` 的 `plugins` 里排在 `@show-docs/docusaurus-theme-markmap`、
`@show-docs/docusaurus-theme-erd` 与 `@show-docs/docusaurus-theme-diff` **之后**（本层紧挨着
`theme-diff`）。四条 API 相关层的先后不再决定判定优先级 —— 优先级住在注册表里（见 README 的
「配置」一节），`plugins` 顺序现在只决定 `@theme-prev` 链上「本层 vs diff」的相对位置。站点根的
`package.json` 声明了 `"@show-docs/docusaurus-theme-iframe": "workspace:^"`。
`pnpm build` 与 `pnpm verify:chain` 都绿，推导出的层栈里有 `packages/theme-iframe/theme`。
这一层提供的是 `DocItem`，`@theme-prev/DocItem` 落回 `theme-diff` 那一层（再往里是
`theme-erd` → `theme-markmap` → 官方那一层）；`DocItem/Content` 那根链上现在只有官方一份实现。

产物侧能看到的是这一层进了链、`components/api-frame.css` 编译进了站点样式；页面里真的嵌出
外部站点只能在浏览器看（`pnpm build && pnpm serve`）。浏览器里的实测记在仓库根的 e2e
（`test/e2e/features/iframe.feature`，跑法见 `test/README.md`）。

包名挂 `@show-docs/`，与仓库其它包同一域，所以列进 `test/plugin.test.mts` 那条分包用例的目录清单
只差改清单本身。

## 组成

| 文件                          | 编译吗              | 职责                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`               | ✅ `src/` → `dist/` | 本层入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算，就是 `../theme`）；`iframe:` 那条键没有框内页面要注册                                                                                                                                                                                                                                                                                                                                                                     |
| `theme/DocItem/index.tsx`     | ❌ 站点编译         | **这一族唯一的外层套壳**：拿 `resolveFrameDistribution()` 的清单逐条判（命中与否由 `matchApiFrameEntry()` 给：内层是「布尔键 + spec 键给的地址（`oas3:` / `aas3:`）」，外层是「键给一个非空地址」），命中就换成 `ApiFrame`，不命中整个交回下层；开发模式把清单那份 `warnings` 交给 `warnFrameDistribution()`                                                                                                                                                                            |
| `components/api-frame.tsx`    | ❌ 站点编译         | 通用框：`internal` 条目拼 `/…-view` 地址并挂消息循环，`external` 条目走 `lib/frame-messages.ts` 的 `externalFrameURL()`（补 origin、`?path=` 再解一层）；`<iframe>` 恒挂 `.api-frame` + 本层 `frameClass` 两个类名；`title` 优先用页面的 `frontMatter.title`，注册表那条只兜底                                                                                                                                                                                                          |
| `components/api-frame.css`    | ❌ 站点编译         | **四条层共用的那一格版式**：`.api-frame` 定高占满 navbar 以下那一屏、`display: block`、去边框，`.container:has(iframe)` 那条正文容器让位，`.main-wrapper:has(.api-frame) + .footer` 收掉站点页脚（这条以前只有 stoplight 一份，另三层漏）；目前没有只属于一层的规则，各层那个专属类名只用来认赢家                                                                                                                                                                                       |
| `lib/index.ts`                | ❌ 站点编译         | 浏览器侧共享约定的出口（供三条 API 层引）；**不含**配置期那份工厂，免得 `node:path` 进浏览器 bundle                                                                                                                                                                                                                                                                                                                                                                                     |
| `lib/api-frame-registry.ts`   | ❌ 站点编译         | 注册表：四条形同的条目（命名空间、frontmatter 键、类名、路由名……），纯数据不引 React，配置期与浏览器期引同一份；三条 API 层的键是布尔（`scalar` / `redoc` / `stoplight`），spec 地址读 `oas3` / `aas3` 这组键（按顺序取第一把非空）                                                                                                                                                                                                                                                     |
| `lib/api-frame-entries.ts`    | ❌ 站点编译         | 判定清单的分发：装了的层参与判定（覆盖也不放宽这一条），注册表顺序为默认，站点可在本层插件选项 `themeConfig.apiFrame.order` 里覆盖顺序与子集；「那一个槽位是不是某一层」读解析器包的 `./plugin-slots`（浏览器侧与配置期读同一份判据，形状 `PluginSlots` 也来自那里，本包不再抄第二份）；落空原因进 `warnings`，同在这份里的 `warnFrameDistribution()` 负责去重后打到控制台（开发模式由 `DocItem` 调）；两边都不引 React，单测（`test/api-frame-entries.test.mts`）与 `DocItem` 引同一份 |
| `lib/api-frame-messages.ts`   | ❌ 站点编译         | 按命名空间造那三条 postMessage 的名字，带缓存（同一命名空间每次拿到同一个对象，effect 依赖不换引用）                                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/api-frame-view.tsx`      | ❌ 站点编译         | **浏览器期**的框内工厂：三条层的 `theme/XxxPage` 各调它一次，交包名、渲染接线那个组件、亮暗的落法（`modeAttribute` 或 `onMode`）；注册表守卫、取 spec 地址、接住外层送来的两格、报回外层都在这一份里，单测 `test/api-frame-view.test.mts`；那份渲染接线的入参类型 `ApiFrameViewProps` 也住在这里，三个组件（redoc / stoplight / scalar 各自的 `components/*-ui.tsx`）引同一份，不再各写一遍                                                                                             |
| `lib/api-frame-theme.mts`     | ❌ 不进 `tsc`       | **配置期**入口工厂：三条 API 层的 `src/index.mts` 调它拿 Plugin 形状（挂层目录、注册框内那条路由、接各自的 webpack 差异）；`.mts` 后缀按上游 lint preset 标 Node 环境                                                                                                                                                                                                                                                                                                                   |
| `lib/prerequisites.ts`        | ❌ 不进 `tsc`       | 各层在 `loadContent()` 里查安装前提：`assertThemePrerequisites()` 读的是**站点配置**里那份原始 `plugins` / `themes` 清单（不是 `context.plugins` —— `LoadContext` 没有那个字段）。解析器插件那一条（`@theme-prev/*` 的别名由它提供）**转调**它自己包里的 `assertPrevLayerResolverInstalled()`，本包只留另外两条：`theme-iframe`（共享外壳）没注册、`lightningCssMinimizer` 那一格没开（viewerjs 那份原生嵌套的要求）；改名前的 `future.experimental_faster` 也读（`faster` 优先）       |
| `lib/isolate-renderer-css.ts` | ❌ 不进 `tsc`       | **配置期**那一格构建期改写：把某一份第三方静态样式表从「并进全站那一份 css」改成「单独一个产物」（插一条 `asset/resource` 规则 + 把它从带 loader 的规则里摘出去）；stoplight 与 scalar 各交一份文件与探针路径给它。为什么非在构建期动手记在这份文件头上                                                                                                                                                                                                                                 |
| `lib/frame-messages.ts`       | ❌ 站点编译         | 约定与形状：iframe 地址（框内那条拼与拆、`iframe:` 那条 `externalFrameURL()`）、三条 postMessage（纯函数，不引 React、不引 DOM）                                                                                                                                                                                                                                                                                                                                                        |
| `lib/frame-sync.ts`           | ❌ 站点编译         | 两侧的消息循环：`useOuterFrameSync` / `useInnerFrameSync` / `createRouteReporter`，含两边都过的来源校验 `isTrustedMessage`（引 DOM 类型的只有这一份，注册表那条配置期链路碰不到 `Window`）                                                                                                                                                                                                                                                                                              |
| `lib/location-mirror.tsx`     | ❌ 站点编译         | 「把框内这份文档地址里 `#` 那一段报给外层」那一格：`createLocationMirror(useLocation)` 收成工厂，由 redoc 与 stoplight 各自交自己那条路由包的 `useLocation`（两边的路由包不同，不能在这里 import 任意一个）；换一条接口靠路由变化而不是 `hashchange`（那两条走 `history.pushState`），挂载那一次不报                                                                                                                                                                                    |
| `lib/view-layer-shell.tsx`    | ❌ 站点编译         | 三条「在正文上方多插一块视图」的层（`theme-markmap` / `theme-erd` / `theme-diff`）共用的整份外壳：`ErrorBoundary(labels)` 按调用方给的包名与文案造各自那一份类组件（初始化失败退回一条 `Admonition`），`ViewLayer` 落「视图 → 分隔线 → 装正文的 `.container`」那一格，`ViewLayerDocItem` 把这两样与本层数据、本层那句说法接成各包 `DocItem` 的全部内容 —— 三条层因此只剩「交哪把键、交哪个组件、交哪段说法」。单测 `test/view-layer-shell.test.mts`                                     |
| `lib/view-layer-labels.ts`    | ❌ 站点编译         | 本层那句说法的形状（包名 / 提示标题 / 提示正文）。落成 `.ts` 只为让两个 `.tsx` 引同一份时 `react-refresh` 不必开例外                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/view-layer.ts`           | ❌ 站点编译         | 那三条层共用的宽度补丁 `.container:has(.fake) { max-width: 100% !important }`（导出成一段 CSS 字符串）：由 `ViewLayer` 渲染成视图自己子树里的 `<style>`，命中页的 HTML 里就有它、离开时随卸载消失；选择器用 `:has()` 把作用域限定在「包着视图容器」的 `.container` 上                                                                                                                                                                                                                   |
| `docs/iframe-protocol.md`     | ——                  | 那份共享约定的口径与踩过的坑（含注册表一节）（原 `theme/frame-kit/README.md`）                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tsconfig.build.json`         | ——                  | 构建项目：只有 `src/`，所以本包的产物出口是 `dist/index.mjs`；`lib/` 与 `components/`、`theme/` 都不进 `tsc`                                                                                                                                                                                                                                                                                                                                                                            |

三条视图层（`theme-markmap` / `theme-erd` / `theme-diff`）共用的外壳也住在这里 ——
`lib/view-layer-shell.tsx` / `lib/view-layer-labels.ts` / `lib/view-layer.ts`。放本包而不是单开一个包：
`lib/` 已经随包发出去（`files` 与 `./lib/*` 那条 exports），而那三条视图层本来就依赖本包
（那份共享外壳与 iframe 那层）。收在一处之前这三份是每个包各抄一遍的副本，
合成一份之后各包又还各留着 `components/error-boundary.tsx` / `components/hack-style.tsx`
两个只管转出的文件；现在连那两个都没有了，`test/view-layer-copies.test.mts` 钉的是
「三处引的是同一份」，也钉「那两份转出文件不许再长回来」。

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/` 里的
`.tsx`，本包就不编译第二遍；`lib/` 里有三份是例外形态：`api-frame-theme.mts`、
`prerequisites.ts` 与 `isolate-renderer-css.ts` —— 它们既不由站点编译，也不由本包编译，而是
jiti（Docusaurus 的配置加载器）在配置期直接吃这份源码。口径的产地在仓库根 README 的
「构建包的编译口径」。

## 视图层为什么不用注册表

这一族也有过一次「要不要收进一张表」的提案（把「命中后渲染什么」从各层的 `lazy()` 换成 `lib/`
里一份 `view-registry.ts`）。结论是不做，理由留在下面 —— 免得下次又有人重新推一遍。

`lib/` 里两张表长得像、命不一样，别顺手把它们合成一族：

- `lib/api-frame-registry.ts` 是**真的注册表**：几条 API 层同形（一条 = 命名空间 + 一把
  frontmatter 键 + 一条框内路由），站点还真的会挑 —— `themeConfig.apiFrame.order` 能换判定顺序
  与子集（见 [`iframe-protocol.md`](./iframe-protocol.md) 的「注册表与分发」）。
- 三条视图层（`theme-markmap` / `theme-erd` / `theme-diff`）**没有**这张表，也**不要**加。每层
  只有自己那一份 `theme/DocItem/index.tsx`：一句 `lazy(() => import('…/components/x.tsx'))`、
  一把 `data` 键、两句文案；壳与接线全在 `lib/view-layer-shell.tsx` 那一份里。这些键名、组件名
  与说法都不需要被谁枚举出来。

不做的理由，按「换表能拿到什么」逐条算：

- **体积**：五层 `DocItem` 壳加上各自的 `lazy` / `Suspense` 全摘出去，上限也只占 `main.js` 的
  2%~5%，还要多付请求。这档的价值本来就不在数字。
- **「改一处要看三处」**：壳收进 `lib/` 之后这条已经不成问题 —— 三层只剩「交哪把键、交哪个
  组件、交哪段说法」，换成表不过是「一个 import 换成表里一行」，重复没减少、只是搬了家；
  护栏也没少：`test/view-layer-copies.test.mts` 钉的正是「结构逐行相同、只许差在允许的那几格」。
- **清单可读**：表能让人打开一个文件看到「这个站点装了哪几层视图」，但站点 `plugins` 里本来
  就写着三条包名 —— 多出来的那一份不是新信息，是第二份要跟着改的清单。
- **前置需求**：「按站点开关某一层视图」目前不存在。等真有人要这个再谈升级 —— 那才是选编译期
  表的理由。

代价那头反而是真的：表里每格 `load` 得指向别的包里的组件文件。写相对路径（从 `lib/` 往上三级
到 `theme-markmap`）在工作区里能跑，装成 npm 包之后 `@show-docs/docusaurus-theme-iframe` 目录里
没有 `../theme-markmap/`，`import()` 在**运行期**抛 `Module not found`。写成包 specifier
`import('…/docusaurus-theme-markmap/components/markmap.tsx')` 则要三个视图包各自把
`components/*` 加进 `exports`，再反过来让 `theme-iframe` 依赖它们 —— 而它们本来就依赖
`theme-iframe`（那份共享外壳与 iframe 那层），**这会成环**。绕开环依赖只剩两条：视图文件搬进
本包（三个包变空壳，`README` / `docs/` / `sidebars.mts` 里的路径全要改），或者表改成 build 期
生成器（新造一处漂移源，还要再写用例钉「生成物与源码一致」）。为一个演示站，这笔账算不过来。

还有一条得说清：**表跟层栈推导没有关系**。`plugin-prev-layer-resolver` 的
`findIssuerLayerIndex` 认的是「发 `@theme-prev/*` 请求的文件的真实路径」，而那些请求永远来自
`packages/<包>/theme/DocItem/index.tsx` —— 表里既没有 `@theme-prev` 字样、`load` 又只指向组件文件，
判层那一格一点不变，五层 `DocItem` 壳照旧在 `main.js` 里、照旧是同步组件。反过来也成立：
**视图层是「摆在正文上方的一格」，不是「一层一层地包」**，包不包得住下一层仍然只由各层文件的
位置决定 —— 这份决定本来就不适合外包给一张数据表。

这一族的形状因此只落在两格里：说法的形状在 `lib/view-layer-labels.ts`，壳与接线在
`lib/view-layer-shell.tsx`；各层那份 `DocItem` 按 `test/view-layer-copies.test.mts` 的允许清单
只许差在键名、组件名与本层说法上。**新增一条视图层 = 一个包 + 一份照抄形状的 `DocItem`**，
不必先来这里登记 —— 没有登记表可写，这就是这一档的选择。

## 落点为什么是 `DocItem`

命中时**不包**下层 `DocItem`，与 `theme-markmap` 同键不同做法（markmap 包着下层，本层替换）。
早期版本落在 `DocItem/Content`，为的是保住文档外壳；那时踩过一个坑——官方 `DocItem` 渲染的是
`<DocItemLayout><MDXComponent /></DocItemLayout>`，`MDXComponent` 就是它的 `props.content`，
**`props.children` 它一个字都不读**，把 iframe 当 children 塞给 `DocItem` 会静默丢掉（构建产物里
`iframe` 标签数为 0）。现在这一层根本不使用 children，那个坑不成立。

## 开发模式与构建产物同一个行为

`iframe:` 曾经在开发模式给的是链接（本地改动会不断重载被嵌的页面，太吵），那条分支已经删掉。
现在 `pnpm start` 与构建产物都直接嵌 iframe，要看真的 iframe 不用先构建。

## 新增一条 API 层要动哪里

1. `lib/api-frame-registry.ts` 加一条（命名空间、键名、路由名、参数名、spec 键、类名、`@theme/` 别名、
   `title` 兜底值）。想让某个站点换判定先后或只放行其中几把，不用改这里 —— 插件选项里那条
   `order`（见 README 的「配置」一节）。新层的包还要把本层写进它自己的 `peerDependencies`（版本契约的口径见
   [`iframe-protocol.md`](./iframe-protocol.md) 末了那条配方）。
2. 新包只写两份代码：`src/index.mts` 调 `createApiFrameTheme()` 一次拿 Plugin 形状，框内那一页
   `theme/XxxPage/index.tsx` 调 `createApiFrameView()` 一次（交三格：包名、渲染接线那个组件、
   亮暗的落法 `modeAttribute` 或 `onMode`）。渲染接线本身（各家那个 UI 组件与它的 css）归
   新包的 `components/`。
   包的 `package.json` 把本层声明成 **peerDependencies**（`"@show-docs/docusaurus-theme-iframe": "workspace:^"`，
   语义上是那份版本契约：协议变了，中心升版，消费方在**安装期**就被范围拦下，而不是等构建期工厂抛错）。
3. 外层（DocItem、框、消息循环、地址）与框内那页的流程（取地址、接消息、报回外层）一概不用动 ——
   这就是收拢的意义。

## 编译口径

`src/index.mts` 进 `tsc`（差量清单与理由记在仓库根 README 的「构建包的编译口径」，这里不抄
第二份）。本包自己的几格：

- 入口里的 `getThemePath()` 返回 `../theme` —— 相对的是**产物**目录（`dist/`），不是 `src/`。
- 层、`components/`、`lib/` 都不进构建项目，`files` 因此要点名四份：
  `["components", "dist", "lib", "theme"]`。只发 `dist` 的话，包装上站点会报层目录
  不存在；`lib` 少了，用它的三个包在装好的站点里引不到源码。
- `docs/` **不进** `files`（本包的维护者文档与 [`iframe-protocol.md`](./iframe-protocol.md)、
  各 API 包的 `docs/internals.md` 都算这一格）：发布只带站点运行时与类型要吃的东西，实现记录
  留在仓库里读。代价是发布包那份 README（npm 无条件带上）里指向 `docs/…` 的链接对装包的人
  是断的 —— 认这个代价，因为少一份要点名、会和源码漂移的产物更贵。
- `lib/api-frame-theme.mts` 站在配置期：它引 `node:path`，所以**不进** `lib/index.ts` 那一份
  浏览器出口；三条 API 层的入口按全 specifier
  `@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts` 引它（包的 `exports` 里
  `./lib/*` 是通配，`/lib` 裸路径不解析）。
- 「谁来编这一族未编译的 TS 源码」**不归本包**：官方 babel 规则排除 `node_modules`，不补的话
  npm 安装后层源码报 `Module parse failed` —— 那一格由
  `@show-docs/docusaurus-plugin-prev-layer-resolver` 一处认领（按 `@show-docs` 这个 scope，
  判据在它的 `src/source-js-rule.mts`）。本包入口与三条 API 层经
  `lib/api-frame-theme.mts` 的工厂都不再自己补规则；工厂那一格只透传调用方给的
  `configureWebpack`（Redoc 的 `worker_threads` 空模块、Elements 的样式表隔离那些差异）。
  口径见仓库根 README 的「构建包的编译口径」，与解析器包
  [internals](../../plugin-prev-layer-resolver/docs/internals.md) 的
  「谁来编未编译的 TS 源码」一节。
- `components/api-frame.css` 与用它的组件同目录，`theme/DocItem/index.tsx` 静态 import
  `../../components/api-frame.tsx` —— 磁盘上就是这个文件，未编译这一侧不存在「产物名改写」。
- 改 `theme/` 与 `components/` 不用先编译，`pnpm start` 直接生效；改注册表也一样（两边都是
  源码），改入口才要 `pnpm build:core`。这些未编译的源码归仓库根 `tsconfig.json` 检查，
  所以 `pnpm lint:type` 就是它们的门：`@theme-prev/DocItem` 的类型产地在解析器包里
  `types/theme-specifiers.d.ts`，
  `@docusaurus/router` 那几条靠仓库根那份 `module-aliases.d.ts`；
  `@theme-prev/X` 的语义见
  [plugin-prev-layer-resolver 的 README](../../plugin-prev-layer-resolver/README.md)。
