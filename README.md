# Docusaurus 主题覆盖验证仓库（pnpm workspace）

使用 `pnpm` + `Docusaurus` 初始化的仓库，用于验证主题覆盖机制，并给出「多主题链式覆盖」的可落地方案。

这份 README 只管**仓库级**的事实：怎么跑、有哪些分包、什么东西放在哪。
每个方案与包的细节在它自己的 README 里，这里不抄第二份。

## 快速开始

```bash
pnpm install
pnpm start          # 本地预览 http://localhost:3000
pnpm build          # 编译需要编译的分包 + 构建静态站点
pnpm build:core     # 只用 tsc 编译每个带 build 脚本的包到各自的 dist（= 包出口）
pnpm lint:type      # tsc -p tsconfig.json：唯一把站点根与 *.config.mjs 纳进来的一道（提交钩子也跑）
pnpm typecheck      # tsc -b：tools 与 test 两份 composite 项目
pnpm lint:eslint    # eslint + --fix（改工作树的那一份）
pnpm lint:eslint:check # 同一套规则、不写文件：pnpm verify 与 CI 用的是这一条
pnpm lint:version   # syncpack：依赖版本一致性
pnpm lint:knip      # 从入口顺着 import 图找没人引的文件 / 依赖 / 导出（只报，不删；不在 verify 里）
pnpm lint:knip:strict # 同一套判据的生产口径（--strict 隐含 --production，只认包自己那份 dependencies）
pnpm test           # vitest 单元测试（解析语义 + 不变量 + 输入校验 + 真实 resolver 端到端）
pnpm test:coverage  # 同上 + 覆盖率（红线 100% 只挂在这里：pnpm test 全绿 ≠ CI 全绿）
pnpm test:e2e       # 构建产物起服务，Playwright 在真浏览器里点开每个主题的示例页（CI 单独的 e2e 作业跑它）
pnpm verify:chain   # 读真实 build 产物，回读示例页上那条四层渲染链（src/theme > theme-c > theme-b > theme-a）
pnpm verify         # 一键全链路（组成见 package.json 的 verify；本表不复述，避免两处说法漂移）
```

> **Node 与 pnpm 的版本要求以 `package.json` 的 `engines` 为准**（当前 `^24.0.0 || ^26.0.0`）；
> CI 另外跑 `current` / `lts/*` / `lts/-1`（见 `.github/workflows/bring-it.yaml`）。
> 下界跟着**最老的受支持运行时**走（`@types/node` 与 `engines` 钉在同一档）。

## 分包

