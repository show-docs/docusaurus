# Docusaurus 主题覆盖验证仓库（pnpm workspace）

使用 `pnpm` + `Docusaurus` 初始化的仓库，用于验证主题覆盖机制，并给出「多主题链式覆盖」的可落地方案。

这份 README 只管**仓库级**的事实：怎么跑、有哪些分包、什么东西放在哪。
每个方案与包的细节在它自己的 README 里，这里不抄第二份。

## 快速开始

```bash
pnpm install
pnpm start          # 本地预览 http://localhost:3000
pnpm build          # 编译需要编译的分包 + 构建静态站点
pnpm build:core     # 只用 tsc 编译那六个「构建包」（核心包 + theme/theme-* 那五个主题包）到各自的 dist（即包出口）；theme/theme-iframe 的 lib/ 不在里面，那份共享源码不发编译产物
pnpm lint:type      # tsc -p tsconfig.json：唯一把站点根与 *.config.mjs 纳进来的一道（提交钩子也跑）
pnpm typecheck      # tsc -b：demo 与 test 两份 composite 项目
pnpm lint:eslint    # eslint
pnpm test           # vitest 单元测试（解析语义 + 不变量 + 输入校验 + 真实 resolver 端到端）
pnpm test:coverage  # 同上 + 覆盖率（红线 100% 只挂在这里：pnpm test 全绿 ≠ CI 全绿）
pnpm test:e2e       # 构建产物起服务，Playwright 在真浏览器里点开每个主题的示例页（只本地跑）
pnpm verify:chain   # 读真实 build 产物，回读主页那条四层渲染链（src/theme > theme-c > theme-b > theme-a）
pnpm verify         # 一键全链路（组成见 package.json 的 verify；本表不复述，避免两处说法漂移）
```

> **Node 版本要求以 `package.json` 的 `engines` 为准**（当前 `^24.0.0`）；CI 另外跑 `current` / `lts/*` / `lts/-1`
> （见 `.github/workflows/bring-it.yaml`）。
> 这条下界的来历是「跟着**最老的受支持运行时**」：`@types/node` 与 `engines` 钉在同一档，
> 「只在新版才有的 API」才不会在 CI 里悄悄绿。当前 `@types/node` 是 `^22.18.0`，比 `engines` 低一档。

### 站点根为什么**不**是 ESM 包

站点根 `package.json` **刻意不写 `"type": "module"`**，配置用 `.mjs` 扩展名拿 ESM。
这是修 `.docusaurus/` 里 `require.resolveWeak` 报错的**唯一**产地：

webpack 按「扩展名 + 最近 `package.json` 的 `type`」给模块判型。根上写了 `"type": "module"`，
Docusaurus 生成的 `.docusaurus/*.js`（CJS 风格）就会被判成 `javascript/esm`，
`require.resolveWeak(...)` 不被改写、原样进产物，而 SSG 注入的 `require` 没有它 ——
`pnpm build` 当场死在 `TypeError: require.resolveWeak is not a function`。

**这不是本仓库代码的问题**（零自定义插件的最小站点 + `"type": "module"` 同样红）。
不该为它给 webpack 打判型补丁（那会让所有源码被降级成 `javascript/auto`，`import` 语义变了
比原报错更难查），也不该让源码为它改回 CJS —— 去掉根上的 `"type"` 才是对准根因：
`.docusaurus/` 是构建中间产物，模块格式该由生成它的代码（CJS 风格）决定。

实际落点只有一处，靠扩展名而不是 `"type"`：

| 文件                    | 为什么是 `.mjs`                                                |
| ----------------------- | -------------------------------------------------------------- |
| `docusaurus.config.mjs` | Docusaurus 按 `.mjs` 加载配置；无 `"type"` 时 `.js` 会被当 CJS |

## 分包

仓库里的分包**按「`src/` 要不要先编译」分两种形态**，不是按「像不像一个包」：

