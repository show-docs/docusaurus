# Docusaurus 主题覆盖验证仓库（pnpm workspace）

使用 `pnpm` + `Docusaurus` 初始化的仓库，用于验证主题覆盖机制，并给出「多主题链式覆盖」的可落地方案。

这份 README 只管**仓库级**的事实：怎么跑、有哪些分包、什么东西放在哪。
每个方案与包的细节在它自己的 README 里，这里不抄第二份。

## 快速开始

```bash
pnpm install
pnpm start          # 本地预览 http://localhost:3000
pnpm build          # 编译需要编译的分包 + 构建静态站点
pnpm build:core     # 只用 tsc 编译那三个「构建包」（plugins/* 与 theme/*）到各自的 dist（即包出口）
pnpm lint:type      # tsc -p tsconfig.json：唯一把站点根与 *.config.mjs 纳进来的一道（提交钩子也跑）
pnpm typecheck      # tsc -b：demo 与 test 两份 composite 项目
pnpm lint:eslint    # eslint
pnpm test           # vitest 单元测试（解析语义 + 不变量 + 输入校验 + 真实 resolver 端到端）
pnpm test:coverage  # 同上 + 覆盖率（红线 100% 只挂在这里：pnpm test 全绿 ≠ CI 全绿）
pnpm verify:chain   # 读真实 build 产物，验证 4 层链式覆盖成立（先跑 pnpm build）
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

实际落点只有两处，都靠扩展名而不是 `"type"`：

| 文件                    | 为什么是 `.mjs` / `.jsx`                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| `docusaurus.config.mjs` | Docusaurus 按 `.mjs` 加载配置；无 `"type"` 时 `.js` 会被当 CJS            |
| `src/pages/index.jsx`   | 页面 glob 只收 `.js/.jsx/.ts/.tsx`（**不吃 `.mjs`**），用 `.jsx` 保留 JSX |

## 分包

仓库里的分包**按「`src/` 要不要先编译」分两种形态**，不是按「像不像一个包」：

| 目录                                  | 是什么                                                                                        | 形态                                                | 细节                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `plugins/plugin-prev-layer-resolver/` | 核心包：`@theme-prev/X` 解析器 + 层栈自动发现                                                 | 构建包（`src/` → `dist/`，改完要编译）              | [README](./plugins/plugin-prev-layer-resolver/README.md) |
| `theme/theme-markmap/`                | 主题包：md 的 frontmatter 写 `markmap: true` 即在正文上方渲染导图                             | 构建包（只编译入口与 loader；层与组件是源码）       | [示例页](./docs/markmap-demo.md)                         |
| `theme/theme-iframe/`                 | 主题包：md 的 frontmatter 写 `iframe: <目标 URL>` 时把该页包成内嵌 iframe（开发模式只给链接） | 构建包（同上，`src/` 里只有入口那一份）             | [README](./theme/theme-iframe/README.md)                 |
| `theme/theme-stoplight/`              | 主题包：md 的 frontmatter 写 `oas3: <URL>` 时整页换成 Stoplight Elements 渲染的 OpenAPI 文档  | 构建包（同上，`src/` 里只有入口那一份）             | [README](./theme/theme-stoplight/README.md)              |
| `demo/theme-{a,b,c}/`                 | 验证 / 调研用主题插件（不属于核心包）                                                         | 免编译（没有 `src/`：入口与层都是源码，站点直接吃） | [README](./demo/README.md)                               |

四个构建包都是 `tsc` 编译包：Node 侧要跑的源码 `.mts` 在包内 `src/`，产物在包内 `dist/`，
`dist/index.mjs` 就是包出口（`exports`）—— 所以 `pnpm build:core` 是「编译这四个包」，
`pnpm start` / `pnpm build` / `pnpm test` 都已经把它内置在前面。

主题包的**主题层与组件不进这份编译**：`theme/*/theme/**` 与 `theme/*/components/**` 是未编译的
`.tsx` / `.jsx`，随包发布，由用它们的站点的 babel 编译 —— 判据只有一条：**谁编译，就不编译第二遍**。
`demo/theme-*/` 是这个形态的完整版，连入口 `index.mts` 都由 Docusaurus 的 jiti 直接加载。

> **`theme/theme-iframe/` 与 `theme/theme-stoplight/` 还没接入站点**（`plugins` 里没有它们，
> 站点根也没声明它们的 workspace 依赖），所以现在各自只有一份入口被 `pnpm build:core` 编译过 ——
> 状态、接入位置与各自的触发键以 [iframe 的 README](./theme/theme-iframe/README.md)、
> [stoplight 的 README](./theme/theme-stoplight/README.md) 为准，这里不抄第二份。

### 构建包的编译口径

四份 `tsconfig.build.json` 是**同一份差量**：`extends: @nice-move/tsconfig/node-bundle.json`，
再写 `noEmit: false` 与 `rootDir` / `outDir`，能从 extends 拿的一律不重抄。这张表是这些口径的产地，
包里的注释只留指针：

| 口径                     | 内容                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 编译范围                 | 只有 `src/`，而 `src/` 里只放 **Node 侧要跑的代码**：核心包的解析器、主题包的入口与 webpack loader、类型。JSX 一份都不进 `tsc`。                                                                                                                                                                                                                     |
| 层与组件为什么不编译     | 用它们的站点会编译，编译两遍只是多出一份要 `files` 点名、会和源码漂移的产物。实测根据：`demo/theme-*/theme/**` 一直是未编译的 `.tsx`，站点收进层栈照样绿 —— `pnpm verify:chain` 打印的层栈里就有那一格。                                                                                                                                             |
| 让 `tsc` 编 JSX 要付什么 | 多一条产物口径：`react.json` 给的 `react-jsx` 会把 JSX 编成 `.js`，而包是 `"type": "module"`，服务端构建里 babel 先把 `import()` 变成 `require('./x.js')` —— 纯 ESM 模块的 parser 不认 `require`，依赖进不了 bundle，静态渲染阶段报 `Cannot find module`；要躲它得单独钉 `jsx: "preserve"`。少编译一层就少一条这种口径。                             |
| 相对 import              | 统一写**源码名**（`./x.mts` / `./x.tsx`）。编译过的由 `node-bundle.json` 的 `rewriteRelativeImportExtensions` 在产出时改成产物名（`./x.mjs`）；未编译的那份原样交给 webpack，磁盘上就是这个文件，所以两种写法都指得到。`allowImportingTsExtensions` 不用写 —— `base.json` 已给。                                                                     |
| 样式表                   | 不是模块，`tsc` 也不搬：`theme-markmap` 那份留在包根 `styles/`，走 `getClientModules()`；iframe 那份 CSS Module 直接放在用它的组件旁边。                                                                                                                                                                                                             |
| 未编译源码的类型检查     | 由仓库根 `tsconfig.json` 接手（默认 include `**/*`，`types` 同时列 `node` 与 `react` / `react-dom`）。所以构建项目不再需要 `jsx`、不需要 react 那两条 `types`，也不再需要把 `types/` 列进 `files`。`*.module.css`、`@docusaurus/router` 这类只在构建期存在的依赖，由包内一份 `module-aliases.d.ts` 引用官方 `@docusaurus/module-type-aliases` 说明。 |

其余目录不是包，只是仓库根的一部分：

| 目录     | 职责                                                                                                                           | 细节                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `docs/`  | 站点文档源（方案速览 / 导图示例；iframe 那页要等本包接进站点才有效）                                                           | [`docs/intro.md`](./docs/intro.md) |
| `test/`  | 核心包单元测试（按契约面组织）                                                                                                 | [README](./test/README.md)         |
| `src/`   | 站点侧源码；**只有 `src/theme/` 算主题层**（`src/pages/` 不是）                                                                | [README](./src/README.md)          |
| `types/` | `@theme*` specifier 的类型声明（`tsconfig.demo/test` 把它列进 `files`，仓库根与各包的源码靠默认 include 收到它，删了就类型红） | [README](./types/README.md)        |

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
- **iframe 主题**（frontmatter 触发、URL 怎么算、在层栈里放哪一格）：
  [theme/theme-iframe/README.md](./theme/theme-iframe/README.md)（尚未接入站点）
- **Stoplight 主题**（`oas3:` 触发、`@stoplight/elements` 的样式怎么圈进 `.stoplight-root`）：
  [theme/theme-stoplight/README.md](./theme/theme-stoplight/README.md)（尚未接入站点）
- **链是否真的成立**：`pnpm build && pnpm verify:chain`，判据清单以脚本输出为准

## 目录结构

「职责」比「位置」重要 —— 放错地方的代价不是不好看，而是行为变了（把 specifier 写在层外文件里
就是**硬失败**，不是「有时灵有时不灵」）。**先按「你想改什么」找，再在对应文档里看细节。**

| 你想改什么                       | 动哪里                                          | 细节                                                                                      |
| -------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 层栈怎么推导、specifier 怎么解析 | `plugins/plugin-prev-layer-resolver/`           | [README](./plugins/plugin-prev-layer-resolver/README.md)                                  |
| 导图怎么触发、渲染在哪           | `theme/theme-markmap/`                          | [示例页](./docs/markmap-demo.md)                                                          |
| 整页交给外部站点或外部文档       | `theme/theme-iframe/`、`theme/theme-stoplight/` | [iframe](./theme/theme-iframe/README.md) · [stoplight](./theme/theme-stoplight/README.md) |
| 某层包在组件外面的样子           | `demo/theme-{a,b,c}/theme/`、`src/theme/`       | [demo](./demo/README.md) · [src/theme](./src/theme/README.md)                             |
| 验证「链真的成立」               | `demo/scripts/verify-chain.mts`                 | [demo](./demo/README.md)                                                                  |
| 站点页面（**不是主题层**）       | `src/pages/`                                    | [src](./src/README.md)                                                                    |
| 站点文档                         | `docs/`                                         | [`docs/intro.md`](./docs/intro.md)                                                        |
| 单测与夹具                       | `test/`                                         | [README](./test/README.md)                                                                |
| `@theme*` 的类型声明             | `types/`                                        | [README](./types/README.md)                                                               |

仓库级只有这些不在分包里的东西：

```
dist/.tsbuildinfo/                 # `tsc -b` 的增量信息（git 忽略）；构建包的产物在各包自己目录里
tsconfig.json                      # 共享编译选项（noEmit）；demo / test 各一份 extends，四个构建包在包内自带 tsconfig.build.json
tsconfig.demo.json / tsconfig.test.json  # 两份 composite 项目，由 pnpm typecheck（tsc -b）跑
docusaurus.config.mjs              # 站点配置（.mjs：站点根不是 ESM 包，靠扩展名拿 ESM；侧栏由 docs 插件按目录自动生成）
pnpm-workspace.yaml                # pnpm 12 的配置落点：分包清单（packages:）+ 安装期依赖（configDependencies）+ 扁平化（shamefullyHoist）
eslint.config.mjs / syncpack.config.mjs / vitest.config.mts  # 三道检查各自的落点
.github/workflows/                 # CI（GitHub Actions）
```

关于 `src/`：它把两种东西放在一起，而它们**只有一种**算主题层 ——
`src/theme/` 是层栈最外层，`src/pages/` 不是。详见 [src/README.md](./src/README.md)。