| 目录                                   | 是什么                                                                                     | 细节                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/plugin-prev-layer-resolver/` | 核心包：`@theme-prev/X` 解析器 + 层栈自动发现                                              | [README](./packages/plugin-prev-layer-resolver/README.md) · [internals](./packages/plugin-prev-layer-resolver/docs/internals.md) · [示例页](./packages/plugin-prev-layer-resolver/docs/chain-demo.md)                                  |
| `packages/plugin-compile-source/`      | 插件包：编译 `@show-docs` 家族随包发布、尚未编译的 `.ts` / `.tsx`                          | [README](./packages/plugin-compile-source/README.md) · [internals](./packages/plugin-compile-source/docs/internals.md)                                                                                                                 |
| `packages/plugin-lazy-compilation/`    | 开发期插件：客户端编译按需编译，首屏只编用到的那部分                                       | [README](./packages/plugin-lazy-compilation/README.md)                                                                                                                                                                                 |
| `themes/theme-git-badge/`              | 主题包：侧边栏里给「新建」与「更新过」的页面挂一枚纯色点（判据是 git）                     | [README](./themes/theme-git-badge/README.md) · [internals](./themes/theme-git-badge/docs/internals.md)                                                                                                                                 |
| `packages/theme-markmap/`              | 主题包：md 的 frontmatter 写 `markmap: true` 即在正文上方渲染导图                          | [README](./packages/theme-markmap/README.md) · [示例页](./packages/theme-markmap/docs/markmap-demo.md)                                                                                                                                 |
| `packages/theme-erd/`                  | 主题包：`.dbml` 文件在正文上方渲染数据库关系图                                             | [README](./packages/theme-erd/README.md) · [internals](./packages/theme-erd/docs/internals.md) · [示例页](./packages/theme-erd/docs/erd-demo.dbml)                                                                                     |
| `packages/theme-diff/`                 | 主题包：frontmatter 写 `diff:` 即在正文上方渲染它与上一版之间的差异                        | [README](./packages/theme-diff/README.md) · [internals](./packages/theme-diff/docs/internals.md) · [示例页](./packages/theme-diff/docs/diff-demo.md) · [两份对照](./packages/theme-diff/docs/diff-pair-demo.md)                        |
| `packages/theme-iframe/`               | 主题包：frontmatter 写 `iframe: <地址>` 时整页换成一个指向外部站点的框                     | [README](./packages/theme-iframe/README.md) · [internals](./packages/theme-iframe/docs/internals.md) · [示例页](./packages/theme-iframe/docs/iframe-demo.md)                                                                           |
| `packages/theme-word-count/`           | 主题包：frontmatter 写 `wordCount: true` 时在正文上方显示这一页所在内容根的文档字数        | [README](./packages/theme-word-count/README.md) · [internals](./packages/theme-word-count/docs/internals.md) · [示例页](./packages/theme-word-count/docs/word-count-demo.md)                                                           |
| `packages/theme-component-page/`       | 主题包：整页交给一个组件（`theme-iframe` 与三条 API 层是这一族的一支）                     | [README](./packages/theme-component-page/README.md) · [internals](./packages/theme-component-page/docs/internals.md) · [示例页](./packages/theme-component-page/docs/component-page-demo.md)                                           |
| `packages/theme-stoplight/`            | 主题包：frontmatter 写 `stoplight: true` 时整页交给一个同源框，框内 Elements 渲染 API 文档 | [README](./packages/theme-stoplight/README.md) · [internals](./packages/theme-stoplight/docs/internals.md) · [示例页](./packages/theme-stoplight/docs/stoplight-demo.md)                                                               |
| `packages/theme-redoc/`                | 主题包：frontmatter 写 `redoc: true` 时整页交给一个同源框，框内 Redoc 渲染 API 文档        | [README](./packages/theme-redoc/README.md) · [internals](./packages/theme-redoc/docs/internals.md) · [示例页](./packages/theme-redoc/docs/redoc-demo.md) · [AsyncAPI 示例页](./packages/theme-redoc/docs/redoc-asyncapi-demo.md)       |
| `packages/theme-scalar/`               | 主题包：frontmatter 写 `scalar: true` 时整页交给一个同源框，框内 Scalar 渲染 API 文档      | [README](./packages/theme-scalar/README.md) · [internals](./packages/theme-scalar/docs/internals.md) · [示例页](./packages/theme-scalar/docs/scalar-demo.md) · [AsyncAPI 示例页](./packages/theme-scalar/docs/scalar-asyncapi-demo.md) |
| `themes/theme-viewer/`                 | 主题包：正文里的图片交给查看器（点开放大、原尺寸、重置、前后切换）                         | [README](./themes/theme-viewer/README.md) · [internals](./themes/theme-viewer/docs/internals.md) · [示例页](./themes/theme-viewer/docs/viewer-demo.md)                                                                                 |
| `themes/theme-copy-button/`            | 主题包：页脚加一颗按钮，点一下把当前页地址写进剪贴板                                       | [README](./themes/theme-copy-button/README.md) · [示例页](./themes/theme-copy-button/docs/copy-button-demo.md)                                                                                                                         |
| `themes/theme-avatar/`                 | 主题包：导航栏挂一颗当前用户头像（站点写 `userApi` 才启用）                                | [README](./themes/theme-avatar/README.md) · [internals](./themes/theme-avatar/docs/internals.md) · [示例页](./themes/theme-avatar/docs/avatar-demo.md)                                                                                 |
| `tools/theme-{a,b,c}/`                 | 验证 / 调研用主题插件（不属于核心包；`theme-base` 是链底那一层）                           | [README](./tools/README.md)                                                                                                                                                                                                            |

十五个构建包都是 `tsc` 编译包（`src/` → `dist/`），站点按包名拿到的入口（`exports` 里 `.` 的
`default`）就是那份 `dist/index.mjs` —— 所以改完 `src/` 要 `pnpm build:core`（`pnpm start` /
`pnpm build` / `pnpm test` 都已经把它内置在前面）。

主题包的**主题层与组件不进这份编译**（未编译的 `.tsx` / `.jsx`，随包发布，由用它们的站点编译）：
判据只有一条 —— **谁编译，就不编译第二遍**。这一格由
`@show-docs/docusaurus-plugin-compile-source` 一处认领，口径逐条记在它的
[维护者文档](./packages/plugin-compile-source/docs/internals.md) 里。

> 分包要被解析，判据是**用它的那个 importer 声明了它**：收了、目录里有 `package.json` 都不算 ——
> 站点根不写 `"@show-docs/theme-a": "workspace:^"`，pnpm 就不会建链接，一路顺到 `docusaurus build`
> 才炸 `Cannot find module`。

## 基础设施包

基础设施包有四格：`plugin-prev-layer-resolver`、`plugin-compile-source`、`theme-component-page`、
`theme-iframe`。判据不是「谁比较大」，而是**有没有别的层靠它成形**：功能层回答「这一页长什么样」，
基础设施回答「这一类页怎么被交给别的东西」，并且只实现一次。四格按**一般到具体**排：

```text
功能层（theme-markmap、theme-erd、theme-diff、theme-word-count、theme-redoc、theme-scalar、theme-stoplight …）
  │  只能往下依赖