| 目录                                  | 是什么                                                                                                                                                                                                                                         | 形态                                                      | 细节                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| `plugins/plugin-prev-layer-resolver/` | 核心包：`@theme-prev/X` 解析器 + 层栈自动发现                                                                                                                                                                                                  | 构建包（`src/` → `dist/`，改完要编译）                    | [README](./plugins/plugin-prev-layer-resolver/README.md) |
| `theme/theme-markmap/`                | 主题包：md 的 frontmatter 写 `markmap: true` 即在正文上方渲染导图                                                                                                                                                                              | 构建包（只编译入口与 loader；层与组件是源码）             | [示例页](./docs/markmap-demo.md)                         |
| `theme/theme-iframe/`                 | 主题包，也是「整页交给一个框」这一族唯一的**外层套壳**：它的 `DocItem` 按 `lib/api-frame-registry.ts` 的顺序判 `scalar:` / `redoc:` / `oas3:` / `iframe:` 四把键，命中就换成通用框；`lib/` 里另住着三条 API 层共用的跨 iframe 约定与配置期工厂 | 构建包（同上，`src/` 里只有入口那一份；`lib/` 免编译）    | [README](./theme/theme-iframe/README.md)                 |
| `theme/theme-stoplight/`              | 主题包：md 的 frontmatter 写 `oas3: <URL>` 时整页换成一个 iframe（外层那格由 theme-iframe 承接），框里是本包自己那条 `/stoplight-view` 页面，Elements 在那份文档里渲染 API 文档                                                                | 构建包（同上，`src/` 里只有入口那一份，且是调工厂的一次） | [README](./theme/theme-stoplight/README.md)              |
| `theme/theme-redoc/`                  | 主题包：md 的 frontmatter 写 `redoc: <URL>` 时整页换成一个 iframe（外层那格由 theme-iframe 承接），框里是本包自己那条 `/redoc-view` 页面，Redoc 在那份文档里渲染 API 文档                                                                      | 构建包（同上，`src/` 里只有入口那一份，且是调工厂的一次） | [README](./theme/theme-redoc/README.md)                  |
| `theme/theme-scalar/`                 | 主题包：md 的 frontmatter 写 `scalar: <URL>` 时整页换成一个 iframe（外层那格由 theme-iframe 承接），框里是本包自己那条 `/scalar-view` 页面，Scalar 在那份文档里渲染 API 文档                                                                   | 构建包（同上，`src/` 里只有入口那一份，且是调工厂的一次） | [README](./theme/theme-scalar/README.md)                 |
| `demo/theme-{a,b,c}/`                 | 验证 / 调研用主题插件（不属于核心包）                                                                                                                                                                                                          | 免编译（没有 `src/`：入口与层都是源码，站点直接吃）       | [README](./demo/README.md)                               |

六个构建包都是 `tsc` 编译包：Node 侧要跑的源码 `.mts` 在包内 `src/`，产物在包内 `dist/`，
`dist/index.mjs` 就是包出口（`exports`）—— 所以 `pnpm build:core` 是「编译这六个包」，
`pnpm start` / `pnpm build` / `pnpm test` 都已经把它内置在前面。

主题包的**主题层与组件不进这份编译**：`theme/*/theme/**` 与 `theme/*/components/**` 是未编译的
`.tsx` / `.jsx`，随包发布，由用它们的站点的 babel 编译 —— 判据只有一条：**谁编译，就不编译第二遍**。
`demo/theme-*/` 是这个形态的完整版，连入口 `index.mts` 都由 Docusaurus 的 jiti 直接加载。
`theme/theme-iframe/lib/` 里那一份（注册表、跨 iframe 共享约定、配置期工厂）是同一判据推到头的
另一格：它没有编译产物 —— 浏览器那几份由用它的包直接引源码；注册表是纯数据，配置期与浏览器期
引的是**同一份**；唯一跑在 Node 配置期的 `api-frame-theme.mts` 由 Docusaurus 的 jiti 直接吃这份
源码（`.mts` 后缀按上游 lint preset 标 Node 环境，与 `src/index.mts` 同一口径）。`exports` 用
`./lib/*` 把源码交给用它的包，`build:core` 编译本包时也只产入口那一份。

