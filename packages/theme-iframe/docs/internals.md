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

这一层**不再提供 `DocItem`**：四把键由本层在 `loadContent()` 里交给 `theme-component-page`
（`src/component-pages.mts` 调 `src/api-frame-contribute.mts`），
命中后挂的是本包的 `theme/ApiFramePage`。所以 `@theme-prev/DocItem` 那条链上，本层让位给了
`theme-erd`（`theme-diff` 也已经改成清单上的一页，它的 `DiffPage` 自己接 `@theme-prev/DocItem`）；
`DocItem/Content` 那一格只有 `theme-viewer` 一层覆盖（它用 `@theme-init` 拿官方那一份），
没有要串的链。
安装前提因此多了一条：`@show-docs/docusaurus-theme-component-page` 必须注册成插件，
`loadContent()` 里与解析器插件一起当场点名。

产物侧能看到的是层栈里有本层、生成目录里那份 `theme-component-page/registry.ts` 带着本层交出的
四条 `@theme/ApiFramePage`；页面里真的嵌出外部站点只能在浏览器看（`pnpm build && pnpm serve`）。
浏览器里的实测记在仓库根的 e2e（`test/e2e/features/iframe.feature`，跑法见 `test/README.md`）。

包名挂 `@show-docs/`，与仓库其它包同一域，所以列进 `test/plugin.test.mts` 那条分包用例的目录清单
只差改清单本身。

## 组成

