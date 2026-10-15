# @show-docs/docusaurus-plugin-prev-layer-resolver

使用 `pnpm` + `Docusaurus` 初始化的项目，用于验证主题覆盖机制，并给出「多主题链式覆盖」的可落地方案。

## 快速开始

```bash
pnpm install
pnpm start          # 本地预览 http://localhost:3000
pnpm build          # 编译核心包 + 构建静态站点
pnpm build:core     # 只用 tsc 编译核心包（源码 plugins/plugin-prev-layer-resolver/src）到它的 dist（即包出口）
pnpm typecheck      # demo + 测试两个项目的类型（核心包源码随测试一起查；站点根配置不在这里）
pnpm lint:type      # tsc -p tsconfig.json：唯一把站点根与 *.config.mjs 纳进来的一道（提交钩子也跑）
pnpm lint:check     # eslint 只判不改（error 与 warning 一起拦：--max-warnings=0；改样式用 pnpm lint:eslint）
pnpm test           # vitest 单元测试（解析语义 + 不变量 + 输入校验 + 真实 resolver 端到端）
pnpm test:coverage  # 同上 + 覆盖率（红线 100% 只挂在这里：pnpm test 全绿 ≠ CI 全绿）
pnpm verify:chain   # 读真实 build 产物，验证 4 层链式覆盖成立（先跑 pnpm build）
pnpm verify         # 一键全链路（组成见 package.json 的 verify；本表不复述，避免两处说法漂移）
```

> **Node 版本要求：`^22.18 || ^24`**（见 `package.json` 的 `engines`）：下界不是从某条语法推出来的，
> 而是各依赖 `engines` 的最大值 —— `vitest@5` 要 `^22.12`，`@nice-move/syncpack-config` 要 `^22.18`。
> `@types/node` 钉在同一下界：类型检查跟着**最老的受支持运行时**，「只在新版才有的 API」才不会在 CI 里悄悄绿。

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

每个分包有自己的 README，细节以它为准：

| 目录                                  | 职责                                                                 | README                                                   |
| ------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `plugins/plugin-prev-layer-resolver/` | 核心包：`@theme-prev/X` 解析器 + 层栈自动发现（源码在它的 `src/`）   | [README](./plugins/plugin-prev-layer-resolver/README.md) |
| `demo/theme-{a,b,c}/`                 | 验证 / 调研用主题插件（不属于核心包）                                | [README](./demo/README.md)                               |
| `docs/`                               | 站点文档源（单页：站点首页 / 方案速览）                              | [README](./docs/intro.md)                                |
| `test/`                               | 核心包单元测试（按契约面组织）                                       | [README](./test/README.md)                               |
| `src/`                                | 站点侧源码；**只有 `src/theme/` 算主题层**（`pages` / `css` 不是）   | [README](./src/README.md)                                |
| `types/`                              | `@theme*` specifier 的类型声明（被三个 tsconfig 引用，删了就类型红） | [README](./types/README.md)                              |

上表只有前三行是 **pnpm workspace 包**（`plugins/*` / `demo/*` 下各自有 `package.json`，
也在 `pnpm-workspace.yaml` 的 `packages:` 里）；其余是仓库根的目录，不是包 —— 判据是
「有没有 `package.json`」，不是「像不像一个包」。

> 分包要被解析，判据是**用它的那个 importer 声明了它**：`packages:` 里收了、目录里有
> `package.json` 都不算，站点根不写 `"@show-docs/theme-a": "workspace:^"`，pnpm 就不会建链接，
> 一路顺到 `docusaurus build` 才炸 `Cannot find module`。`test/plugin.test.mts` 有一条用例
> 直接问 Node 要四个包名的解析结果，把这一步提前到 `pnpm test`。

## 链式覆盖方案（速览）

`@theme-original/X` 是**每个组件一个全局值**，只能等于层栈里的某一层；而链上每一层想要的是
「**我自己下面那一层**」—— 多个消费者要多个不同答案，一个全局别名原理上无法同时满足。
所以本方案**不碰它**，另开一个新 specifier（`@theme-prev`），
在 webpack resolve 阶段按「导入者属于哪一层」逐次改写，层栈全部自动推导。

- 完整方案与接入方式：[plugin-prev-layer-resolver 的 README](./plugins/plugin-prev-layer-resolver/README.md)
- 包级速览：[`plugins/plugin-prev-layer-resolver/README.md`](./plugins/plugin-prev-layer-resolver/README.md)

## 基础验证结论（未使用链式方案时）

1. **多个主题覆盖同一个组件** → 后声明的主题完全覆盖前者，前者被静默丢弃，不叠加也不链式。
2. **`@theme-original` 的语义** → 它与 `@theme` 指向**同一个文件**；
   只有在站点层 `src/theme` 里使用才等于「上一层实现」，插件主题里使用会指向自己（自引用 → 无限递归 / OOM）。
3. **`@theme-init` 的语义** → 第一次冲突时被顶掉的那个实现（首个覆盖者），
   **不是** theme-fallback；因此在「最靠前的插件主题」内部同样会指向自己。
4. **能链式包裹的只有站点层** → `src/theme` 用 `@theme-original` 可包住最后一层插件主题，再往里没有合法别名。
5. **多个 plugin 用 wrap 模式改同一组件无法链式** → 插件主题里 `@theme-original` 指向自己（OOM），
   `@theme-init` 指向的是 preset 主题（如 theme-classic）而非上一个 plugin，最多只能保住一层。

## 目录结构

「职责」比「位置」重要 —— 放错地方的代价不是不好看，而是行为变了（把 specifier 写在层外文件里
就是**硬失败**，不是「有时灵有时不灵」）。**先按「你想改什么」找，再在对应 README 里看细节。**

| 你想改什么                        | 动哪里                                    | 细节                                                          |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| 层栈怎么推导、specifier 怎么解析  | `plugins/plugin-prev-layer-resolver/`     | [README](./plugins/plugin-prev-layer-resolver/README.md)      |
| 某层包在组件外面的样子            | `demo/theme-{a,b,c}/theme/`、`src/theme/` | [demo](./demo/README.md) · [src/theme](./src/theme/README.md) |
| 验证「链真的成立」                | `demo/scripts/verify-chain.mts`           | [demo](./demo/README.md)                                      |
| 站点页面 / 样式（**不是主题层**） | `src/pages/`、`src/css/`                  | [src](./src/README.md)                                        |
| 单测与夹具                        | `test/`                                   | [README](./test/README.md)                                    |
| `@theme*` 的类型声明              | `types/`                                  | [README](./types/README.md)                                   |
| 站点文档（速览）                  | `docs/intro.md`                           | [README](./docs/intro.md)                                     |

仓库级只有这些不在分包里的东西：

```
dist/.tsbuildinfo/                 # `tsc -b` 的增量信息（git 忽略）；核心包产物在包自己目录里
tsconfig.json       # 共享编译选项；core（唯一 emit 产物）/ demo / test 各一份 extends
docusaurus.config.mjs  # 站点配置（.mjs：站点根不是 ESM 包，靠扩展名拿 ESM；侧栏由 docs 插件按目录自动生成）
pnpm-workspace.yaml # pnpm 12 的配置落点：分包清单（packages:）+ 依赖构建白名单（allowBuilds）；.npmrc 管 peer 策略
```

关于 `src/`：它把三种东西放在一起，而它们**只有一种**算主题层 ——
`src/theme/` 是层栈最外层，`src/pages/` 与 `src/css/` 不是。详见 [src/README.md](./src/README.md)。