> **`theme/theme-iframe/`、`theme/theme-stoplight/`、`theme/theme-redoc/` 与
> `theme/theme-scalar/` 已接进站点**
> （`plugins` 里的顺序 = `@theme/` 层栈的覆写顺序，四者都在 `theme-markmap` 往外那一侧；但
> 「整页交给一个框」四把键的**判定顺序**不住在这里，住在 theme-iframe 的注册表里 —— 三条 API 层
> 已经没有自己的 `DocItem` 了），接入位置、触发键与
> 各自验证到哪一步以 [iframe 的 README](./theme/theme-iframe/README.md)、
> [stoplight 的 README](./theme/theme-stoplight/README.md)、
> [redoc 的 README](./theme/theme-redoc/README.md)、
> [scalar 的 README](./theme/theme-scalar/README.md) 为准，这里不抄第二份。
> `theme/theme-iframe/lib/` 那一份不在 `plugins` 的重名层里：它不是 Docusaurus 插件，也不是一条
> 主题层，被上面那三条 API 层当普通依赖用（`"@show-docs/docusaurus-theme-iframe": "workspace:^"`）。

### 构建包的编译口径

六份 `tsconfig.build.json` 是**同一份差量**：`extends: @nice-move/tsconfig/node-bundle.json`，
再写 `noEmit: false` 与 `rootDir` / `outDir`，能从 extends 拿的一律不重抄。这张表是这些口径的产地，
包里的注释只留指针：

| 口径                     | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 编译范围                 | 只有 `src/`，而 `src/` 里只放 **Node 侧要跑的代码**：核心包的解析器、主题包的入口与 webpack loader、类型。JSX 一份都不进 `tsc`。                                                                                                                                                                                                                                                                                                                   |
| 层与组件为什么不编译     | 用它们的站点会编译，编译两遍只是多出一份要 `files` 点名、会和源码漂移的产物。实测根据：`demo/theme-*/theme/**` 一直是未编译的 `.tsx`，站点收进层栈照样绿 —— `pnpm verify:chain` 打印的层栈里就有那一格。                                                                                                                                                                                                                                           |
| 让 `tsc` 编 JSX 要付什么 | 多一条产物口径：`react.json` 给的 `react-jsx` 会把 JSX 编成 `.js`，而包是 `"type": "module"`，服务端构建里 babel 先把 `import()` 变成 `require('./x.js')` —— 纯 ESM 模块的 parser 不认 `require`，依赖进不了 bundle，静态渲染阶段报 `Cannot find module`；要躲它得单独钉 `jsx: "preserve"`。少编译一层就少一条这种口径。                                                                                                                           |
| 相对 import              | 统一写**源码名**（`./x.mts` / `./x.tsx`）。编译过的由 `node-bundle.json` 的 `rewriteRelativeImportExtensions` 在产出时改成产物名（`./x.mjs`）；未编译的那份原样交给 webpack，磁盘上就是这个文件，所以两种写法都指得到。`allowImportingTsExtensions` 不用写 —— `base.json` 已给。                                                                                                                                                                   |
| 样式表                   | 不是模块，`tsc` 也不搬：`theme-markmap` 那份留在包根 `styles/`，走 `getClientModules()`；iframe 那份 CSS Module 直接放在用它的组件旁边。第三方那份**静态**样式表（`@stoplight/elements`）不进这条流水线：由 `theme-stoplight` 的入口在构建配置期把它从「打进全站那一份 css」改成「单独一个产物」，只由框内那份文档 `<link>`（口径见它的 README 的「样式」一节）。                                                                                  |
| 未编译源码的类型检查     | 由仓库根 `tsconfig.json` 接手（默认 include `**/*`，`types` 同时列 `node` 与 `react` / `react-dom`）。所以构建项目不再需要 `jsx`、不需要 react 那两条 `types`。`@theme*` 那三条 specifier 的声明归解析器包（`plugins/plugin-prev-layer-resolver/types/`），由 `tsconfig.demo/test` 列进 `files`。`*.module.css`、`@docusaurus/router` 这类只在构建期存在的依赖，由包内一份 `module-aliases.d.ts` 引用官方 `@docusaurus/module-type-aliases` 说明。 |

其余目录不是包，只是仓库根的一部分：

| 目录      | 职责                                                                        | 细节                               |
| --------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `docs/`   | 站点文档源：`intro.md` **就是主页**（卡片列表），每个主题包一份 `*-demo.md` | [`docs/intro.md`](./docs/intro.md) |
| `test/`   | 核心包单元测试（按契约面组织）                                              | [README](./test/README.md)         |
| `src/`    | 只剩站点层 swizzle `src/theme/`（主页由 docs 承担，站点侧没有页面层）       | [README](./src/theme/README.md)    |
| `static/` | 原样复制到站点根的静态文件（示例页要取的那份 OpenAPI 文档）                 | —                                  |

