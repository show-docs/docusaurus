# theme-iframe 维护者文档

这份写的是**改这一族之前要知道的事**：包内组成、接入站点验到哪一步、新增一条 API 层要动哪几格、
本包的编译口径。使用者要看的（`iframe:` 怎么用、判定清单与覆盖、已知的边界）在
[`README.md`](../README.md)，跨 iframe 的约定在 [`iframe-protocol.md`](./iframe-protocol.md)。

源码注释里那些「理由见包 README『…』一节」的指针，落在本节这些章节上的已经改指这份文件。

## 状态：已接入站点

`docusaurus.config.mjs` 的 `plugins` 里排在 `@show-docs/docusaurus-theme-markmap` **之后**。
四条 API 相关层的先后不再决定判定优先级 —— 优先级住在注册表里（见 README 的「放在层栈的哪一处」一节），
`plugins` 顺序现在只决定 `@theme-prev` 链上「本层 vs markmap」的相对位置。站点根的
`package.json` 声明了 `"@show-docs/docusaurus-theme-iframe": "workspace:^"`。
`pnpm build` 与 `pnpm verify:chain` 都绿，推导出的层栈里有 `theme/theme-iframe/theme`。
这一层提供的是 `DocItem`，`@theme-prev/DocItem` 落回 `theme-markmap` 那一层；
`DocItem/Content` 那根链上现在只有官方一份实现。

产物侧能看到的是这一层进了链、`components/api-frame.css` 编译进了站点样式；页面里真的嵌出
外部站点只能在浏览器看（`pnpm build && pnpm serve`）。浏览器里的实测记在仓库根的 e2e
（`test/e2e/features/iframe.feature`，跑法见 [`test/README.md`](../../../test/README.md)）。

包名挂 `@show-docs/`，与仓库其它包同一域，所以列进 `test/plugin.test.mts` 那条分包用例的目录清单
只差改清单本身。

## 组成