| 文件                           | 编译吗              | 职责                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                | ✅ `src/` → `dist/` | 本层入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算，就是 `../theme`）；`loadContent()` 先调 `assertThemePrerequisites()` 查解析器插件与 component-page 两条安装前提，再经 `src/component-pages.mts` 算出本层交哪几页、把配置里那两处写歪的说明打一次，最后交回 `{ componentPages }`                                                                                                                                                                                                                                                                                                                                                                       |
| `src/component-pages.mts`      | ✅ `src/` → `dist/` | 入口与 `contributeApiFramePages()` 之间那一格：把 `{ pages, warnings }` 收成 `{ componentPages, warnings }`，入口原样交回给 component-page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/api-frame-registry.ts`    | ✅ `src/` → `dist/` | 注册表：四条形同的条目（命名空间、frontmatter 键、类名、路由名……），纯数据不引 React，配置期与浏览器期引**同一份源码**（浏览器侧经 `lib/api-frame-registry.ts` 那条转出）；三条 API 层的键是布尔（`scalar` / `redoc` / `stoplight`），spec 地址读 `oas3` / `aas3` 这组键（按顺序取第一把非空）                                                                                                                                                                                                                                                                                                                                                                      |
| `src/api-frame-contribute.mts` | ✅ `src/` → `dist/` | **配置期**那一格：装了的那几层按注册表顺序各交一页（`key` / `match` / `component: '@theme/ApiFramePage'` / `props.namespace`）给 component-page；站点在本层插件选项里给的 `themeConfig.apiFrame.order` 换顺序、取子集；拼错的名字与列了没装的层进 `warnings`，由入口在 `loadContent()` 打一次                                                                                                                                                                                                                                                                                                                                                                       |
| `src/prerequisites.mts`        | ✅ `src/` → `dist/` | 装成 `dist/prerequisites.mjs` 发出去（`./prerequisites` 那条子路径）：主题层在 `loadContent()` 里查安装前提 —— `assertThemePrerequisites()` 读的是**站点配置**里那份原始 `plugins` / `themes` 清单（不是 `context.plugins` —— `LoadContext` 没有那个字段）。解析器插件那一条（`@theme-prev/*` 的别名由它提供）**转调**它自己包里的 `assertPrevLayerResolverInstalled()`；本包这一份还查 `theme-iframe`（共享外壳）有没有注册、`lightningCssMinimizer` 那一格有没有开（viewerjs 那份原生嵌套的要求；改名前的 `future.experimental_faster` 也读，`faster` 优先），以及 `componentPage` 那一格要求时 `theme-component-page` 在不在。搬家理由见下面「谁的编译口径」一节 |
| `theme/ApiFramePage/index.tsx` | ❌ 站点编译         | **这一族的外层组件**：component-page 命中后把整个 `DocItem` 换成它，入参里带着赢的那条命名空间；按注册表取这一页的框地址（内层是 spec 键给的地址，外层是命中那把键写的值），取不到就交回 `@theme-prev/DocItem`（普通文档页）；开发模式把页面级的两条告警交给 `warnFramePages()`                                                                                                                                                                                                                                                                                                                                                                                     |
| `components/api-frame.tsx`     | ❌ 站点编译         | 通用框：`internal` 条目拼 `/…-view` 地址并挂消息循环，`external` 条目走 `lib/frame-messages.ts` 的 `externalFrameURL()`（补 origin、`?path=` 再解一层）；`<iframe>` 恒挂 `.api-frame` + 本层 `frameClass` 两个类名；`title` 优先用页面的 `frontMatter.title`，注册表那条只兜底                                                                                                                                                                                                                                                                                                                                                                                      |
| `components/api-frame.css`     | ❌ 站点编译         | **四条层共用的那一格版式**：`.api-frame` 定高占满 navbar 以下那一屏、`display: block`、去边框，`.container:has(iframe)` 那条正文容器让位，`.main-wrapper:has(.api-frame) + .footer` 收掉站点页脚（这条以前只有 stoplight 一份，另三层漏）；目前没有只属于一层的规则，各层那个专属类名只用来认赢家                                                                                                                                                                                                                                                                                                                                                                   |
| `lib/index.ts`                 | ❌ 站点编译         | 浏览器侧共享约定的出口（供三条 API 层引）；**不含**配置期那份工厂，免得 `node:path` 进浏览器 bundle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `lib/api-frame-registry.ts`    | ❌ 站点编译         | 注册表的**浏览器侧转出**：真正那一份在 `../src/api-frame-registry.ts`（本包入口编译它，`src/` 不能反过来引未编译的 `lib/`）。浏览器侧与别的包引 `./lib/api-frame-registry.ts` 拿到的是同一批对象；`exports` 的 `./lib/*` 仍然指得到它                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `lib/api-frame-entries.ts`     | ❌ 站点编译         | **页面侧**那一格：一页归了本层之后，框里渲染哪份文档（内层两个 spec 键按顺序取第一把非空；外层就是命中那把键的值），以及两条页面级告警（缺 spec 地址、两把 spec 键同时写）。判定与装机过滤已经不在这里 —— 那一格搬到了配置期（`src/api-frame-contribute.mts`）；`warnFramePages()` 负责去重后打到控制台（开发模式由 `ApiFramePage` 调）；不引 React，单测与组件引同一份                                                                                                                                                                                                                                                                                             |
| `lib/api-frame-messages.ts`    | ❌ 站点编译         | 按命名空间造那三条 postMessage 的名字，带缓存（同一命名空间每次拿到同一个对象，effect 依赖不换引用）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `lib/api-frame-view.tsx`       | ❌ 站点编译         | **浏览器期**的框内工厂：三条层的 `theme/XxxPage` 各调它一次，交包名、渲染接线那个组件、亮暗的落法（`modeAttribute` 或 `onMode`）；注册表守卫、取 spec 地址、接住外层送来的两格、报回外层都在这一份里，单测 `test/api-frame-view.test.mts`；那份渲染接线的入参类型 `ApiFrameViewProps` 也住在这里，三个组件（redoc / stoplight / scalar 各自的 `components/*-ui.tsx`）引同一份，不再各写一遍                                                                                                                                                                                                                                                                         |
| `lib/api-frame-theme.mts`      | ❌ 不进 `tsc`       | **配置期**入口工厂：三条 API 层的 `src/index.mts` 调它拿 Plugin 形状（挂层目录、注册框内那条路由、接各自的 webpack 差异）；`.mts` 后缀按上游 lint preset 标 Node 环境                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `lib/isolate-renderer-css.ts`  | ❌ 不进 `tsc`       | **配置期**那一格构建期改写：把某一份第三方静态样式表从「并进全站那一份 css」改成「单独一个产物」（插一条 `asset/resource` 规则 + 把它从带 loader 的规则里摘出去）；stoplight 与 scalar 各交一份文件与探针路径给它。为什么非在构建期动手记在这份文件头上                                                                                                                                                                                                                                                                                                                                                                                                             |
| `lib/frame-messages.ts`        | ❌ 站点编译         | 约定与形状：iframe 地址（框内那条拼与拆、`iframe:` 那条 `externalFrameURL()`）、三条 postMessage（纯函数，不引 React、不引 DOM）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `lib/frame-sync.ts`            | ❌ 站点编译         | 两侧的消息循环：`useOuterFrameSync` / `useInnerFrameSync` / `createRouteReporter`，含两边都过的来源校验 `isTrustedMessage`（引 DOM 类型的只有这一份，注册表那条配置期链路碰不到 `Window`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `lib/location-mirror.tsx`      | ❌ 站点编译         | 「把框内这份文档地址里 `#` 那一段报给外层」那一格：`createLocationMirror(useLocation)` 收成工厂，由 redoc 与 stoplight 各自交自己那条路由包的 `useLocation`（两边的路由包不同，不能在这里 import 任意一个）；换一条接口靠路由变化而不是 `hashchange`（那两条走 `history.pushState`），挂载那一次不报                                                                                                                                                                                                                                                                                                                                                                |
| `lib/view-layer-shell.tsx`     | ❌ 站点编译         | 三条「在正文上方多插一块视图」的层（`theme-markmap` / `theme-erd` / `theme-diff`）共用的整份外壳：`ErrorBoundary(labels)` 按调用方给的包名与文案造各自那一份类组件（初始化失败退回一条 `Admonition`），`ViewLayer` 落「视图 → 分隔线 → 装正文的 `.container`」那一格，`ViewLayerDocItem` 把这两样与本层数据、本层那句说法接成各包 `DocItem` / `MarkmapPage` / `DiffPage` 的全部内容 —— 三条层因此只剩「交哪把键、交哪个组件、交哪段说法」。单测 `test/view-layer-shell.test.mts`                                                                                                                                                                                    |
| `lib/view-layer-labels.ts`     | ❌ 站点编译         | 本层那句说法的形状（包名 / 提示标题 / 提示正文）。落成 `.ts` 只为让两个 `.tsx` 引同一份时 `react-refresh` 不必开例外                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `lib/view-layer.ts`            | ❌ 站点编译         | 那三条层共用的宽度补丁 `.container:has(.fake) { max-width: 100% !important }`（导出成一段 CSS 字符串）：由 `ViewLayer` 渲染成视图自己子树里的 `<style>`，命中页的 HTML 里就有它、离开时随卸载消失；选择器用 `:has()` 把作用域限定在「包着视图容器」的 `.container` 上                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/iframe-protocol.md`      | ——                  | 那份共享约定的口径与踩过的坑（含注册表一节）（原 `theme/frame-kit/README.md`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tsconfig.build.json`          | ——                  | 构建项目：只有 `src/`，所以本包的产物出口是 `dist/index.mjs`；`lib/` 与 `components/`、`theme/` 都不进 `tsc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

三条视图层（`theme-markmap` / `theme-erd` / `theme-diff`）共用的外壳也住在这里 ——
`lib/view-layer-shell.tsx` / `lib/view-layer-labels.ts` / `lib/view-layer.ts`。放本包而不是单开一个包：
`lib/` 已经随包发出去（`files` 与 `./lib/*` 那条 exports），而那三条视图层本来就依赖本包
（那份共享外壳与 iframe 那层）。收在一处之前这三份是每个包各抄一遍的副本，
合成一份之后各包又还各留着 `components/error-boundary.tsx` / `components/hack-style.tsx`
两个只管转出的文件；现在连那两个都没有了，`test/view-layer-copies.test.mts` 钉的是
「三处引的是同一份」，也钉「那两份转出文件不许再长回来」。

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/` 里的
`.tsx`，本包就不编译第二遍；`lib/` 里有两份是例外形态：`api-frame-theme.mts` 与
`isolate-renderer-css.ts` —— 它们既不由站点编译，也不由本包编译，而是 jiti（Docusaurus 的
配置加载器）在配置期直接吃这份源码。`prerequisites` 原本也在这两格旁边，后来搬进了 `src/`：
它要给别的主题层当子路径用，而本包的 `src/`（`tsc`，`rootDir`）引不到未编译的 `lib/`。
口径的产地在仓库根 README 的「构建包的编译口径」。

## 视图层为什么不用注册表

这一族也有过一次「要不要收进一张表」的提案（把「命中后渲染什么」从各层的 `lazy()` 换成 `lib/`
里一份 `view-registry.ts`）。结论是不做，理由留在下面 —— 免得下次又有人重新推一遍。

本包里两张表长得像、命不一样，别顺手把它们合成一族：

- `src/api-frame-registry.ts` 是**真的注册表**：几条 API 层同形（一条 = 命名空间 + 一把
  frontmatter 键 + 一条框内路由），站点还真的会挑 —— `themeConfig.apiFrame.order` 能换判定顺序
  与子集（见 [`iframe-protocol.md`](./iframe-protocol.md) 的「注册表与分发」）。
- 三条视图层（`theme-markmap` / `theme-erd` / `theme-diff`）**没有**这张表，也**不要**加。erd 仍
  只有自己那一份 `theme/DocItem/index.tsx`，另两条是清单里那两页的 `theme/MarkmapPage` /
  `theme/DiffPage`：都是一句 `lazy(() => import('…/components/x.tsx'))`、一把 `data` 键、
  两句文案；壳与接线全在 `lib/view-layer-shell.tsx` 那一份里。这些键名、组件名与说法都不需要
  被谁枚举出来（`markmap` / `diff` 那两把键在各自包的 `src/component-pages.mts` 里，是交给
  component-page 的条目，不是视图注册表）。

不做的理由，按「换表能拿到什么」逐条算：

- **体积**：三层 `DocItem` 壳加上各自的 `lazy` / `Suspense` 全摘出去，上限也只占 `main.js` 的
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
`findIssuerLayerIndex` 认的是「发 `@theme-prev/*` 请求的文件的真实路径」，而那些请求来自
`packages/theme-erd/theme/DocItem/index.tsx`，以及改由清单整页换掉之后的
`packages/theme-markmap/theme/MarkmapPage/index.tsx` 与 `packages/theme-diff/theme/DiffPage/index.tsx`
—— 表里既没有 `@theme-prev` 字样、`load` 又只指向组件文件，
判层那一格一点不变，各层那份薄壳照旧在 `main.js` 里、照旧是同步组件。反过来也成立：
**视图层是「摆在正文上方的一格」，不是「一层一层地包」**，包不包得住下一层仍然只由各层文件的
位置决定 —— 这份决定本来就不适合外包给一张数据表。

这一族的形状因此只落在两格里：说法的形状在 `lib/view-layer-labels.ts`，壳与接线在
`lib/view-layer-shell.tsx`；各层那一份页面组件（`DocItem` / `MarkmapPage` / `DiffPage`）按
`test/view-layer-copies.test.mts` 的允许清单只许差在键名、组件名与本层说法上。
**新增一条视图层 = 一个包 + 一份照抄形状的页面组件**，不必先来这里登记 —— 没有登记表可写，
这就是这一档的选择。

## 落点：component-page 的 `ApiFramePage`

这一族不再自己提供 `DocItem`。四把键的判定搬到 `theme-component-page` 之后，命中时那一层不再
往下走，整页换成本包的 `theme/ApiFramePage`；它按框地址渲染 `<iframe>`，取不到地址就交回
`@theme-prev/DocItem`（普通文档页）。与早期落在 `DocItem` 的版本相比，外面看到的行为一样
（不包下层 `DocItem`、不渲染文档外壳），判键与「归谁」却只剩一份实现。

早期版本落在 `DocItem/Content`，为的是保住文档外壳；那时踩过一个坑 —— 官方 `DocItem` 渲染的是
`<DocItemLayout><MDXComponent /></DocItemLayout>`，**`props.children` 它一个字都不读**，把 iframe
当 children 塞给 `DocItem` 会静默丢掉（构建产物里 `iframe` 标签数为 0）。现在替换的是整个
`DocItem`，那一条不适用；留着它是提醒：别把 `<iframe>` 塞进一个只渲染 `props.content` 的壳里。

## 开发模式与构建产物同一个行为

`iframe:` 曾经在开发模式给的是链接（本地改动会不断重载被嵌的页面，太吵），那条分支已经删掉。
现在 `pnpm start` 与构建产物都直接嵌 iframe，要看真的 iframe 不用先构建。

## 新增一条 API 层要动哪里

1. `src/api-frame-registry.ts` 加一条（命名空间、键名、路由名、参数名、spec 键、类名、`@theme/` 别名、
   `title` 兜底值）。交页这一格不用动：`src/api-frame-contribute.mts` 按注册表顺序逐条交，装了的
   层自动出现。想让某个站点换判定先后或只放行其中几把，不用改这里 —— 插件选项里那条
   `order`（见 README 的「配置」一节）。新层的包还要把本层写进它自己的 `peerDependencies`（版本契约的口径见
   [`iframe-protocol.md`](./iframe-protocol.md) 末了那条配方）。
2. 新包只写两份代码：`src/index.mts` 调 `createApiFrameTheme()` 一次拿 Plugin 形状，框内那一页
   `theme/XxxPage/index.tsx` 调 `createApiFrameView()` 一次（交三格：包名、渲染接线那个组件、
   亮暗的落法 `modeAttribute` 或 `onMode`）。渲染接线本身（各家那个 UI 组件与它的 css）归
   新包的 `components/`。
   包的 `package.json` 把本层声明成 **peerDependencies**（`"@show-docs/docusaurus-theme-iframe": "workspace:^"`，
   语义上是那份版本契约：协议变了，中心升版，消费方在**安装期**就被范围拦下，而不是等构建期工厂抛错）。
3. 外层（`ApiFramePage`、框、消息循环、地址）与框内那页的流程（取地址、接消息、报回外层）一概不用动 ——
   这就是收拢的意义。

## 编译口径

`src/index.mts` 进 `tsc`（差量清单与理由记在仓库根 README 的「构建包的编译口径」，这里不抄
第二份）。本包自己的几格：

- 入口里的 `getThemePath()` 返回 `../theme` —— 相对的是**产物**目录（`dist/`），不是 `src/`。
- `src/` 有四份：入口、注册表、交出清单那一格、安装前提那一格 —— 都要进构建项目（入口与
  配置期那一格靠它，浏览器侧的 `ApiFramePage` 也经 `lib/` 那条转出引同一份注册表源码；
  主题层的入口按 `@show-docs/docusaurus-theme-iframe/prerequisites` 引编好的第四份，而
  `lib/api-frame-theme.mts` 走相对路径引它的源码 —— 与注册表那条转出同一口径，`lib/` 不被
  本包编译，指向哪一份 `.ts` 都行）。
- 层、`components/` 与 `lib/` 都不进构建项目，`files` 因此要点名六份：
  `["components", "dist", "lib", "src/api-frame-registry.ts", "src/prerequisites.mts", "theme"]`。只发 `dist` 的话，
  包装上站点会报层目录不存在；`lib` 少了，用它的三个包在装好的站点里引不到源码；
  `src/api-frame-registry.ts` 少了，那份浏览器转出就断了；`src/prerequisites.mts` 少了，
  装好的站点里 `lib/api-frame-theme.mts` 那条相对路径就悬空。
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
- `components/api-frame.css` 与用它的组件同目录，`theme/ApiFramePage/index.tsx` 静态 import
  `../../components/api-frame.tsx` —— 磁盘上就是这个文件，未编译这一侧不存在「产物名改写」。
- 改 `theme/` 与 `components/` 不用先编译，`pnpm start` 直接生效；改注册表、交出清单或入口
  都要 `pnpm build:core`（`src/` 那三份都进 `tsc`）。这些未编译的源码归仓库根 `tsconfig.json` 检查，
  所以 `pnpm lint:type` 就是它们的门：`@theme-prev/DocItem` 的类型产地在解析器包里
  `types/theme-specifiers.d.ts`，
  `@docusaurus/router` 那几条靠仓库根那份 `module-aliases.d.ts`；
  `@theme-prev/X` 的语义见
  [plugin-prev-layer-resolver 的 README](../../plugin-prev-layer-resolver/README.md)。