theme-iframe                 整页交给一个框
  │
theme-component-page         整页交给一个组件（上面那格的一般形态）
  │
plugin-compile-source        编译这一族未编译的 TS 源码（一条 babel 规则）
  │
plugin-prev-layer-resolver   分层与 @theme-prev/*、认槽位
  │
平台（Docusaurus / webpack / React）
```

依赖只能从具体指向一般 —— 下面那一格不知道上面是谁。这四格的规矩与「新增一层之前先问」写在
[解析器包的维护者文档](./packages/plugin-prev-layer-resolver/docs/internals.md) 的
「基础设施链的规矩」一节。

## 目录结构

站点有**两棵内容根**，各挂一份文档插件实例：

| 内容根      | 挂在哪                                     | 地址前缀  | 侧栏清单              |
| ----------- | ------------------------------------------ | --------- | --------------------- |
| `packages/` | classic 预设里那一份 docs 实例             | `/`       | `sidebars.mts`        |
| `themes/`   | 紧随徽标那一条的独立实例（`id: 'themes'`） | `/themes` | `sidebars-themes.mts` |

两份清单**共用同一份扫描逻辑**（`sidebars-lib.mts` 里那一句 `packageCategories(内容根)`）——
目录形状两边一样：每棵根的 `README.md` 是落地页，每个包的 `README.md` 是它在站点里的顶层页，
包内 `docs/` 是子页。于是「页面地址 == 文件相对**它所属那棵**内容根的路径」这条口径要按根读：
`packages/` 那一族的地址不带目录段，`themes/` 那一族带 `/themes` 那一段。

其余目录不是包，只是仓库根的一部分（判据是「有没有 `package.json`」）：

| 目录      | 职责                                                                                                   | 细节                            |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `test/`   | 单元测试与浏览器用例                                                                                   | [README](./test/README.md)      |
| `src/`    | 站点层 swizzle `src/theme/`、全站样式 `src/css/`（主页由 `packages/README.md` 承担，站点侧没有页面层） | [README](./src/theme/README.md) |
| `static/` | 原样复制到站点根的静态文件（各示例页取的那几份 OpenAPI 文档与图片）                                    | —                               |

仓库级只有这些不在分包里的东西（两棵内容根各自的 `README.md` 是例外：它们是落地页，不是包）：

```
docusaurus.config.mjs              # 站点配置（.mjs：站点根不是 ESM 包，靠扩展名拿 ESM）
sidebars.mts / sidebars-themes.mts # 两份侧栏：各自扫自己那棵包根得到包清单
sidebars-lib.mts                   # 两份侧栏共用的那一句 packageCategories(内容根)
tsconfig.json                      # 共享编译选项；tools / test 各一份 extends
tsconfig.tools.json / tsconfig.test.json  # 两份 composite 项目，由 pnpm typecheck 跑
eslint.config.mjs / syncpack.config.mjs / vitest.config.mts / playwright.config.mts  # 四道检查各自的落点
.features-gen/                       # bddgen 从 .feature 生成的 Playwright 文件（git 忽略，别手改）
patches/                           # 依赖补丁（口径见 pnpm-workspace.yaml 的注释）
.github/workflows/                 # CI（GitHub Actions）
```

`src/theme/` 是层栈最外圈的哨兵槽位（swizzle 目录，放进去就成了一层主题），`src/css/` 是全站样式；
站点侧不放组件，也不放本地插件。站点没有自己的页面层：主页就是 `packages/README.md`
（`slug: /` 落在根），`/themes/` 那一格同理。

## 验证

- **链是否真的成立**：`pnpm build && pnpm verify:chain`，判据清单以脚本输出为准
- **每个主题在浏览器里是否真的工作**：`pnpm test:e2e`（跑的是构建产物，只本地跑）；用例清单与首次要装的
  浏览器见 [test/README.md](./test/README.md)
- **把渲染器关进一个框之后要对齐的那两格**（地址栏里 `#` 那一段与站点的亮暗模式）：两条 API 层共用同一份
  实现，见 [iframe-protocol.md](./packages/theme-component-page/docs/iframe-protocol.md)