| 文件                        | 编译吗              | 职责                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`             | ✅ `src/` → `dist/` | 本层入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算，就是 `../theme`）；`iframe:` 那条键没有框内页面要注册                                                                                                                                                                                                                                                                         |
| `theme/DocItem/index.tsx`   | ❌ 站点编译         | **这一族唯一的外层套壳**：拿 `resolveFrameDistribution()` 的清单判四把键，命中就换成 `ApiFrame`，不命中整个交回下层；开发模式把清单那份 `warnings` 交给 `warnFrameDistribution()`                                                                                                                                                                                                           |
| `components/api-frame.tsx`  | ❌ 站点编译         | 通用框：`internal` 条目拼 `/…-view` 地址并挂消息循环，`external` 条目走 `lib/frame-messages.ts` 的 `externalFrameURL()`（补 origin、`?path=` 再解一层）；`<iframe>` 恒挂 `.api-frame` + 本层 `frameClass` 两个类名；`title` 优先用页面的 `frontMatter.title`，注册表那条只兜底                                                                                                              |
| `components/api-frame.css`  | ❌ 站点编译         | **四条层共用的那一格版式**：`.api-frame` 定高占满 navbar 以下那一屏、`display: block`、去边框，`.container:has(iframe)` 那条正文容器让位，`.main-wrapper:has(.api-frame) + .footer` 收掉站点页脚（这条以前只有 stoplight 一份，另三层漏）；目前没有只属于一层的规则，各层那个专属类名只用来认赢家                                                                                           |
| `lib/index.ts`              | ❌ 站点编译         | 浏览器侧共享约定的出口（供三条 API 层引）；**不含**配置期那份工厂，免得 `node:path` 进浏览器 bundle                                                                                                                                                                                                                                                                                         |
| `lib/api-frame-registry.ts` | ❌ 站点编译         | 注册表：四条形同的条目（命名空间、frontmatter 键、类名、路由名……），纯数据不引 React，配置期与浏览器期引同一份                                                                                                                                                                                                                                                                              |
| `lib/api-frame-entries.ts`  | ❌ 站点编译         | 判定清单的分发：装了的层参与判定（覆盖也不放宽这一条），注册表顺序为默认，站点可在本层插件选项 `themeConfig.apiFrame.order` 里覆盖顺序与子集；落空原因进 `warnings`，同在这份里的 `warnFrameDistribution()` 负责去重后打到控制台（开发模式由 `DocItem` 调）；两边都不引 React，单测（`test/api-frame-entries.test.mts`）与 `DocItem` 引同一份                                               |
| `lib/api-frame-messages.ts` | ❌ 站点编译         | 按命名空间造那三条 postMessage 的名字，带缓存（同一命名空间每次拿到同一个对象，effect 依赖不换引用）                                                                                                                                                                                                                                                                                        |
| `lib/api-frame-view.tsx`    | ❌ 站点编译         | **浏览器期**的框内工厂：三条层的 `theme/XxxPage` 各调它一次，交包名、渲染接线那个组件、亮暗的落法（`modeAttribute` 或 `onMode`）；注册表守卫、取 spec 地址、接住外层送来的两格、报回外层都在这一份里，单测 `test/api-frame-view.test.mts`；那份渲染接线的入参类型 `ApiFrameViewProps` 也住在这里，三个组件（redoc / stoplight / scalar 各自的 `components/*-ui.tsx`）引同一份，不再各写一遍 |
| `lib/api-frame-theme.mts`   | ❌ 不进 `tsc`       | **配置期**入口工厂：三条 API 层的 `src/index.mts` 调它拿 Plugin 形状（挂层目录、注册框内那条路由、接各自的 webpack 差异）；`.mts` 后缀按上游 lint preset 标 Node 环境                                                                                                                                                                                                                       |
| `lib/frame-messages.ts`     | ❌ 站点编译         | 约定与形状：iframe 地址（框内那条拼与拆、`iframe:` 那条 `externalFrameURL()`）、三条 postMessage（纯函数，不引 React、不引 DOM）                                                                                                                                                                                                                                                            |
| `lib/frame-sync.ts`         | ❌ 站点编译         | 两侧的消息循环：`useOuterFrameSync` / `useInnerFrameSync` / `createRouteReporter`，含两边都过的来源校验 `isTrustedMessage`（引 DOM 类型的只有这一份，注册表那条配置期链路碰不到 `Window`）                                                                                                                                                                                                  |
| `docs/iframe-protocol.md`   | ——                  | 那份共享约定的口径与踩过的坑（含注册表一节）（原 `theme/frame-kit/README.md`）                                                                                                                                                                                                                                                                                                              |
| `module-aliases.d.ts`       | 类型                | 引官方 `@docusaurus/module-type-aliases`，给构建期才存在的那些 import 补类型                                                                                                                                                                                                                                                                                                                |
| `tsconfig.build.json`       | ——                  | 构建项目：只有 `src/`，所以本包的产物出口是 `dist/index.mjs`；`lib/` 与 `components/`、`theme/` 都不进 `tsc`                                                                                                                                                                                                                                                                                |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/` 里的
`.tsx`，本包就不编译第二遍；`lib/api-frame-theme.mts` 是唯一的例外形态：它既不由站点编译，
也不由本包编译，而是 jiti（Docusaurus 的配置加载器）在配置期直接吃这份源码。口径的产地在仓库根
README 的「构建包的编译口径」。

## 新增一条 API 层要动哪里

1. `lib/api-frame-registry.ts` 加一条（命名空间、键名、路由名、参数名、类名、`@theme/` 别名、
   `title` 兜底值）。想让某个站点换判定先后或只放行其中几把，不用改这里 —— 插件选项里那条
   `order`（见 README 的「放在层栈的哪一处」一节）。新层的包还要把本层写进它自己的 `peerDependencies`（版本契约的口径见
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
- `components/api-frame.css` 与用它的组件同目录，`theme/DocItem/index.tsx` 静态 import
  `../../components/api-frame.tsx` —— 磁盘上就是这个文件，未编译这一侧不存在「产物名改写」。
- 改 `theme/` 与 `components/` 不用先编译，`pnpm start` 直接生效；改注册表也一样（两边都是
  源码），改入口才要 `pnpm build:core`。这些未编译的源码归仓库根 `tsconfig.json` 检查，
  所以 `pnpm lint:type` 就是它们的门：`@theme-prev/DocItem` 的类型产地在解析器包里
  [`types/theme-specifiers.d.ts`](../../../plugins/plugin-prev-layer-resolver/types/theme-specifiers.d.ts)，
  `@docusaurus/router` 那几条靠包根的 `module-aliases.d.ts`；
  `@theme-prev/X` 的语义见
  [plugin-prev-layer-resolver 的 README](../../../plugins/plugin-prev-layer-resolver/README.md)。