上表的 `plugins/*`、`theme/*`、`demo/*` 是 **pnpm workspace 包**（各自有 `package.json`，
也在 `pnpm-workspace.yaml` 的 `packages:` 里）；其余是仓库根的目录，不是包 —— 判据是
「有没有 `package.json`」。

> 分包要被解析，判据是**用它的那个 importer 声明了它**：`packages:` 里收了、目录里有
> `package.json` 都不算，站点根不写 `"@show-docs/theme-a": "workspace:^"`，pnpm 就不会建链接，
> 一路顺到 `docusaurus build` 才炸 `Cannot find module`。`test/plugin.test.mts` 有一条用例
> 把核心包与 demo 的三个主题按 Node 的 ESM 规则解析一遍，把这一步提前到 `pnpm test`
> （清单里的 `theme/*` 还没进那条用例的目录列表）。

## 方案在哪份文档里

- **多主题链式覆盖**（为什么官方别名做不到、`@theme-prev/X` 怎么解析、怎么接入、有哪些约束）：
  [plugins/plugin-prev-layer-resolver/README.md](./plugins/plugin-prev-layer-resolver/README.md)
- **导图主题**（frontmatter 触发、渲染位置、明暗跟随全站主题）：
  行为见 [docs/markmap-demo.md](./docs/markmap-demo.md)，实现见 `theme/theme-markmap/`（入口与
  loader 在 `src/`，层与组件在 `theme/`、`components/`）
- **iframe 主题**（frontmatter 触发、URL 怎么算、在层栈里放哪一格、命中时丢掉的是哪一块）：
  行为见 [docs/iframe-demo.md](./docs/iframe-demo.md)，实现见
  [theme/theme-iframe/README.md](./theme/theme-iframe/README.md)
- **Stoplight 主题**（`oas3:` 触发、渲染为什么挪到本包自己那条 `/stoplight-view` 页面、那份静态
  样式表怎么只出现在框内那一页、浏览器 bundle 要补哪几样 Node 侧依赖）：
  行为见 [docs/stoplight-demo.md](./docs/stoplight-demo.md)（示例取
  `static/openapi.yaml`），实现见
  [theme/theme-stoplight/README.md](./theme/theme-stoplight/README.md)
- **Redoc 主题**（`redoc:` 触发、渲染为什么挪到本包自己那条 `/redoc-view` 页面、样式为什么不需要
  构建期处理而暗色表仍要在运行期改挂）：
  行为见 [docs/redoc-demo.md](./docs/redoc-demo.md)（同一份 `static/openapi.yaml`），实现见
  [theme/theme-redoc/README.md](./theme/theme-redoc/README.md)
- **Scalar 主题**（`scalar:` 触发、渲染为什么挪到本包自己那条 `/scalar-view` 页面、它的静态样式表
  为什么拦不住而只能靠 `.scalar-app` 那层前缀、亮暗为什么落在 `<body>` 那两个类名上）：
  行为见 [docs/scalar-demo.md](./docs/scalar-demo.md)（同一份 `static/openapi.yaml`），实现见
  [theme/theme-scalar/README.md](./theme/theme-scalar/README.md)
- **把渲染器关进一个框之后要对齐的那两格**（地址栏里 `#` 那一段与站点的亮暗模式，两边怎么跨文档
  送、为什么要各推一次）：
  [theme/theme-iframe/docs/iframe-protocol.md](./theme/theme-iframe/docs/iframe-protocol.md) —— 上面三条 API 层共用同一份实现
- **链是否真的成立**：`pnpm build && pnpm verify:chain`，判据清单以脚本输出为准
- **每个主题在浏览器里是否真的工作**：`pnpm test:e2e`（跑的是构建产物，只本地跑）。用例是
  Given/When/Then 句子（Gherkin 写在 `test/e2e/features/`，步骤实现在 `test/e2e/steps/`），
  用例清单与首次要装的浏览器见 [test/README.md](./test/README.md)

## 目录结构

「职责」比「位置」重要 —— 放错地方的代价不是不好看，而是行为变了（把 specifier 写在层外文件里
就是**硬失败**，不是「有时灵有时不灵」）。**先按「你想改什么」找，再在对应文档里看细节。**

| 你想改什么                       | 动哪里                                                                                                                                                     | 细节                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 层栈怎么推导、specifier 怎么解析 | `plugins/plugin-prev-layer-resolver/`                                                                                                                      | [README](./plugins/plugin-prev-layer-resolver/README.md)                                                                                                                                                                                                                                                                                                                                                        |
| 导图怎么触发、渲染在哪           | `theme/theme-markmap/`                                                                                                                                     | [示例页](./docs/markmap-demo.md)                                                                                                                                                                                                                                                                                                                                                                                |
| 整页交给外部站点或外部文档       | `theme/theme-iframe/`（跨 iframe 那两格在同包 `lib/` 与 `docs/iframe-protocol.md`）、`theme/theme-stoplight/`、`theme/theme-redoc/`、`theme/theme-scalar/` | [示例页](./docs/iframe-demo.md) · [stoplight 示例页](./docs/stoplight-demo.md) · [redoc 示例页](./docs/redoc-demo.md) · [scalar 示例页](./docs/scalar-demo.md) · [iframe](./theme/theme-iframe/README.md) · [跨 iframe 约定](./theme/theme-iframe/docs/iframe-protocol.md) · [stoplight](./theme/theme-stoplight/README.md) · [redoc](./theme/theme-redoc/README.md) · [scalar](./theme/theme-scalar/README.md) |
| 某层包在组件外面的样子           | `demo/theme-{a,b,c}/theme/`、`src/theme/`                                                                                                                  | [demo](./demo/README.md) · [src/theme](./src/theme/README.md)                                                                                                                                                                                                                                                                                                                                                   |
| 验证「链真的成立」               | `demo/scripts/verify-chain.mts`                                                                                                                            | [demo](./demo/README.md)                                                                                                                                                                                                                                                                                                                                                                                        |
| 站点主页与文档                   | `docs/`（`intro.md` 带 `slug: /`，路由前缀在配置里挪到根）                                                                                                 | [`docs/intro.md`](./docs/intro.md)                                                                                                                                                                                                                                                                                                                                                                              |
| 单测、浏览器用例与夹具           | `test/`（e2e 的句子在 `test/e2e/features/`，实现在 `test/e2e/steps/`）                                                                                     | [README](./test/README.md)                                                                                                                                                                                                                                                                                                                                                                                      |
| `@theme*` 的类型声明             | `plugins/plugin-prev-layer-resolver/types/`                                                                                                                | [README「类型声明」](./plugins/plugin-prev-layer-resolver/README.md)                                                                                                                                                                                                                                                                                                                                            |

仓库级只有这些不在分包里的东西：

```
dist/.tsbuildinfo/                 # `tsc -b` 的增量信息（git 忽略）；构建包的产物在各包自己目录里
tsconfig.json                      # 共享编译选项（noEmit）；demo / test 各一份 extends，六个构建包在包内自带 tsconfig.build.json
tsconfig.demo.json / tsconfig.test.json  # 两份 composite 项目，由 pnpm typecheck（tsc -b）跑
docusaurus.config.mjs              # 站点配置（.mjs：站点根不是 ESM 包，靠扩展名拿 ESM；侧栏由 docs 插件按目录自动生成；docs 的路由前缀是 '/'，所以主页就是 docs/intro.md）
pnpm-workspace.yaml                # pnpm 12 的配置落点：分包清单（packages:）+ 安装期依赖（configDependencies）+ 依赖安装脚本放行名单（allowBuilds）+ 扁平化（shamefullyHoist）
eslint.config.mjs / syncpack.config.mjs / vitest.config.mts / playwright.config.mts  # 四道检查各自的落点（后者同时是 BDD 的落点：`defineBddConfig()` 说清 `.feature` 与步骤在哪，`testDir` 由它给出）
.features-gen/                       # `bddgen` 从 `.feature` 生成的 Playwright 文件（git 忽略，别手改）
.github/workflows/                 # CI（GitHub Actions）
```

关于 `src/`：它现在只有主题层那一种东西 —— `src/theme/` 是层栈最外圈的哨兵槽位。
站点不再有自己的页面层：主页就是 `docs/intro.md`（配置把 docs 的路由前缀挪到根，那份
frontmatter 写 `slug: /`）。历史上 `src/pages/` 在的那一格讲的是「specifier 写在层外文件里
必定硬失败」，那条口径的产地在
[插件 README 的使用约束①](./plugins/plugin-prev-layer-resolver/README.md)。
