# Docusaurus 主题覆盖验证仓库（pnpm workspace）

使用 `pnpm` + `Docusaurus` 初始化的仓库，用于验证主题覆盖机制，并给出「多主题链式覆盖」的可落地方案。

这份 README 只管**仓库级**的事实：怎么跑、有哪些分包、什么东西放在哪。
每个方案与包的细节在它自己的 README 里，这里不抄第二份。

## 快速开始

```bash
pnpm install
pnpm start          # 本地预览 http://localhost:3000
pnpm build          # 编译需要编译的分包 + 构建静态站点
pnpm build:core     # 只用 tsc 编译每个带 build 脚本的包（眼下十四个：两个插件包 + 十二个主题包，都在 `packages/*` 下）到各自的 dist（即包出口）；packages/theme-iframe 的 lib/ 不在里面，那份共享源码不发编译产物
pnpm lint:type      # tsc -p tsconfig.json：唯一把站点根与 *.config.mjs 纳进来的一道（提交钩子也跑）
pnpm typecheck      # tsc -b：tools 与 test 两份 composite 项目
pnpm lint:eslint    # eslint + --fix（改工作树的那一份）
pnpm lint:eslint:check # 同一套规则、不写文件：pnpm verify 与 CI 用的是这一条
pnpm test           # vitest 单元测试（解析语义 + 不变量 + 输入校验 + 真实 resolver 端到端）
pnpm test:coverage  # 同上 + 覆盖率（红线 100% 只挂在这里：pnpm test 全绿 ≠ CI 全绿）
pnpm test:e2e       # 构建产物起服务，Playwright 在真浏览器里点开每个主题的示例页（CI 单独的 e2e 作业跑它）
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

| 目录                                   | 是什么                                                                                                                                                                                                                                                                                                                          | 形态                                                                                         | 细节                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/plugin-prev-layer-resolver/` | 核心包：`@theme-prev/X` 解析器 + 层栈自动发现                                                                                                                                                                                                                                                                                   | 构建包（`src/` → `dist/`，改完要编译）                                                       | [README](./packages/plugin-prev-layer-resolver/README.md) · [internals](./packages/plugin-prev-layer-resolver/docs/internals.md)                                                                                      |
| `packages/plugin-lazy-compilation/`    | 开发期插件：非 build 的客户端编译开 `lazyCompilation`，首屏按需编译；它没有主题目录，不进上面那条层栈                                                                                                                                                                                                                           | 构建包（`src/` → `dist/`，改完要编译）                                                       | [README](./packages/plugin-lazy-compilation/README.md)                                                                                                                                                                |
| `packages/theme-git-badge/`            | 主题包：侧边栏里给「新建」与「更新过」的页面挂一枚纯色点 —— 判据是 git（页面自己写了 `git_badge` 就以页面为准），画法在这一层的 `DocSidebarItem/Link` 与 `DocSidebarItem/Category` 两格里                                                                                                                                       | 构建包（只编译 `src/` 那几份；层与组件是源码）                                               | [README](./packages/theme-git-badge/README.md) · [internals](./packages/theme-git-badge/docs/internals.md)                                                                                                            |
| `packages/theme-markmap/`              | 主题包：md 的 frontmatter 写 `markmap: true` 即在正文上方渲染导图                                                                                                                                                                                                                                                               | 构建包（只编译入口与 loader；层与组件是源码）                                                | [README](./packages/theme-markmap/README.md) · [示例页](./packages/theme-markmap/docs/markmap-demo.md)                                                                                                                |
| `packages/theme-erd/`                  | 主题包：`.dbml` 文件在正文上方渲染数据库关系图，正文附上固定四种格式加一串由插件选项决定的导出模板                                                                                                                                                                                                                              | 构建包（只编译入口、清单判据与 loader；层与组件是源码）                                      | [README](./packages/theme-erd/README.md) · [internals](./packages/theme-erd/docs/internals.md) · [示例页](./packages/theme-erd/docs/erd-demo.dbml)                                                                    |
| `packages/theme-diff/`                 | 主题包：md 的 frontmatter 写 `diff: true`（或一个路径）即在正文上方渲染这份文件上一个版本与此刻这一份之间的差异视图；写成 `diff: {old: 旧, new: 新}` 时比的是磁盘上那两份文件，不读 git 历史                                                                                                                                    | 构建包（只编译入口与 loader；层与组件是源码）                                                | [README](./packages/theme-diff/README.md) · [internals](./packages/theme-diff/docs/internals.md) · [示例页](./packages/theme-diff/docs/diff-demo.md) · [两份对照示例页](./packages/theme-diff/docs/diff-pair-demo.md) |
| `packages/theme-iframe/`               | 主题包，也是「整页交给一个框」这一族唯一的**外层套壳**：判四把 frontmatter 键（`scalar` / `redoc` / `stoplight` 是布尔，`iframe` 是地址），命中就把那一页换成一个通用框；`lib/` 里另住着三条 API 层共用的跨 iframe 约定与配置期工厂                                                                                             | 构建包（同上，`src/` 里只有入口那一份；`lib/` 免编译）                                       | [README](./packages/theme-iframe/README.md) · [internals](./packages/theme-iframe/docs/internals.md) · [协议](./packages/theme-iframe/docs/iframe-protocol.md)                                                        |
| `packages/theme-component-page/`       | 主题包，「整页交给一个组件」这一族唯一的一层，也是上面那层的一般形态：站点配置里给一列「frontmatter 键 → `@theme/` 组件」的清单，命中那条键的页把整个 `DocItem` 换成清单里那个组件；清单在配置期铺成一份注册表模块写进 Docusaurus 的生成目录，浏览器侧那条 `DocItem` 读它。本站把它声明在其余各层之后，所以它在层栈最外、最先判 | 构建包（`src/` 里是入口、清单校验与那份生成文本；`lib/` 是两侧共用的判据、免编译；层是源码） | [README](./packages/theme-component-page/README.md) · [internals](./packages/theme-component-page/docs/internals.md) · [示例页](./packages/theme-component-page/docs/component-page-demo.md)                          |
| `packages/theme-stoplight/`            | 主题包：md 的 frontmatter 写 `stoplight: true` 时整页换成一个 iframe（外层那格由 theme-iframe 承接），框里是本包自己那条 `/stoplight-view` 页面，Elements 在那份文档里渲染 API 文档（渲染哪份文档由 spec 键 `oas3:` / `aas3:` 给）                                                                                              | 构建包（同上，`src/` 里只有入口那一份，且是调工厂的一次）                                    | [README](./packages/theme-stoplight/README.md) · [internals](./packages/theme-stoplight/docs/internals.md)                                                                                                            |
| `packages/theme-redoc/`                | 主题包：md 的 frontmatter 写 `redoc: true` 时整页换成一个 iframe（外层那格由 theme-iframe 承接），框里是本包自己那条 `/redoc-view` 页面，Redoc 在那份文档里渲染 API 文档（渲染哪份文档由 spec 键 `oas3:` / `aas3:` 给）                                                                                                         | 构建包（同上，`src/` 里只有入口那一份，且是调工厂的一次）                                    | [README](./packages/theme-redoc/README.md) · [internals](./packages/theme-redoc/docs/internals.md)                                                                                                                    |
| `packages/theme-scalar/`               | 主题包：md 的 frontmatter 写 `scalar: true` 时整页换成一个 iframe（外层那格由 theme-iframe 承接），框里是本包自己那条 `/scalar-view` 页面，Scalar 在那份文档里渲染 API 文档（渲染哪份文档由 spec 键 `oas3:` / `aas3:` 给）                                                                                                      | 构建包（同上，`src/` 里只有入口那一份，且是调工厂的一次）                                    | [README](./packages/theme-scalar/README.md) · [internals](./packages/theme-scalar/docs/internals.md)                                                                                                                  |
| `packages/theme-viewer/`               | 主题包：文档正文里有图片时，那些图片交给查看器 —— 点开放大、原尺寸、重置、前后切换；没有图片的页面这一层等于透明                                                                                                                                                                                                                | 构建包（同上，`src/` 里只有入口那一份）                                                      | [README](./packages/theme-viewer/README.md) · [internals](./packages/theme-viewer/docs/internals.md) · [示例页](./packages/theme-viewer/docs/viewer-demo.md)                                                          |
| `packages/theme-copy-button/`          | 主题包：页脚那一格右边加一颗按钮，点一下把当前页地址写进剪贴板；站点没写 `themeConfig.footer.copyright` 时那一格本来就没有，这一层等于不存在                                                                                                                                                                                    | 构建包（同上，`src/` 里只有入口那一份）                                                      | [README](./packages/theme-copy-button/README.md) · [示例页](./packages/theme-copy-button/docs/copy-button-demo.md)                                                                                                    |
| `packages/theme-avatar/`               | 主题包：导航栏亮暗切换那颗按钮旁边挂一颗当前用户头像 —— 站点写 `userApi` 才启用（那一格是这一层的开关，没有能用的缺省），接口取到用户才画，下拉里「个人中心」「退出登录」各由一条地址决定出不出现；亮暗切换那一份原样交下去，只在它后面多摆这颗头像                                                                             | 构建包（同上，`src/` 里是入口与那份配置期校验；层与组件是源码）                              | [README](./packages/theme-avatar/README.md) · [internals](./packages/theme-avatar/docs/internals.md) · [示例页](./packages/theme-avatar/docs/avatar-demo.md)                                                          |
| `tools/theme-{a,b,c}/`                 | 验证 / 调研用主题插件（不属于核心包）                                                                                                                                                                                                                                                                                           | 免编译（没有 `src/`：入口与层都是源码，站点直接吃）                                          | [README](./tools/README.md)                                                                                                                                                                                           |

十四个构建包都是 `tsc` 编译包：Node 侧要跑的源码 `.mts` 在包内 `src/`，产物在包内 `dist/`，
`dist/index.mjs` 就是包出口（`exports`）—— 所以 `pnpm build:core` 是「编译这十四个包」，
`pnpm start` / `pnpm build` / `pnpm test` 都已经把它内置在前面。

主题包的**主题层与组件不进这份编译**：`packages/*/theme/**` 与 `packages/*/components/**` 是未编译的
`.tsx` / `.jsx`，随包发布，由用它们的站点的 babel 编译 —— 判据只有一条：**谁编译，就不编译第二遍**。
这一步不会自动成立：Docusaurus 官方那条 babel 规则把 `node_modules` 整个排除在外（只给
`docusaurus*.js` 开例外），所以这一格由 `@show-docs/docusaurus-plugin-prev-layer-resolver`
一处认领：它用官方 `utils.getJSLoader()` 补一条 `.tsx?` 规则，`include` 只收
`node_modules/@show-docs/` 底下的那些文件（下表「层与组件为什么不编译」）。
`tools/theme-*/` 是这个形态的完整版，连入口 `index.mts` 都由 Docusaurus 的 jiti 直接加载。
`packages/theme-iframe/lib/` 里那一份（注册表、判定清单的分发、跨 iframe 共享约定、配置期工厂）是同一判据推到头的
另一格：它没有编译产物 —— 浏览器那几份由用它的包直接引源码；注册表是纯数据，配置期与浏览器期
引的是**同一份**；唯一跑在 Node 配置期的 `api-frame-theme.mts` 由 Docusaurus 的 jiti 直接吃这份
源码（`.mts` 后缀按上游 lint preset 标 Node 环境，与 `src/index.mts` 同一口径）。`exports` 用
`./lib/*` 把源码交给用它的包，`build:core` 编译本包时也只产入口那一份。

> **`packages/theme-iframe/`、`packages/theme-stoplight/`、`packages/theme-redoc/` 与
> `packages/theme-scalar/` 已接进站点**
> （`plugins` 里的顺序 = `@theme/` 层栈的覆写顺序，四者都在 `theme-markmap` 往外那一侧），
> 接入位置、触发键与各自验证到哪一步以各包维护者文档
> [iframe](./packages/theme-iframe/docs/internals.md)、
> [stoplight](./packages/theme-stoplight/docs/internals.md)、
> [redoc](./packages/theme-redoc/docs/internals.md)、
> [scalar](./packages/theme-scalar/docs/internals.md) 为准，用法与限制在各自的 README，这里不抄第二份。
> 四把键的判定顺序由 theme-iframe 那一层决定（口径在
> [iframe-protocol.md](./packages/theme-iframe/docs/iframe-protocol.md) 的「注册表与分发」一节）；
> `packages/theme-iframe/lib/` 不在 `plugins` 的重名层里 —— 它不是插件也不是主题层，被三条 API 层
> 当普通依赖用（版本契约写在各自的 `peerDependencies`，口径在 theme-iframe 的
> [internals](./packages/theme-iframe/docs/internals.md)）。插件身份只属于 `theme-iframe` 包本身。

### 构建包的编译口径

十四份 `tsconfig.build.json` 是**同一份差量**：`extends: @nice-move/tsconfig/node-bundle.json`，
再写 `noEmit: false` 与 `rootDir` / `outDir`，能从 extends 拿的一律不重抄。这张表是这些口径的产地，
包里的注释只留指针：

| 口径                     | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 编译范围                 | 只有 `src/`，而 `src/` 里只放 **Node 侧要跑的代码**：核心包的解析器、主题包的入口与 webpack loader、类型。JSX 一份都不进 `tsc`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 层与组件为什么不编译     | 用它们的站点会编译，编译两遍只是多出一份要 `files` 点名、会和源码漂移的产物。但「站点会编译」要主动接上：官方 babel 规则按 `excludeJS` 排除整个 `node_modules`、只给 `docusaurus*.js` 开例外，从 npm 装进真项目时未编译的 `.tsx` 会报 `Module parse failed`。因此这一格由 `@show-docs/docusaurus-plugin-prev-layer-resolver` **一处**补一条 `.tsx?` 规则（官方 `utils.getJSLoader({ isServer })`）：`include` 只认 `node_modules/@show-docs/` 底下的 `.ts` / `.tsx`，工作区里 pnpm 的软链把源码解析到 `node_modules` 之外、官方那条本来就在编的那批交回去（否则同一份文件跑两遍 babel，产物一样，白花编译时间）。判据写在 [`packages/plugin-prev-layer-resolver/src/source-js-rule.mts`](./packages/plugin-prev-layer-resolver/src/source-js-rule.mts)：这条规则以前是每个主题包各补一份（同一判据抄七处，改一处忘另两处就是漂移），收在一处之后各主题包不再自己补。实测根据：`tools/theme-*/theme/**` 一直是未编译的 `.tsx`，站点收进层栈照样绿 —— `pnpm verify:chain` 打印的层栈里就有那一格。                                                                                                                         |
| 让 `tsc` 编 JSX 要付什么 | 多一条产物口径：`react.json` 给的 `react-jsx` 会把 JSX 编成 `.js`，而包是 `"type": "module"`，服务端构建里 babel 先把 `import()` 变成 `require('./x.js')` —— 纯 ESM 模块的 parser 不认 `require`，依赖进不了 bundle，静态渲染阶段报 `Cannot find module`；要躲它得单独钉 `jsx: "preserve"`。少编译一层就少一条这种口径。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `files` 点名与 `docs/`   | 发布只点站点运行时与类型要吃的格子（`dist`、`theme`、`components`、`lib`、`types`），各包的 `docs/`（维护者文档与那份共享约定）**不进** `files` —— 实现记录留在仓库里读，代价与判据见 [theme-iframe 的编译口径](./packages/theme-iframe/docs/internals.md)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 相对 import              | 统一写**源码名**（`./x.mts` / `./x.tsx`）。编译过的由 `node-bundle.json` 的 `rewriteRelativeImportExtensions` 在产出时改成产物名（`./x.mjs`）；未编译的那份原样交给 webpack，磁盘上就是这个文件，所以两种写法都指得到。`allowImportingTsExtensions` 不用写 —— `base.json` 已给。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 样式表                   | 不是模块，`tsc` 也不搬：`theme-markmap` 与 `theme-viewer` 那两份留在包根 `styles/`，走 `getClientModules()`（viewer 那一份连 `viewerjs` 自带的样式表一起从这一格交给站点，只是那份写的是 CSS 原生嵌套，要求宿主用 lightningcss 压缩 —— 入口在 `loadContent()` 里检查 `future.faster.lightningCssMinimizer`，口径见它包内 [docs/internals.md](./packages/theme-viewer/docs/internals.md) 的「第三方那份样式表：一处改写 + 一条宿主前提」一节）；`theme-diff` 自己没有样式表，只把 `@git-diff-view/react` 那份第三方样式表从同一格交给站点；iframe 那份 CSS Module 直接放在用它的组件旁边。第三方那几份**静态**样式表不进这条流水线：`@stoplight/elements` 与 `@scalar/api-reference` 由各层入口在构建配置期把它们从「打进全站那一份 css」改成「各自一个产物」，只由框内那份文档 `<link>` —— 两条走同一份实现 [`packages/theme-iframe/lib/isolate-renderer-css.ts`](./packages/theme-iframe/lib/isolate-renderer-css.ts)（口径与两处踩过的坑见 [theme-stoplight 的 internals](./packages/theme-stoplight/docs/internals.md) 的「样式」一节）。`redoc` 那份 css 是 styled-components 在运行期注入的，不进构建期这条流水线。 |
| 未编译源码的类型检查     | 由仓库根 `tsconfig.json` 接手（默认 include `**/*`，`types` 同时列 `node` 与 `react` / `react-dom`）。所以构建项目不再需要 `jsx`、不需要 react 那两条 `types`。`@theme*` 那三条 specifier 的声明归解析器包（`packages/plugin-prev-layer-resolver/types/`），由 `tsconfig.tools/test` 列进 `files`。`*.module.css`、`@docusaurus/router` 这类只在构建期存在的依赖，由仓库根一份 `module-aliases.d.ts` 引用官方 `@docusaurus/module-type-aliases` 说明（根 `tsconfig.json` 的 include 收得到它，`tsconfig.test.json` 按 `files` 点名）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

其余目录不是包，只是仓库根的一部分。原来那里还有一格 `docs/`，只装主页那一份；它现在就是
`packages/README.md`（`slug: /` 落在根，所以主页地址不变），仓库根不再有单独的文档目录：

| 目录      | 职责                                                                                                                                                                                                            | 细节                            |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `test/`   | 核心包单元测试（按契约面组织）                                                                                                                                                                                  | [README](./test/README.md)      |
| `src/`    | 站点层 swizzle `src/theme/`、全站样式 `src/css/`、站点自己的组件 `src/components/`（侧边栏那枚徽标；主页由 `packages/README.md` 承担，站点侧没有页面层；原来还有一格 `src/plugins/`，现在是 `tools/` 里的分包） | [README](./src/theme/README.md) |
| `static/` | 原样复制到站点根的静态文件（三条 API 示例页各取一份 OpenAPI 文档，图片查看器示例页那两张图在 `img/`）                                                                                                           | —                               |

上表的 `packages/*`、`tools/*` 是 **pnpm workspace 包**（各自有 `package.json`，
也在 `pnpm-workspace.yaml` 的 `packages:` 里）；其余是仓库根的目录，不是包 —— 判据是
「有没有 `package.json`」。

> 分包要被解析，判据是**用它的那个 importer 声明了它**：`packages:` 里收了、目录里有
> `package.json` 都不算，站点根不写 `"@show-docs/theme-a": "workspace:^"`，pnpm 就不会建链接，
> 一路顺到 `docusaurus build` 才炸 `Cannot find module`。`test/plugin.test.mts` 有一条用例
> 把 `packages/` 与 `tools/` 下**每一个**包按 Node 的 ESM 规则解析一遍 —— 那份目录清单是扫出来的
> （判据同「有没有 `package.json`」），新增一个包不必回来改这里，也就不会漏掉某个包那一格 ——
> 这一步因此红在 `pnpm test`，而不是拖到 `docusaurus build`。

## 基础设施包：单独可用，也给别的层复用

基础设施包有三格：`plugin-prev-layer-resolver`、`theme-component-page`、`theme-iframe`。判据不是
「谁比较大」，而是**有没有别的层靠它成形**：功能层回答「这一页长什么样」，基础设施回答
「这一类页怎么被交给别的东西」，并且只实现一次。三格按**一般到具体**排：

```text
功能层（theme-markmap、theme-erd、theme-diff、theme-redoc、theme-scalar、theme-stoplight …）
  │  只能往下依赖
theme-iframe                 整页交给一个框
  │
theme-component-page         整页交给一个组件（上面那格的一般形态）
  │
plugin-prev-layer-resolver   分层与 @theme-prev/*、未编译源码的编译、认槽位
  │
平台（Docusaurus / webpack / React）
```

越往下越一般。依赖只能从具体指向一般 —— 下面那一格不知道上面是谁。两种用法都要成立
（单独装上 / 被别人复用），缺一条就不成基础设施：

| 包                           | 单独装上                                                                                | 给别的层复用                                                                                                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-prev-layer-resolver` | 注册一个实例，`@theme-prev/X` 在主题层里解析成「紧邻下一层」，层栈由 `plugins` 自动推导 | 层栈推导与 `@theme-prev/*` 改写；那条让 `@show-docs` 未编译 TS 源码被编的 babel 规则（一处认领）；`./plugin-slots` 里「这个槽位是不是某一族」「解析器装了没有」                                                                                                                                             |
| `theme-component-page`       | 站点配置里写一列「frontmatter 键 → `@theme/` 组件」，命中的页整页换掉                   | 一条插件约定 `getComponentPages()`：别的主题包在配置期交出自己那几条键与组件，不必再各写一层 `DocItem`；命中判据与落空告警（`lib/component-page.ts`）就是这些条目共用的那一份                                                                                                                               |
| `theme-iframe`               | frontmatter 写 `iframe:` 就把整页换成一个指向外部地址的框                               | 注册表（`lib/api-frame-registry.ts`）登记「哪把键归哪一层」；配置期工厂（`lib/api-frame-theme.mts`）替三条 API 层各建一条框内页面；跨 iframe 约定那几个纯函数（`lib/frame-messages.ts`）；视图层共用外壳（`lib/view-layer-shell.tsx` / `view-layer.ts`）；静态样式表的分流（`lib/isolate-renderer-css.ts`） |

下面是这一格的规则。第 1–3 条与第 11 条读磁盘就能查：前者由
[`test/infrastructure-rules.test.mts`](./test/infrastructure-rules.test.mts)、后者由
[`test/specifier-usage.test.mts`](./test/specifier-usage.test.mts) 钉住；其余靠评审。

1. **三格按一般度分层，依赖只从具体指向一般。** `theme-component-page` 是 `theme-iframe` 的基础设施
   —— 整页交给一个框就是整页交给一个组件的一支特例：`theme-iframe` 可以用它，它不能用
   `theme-iframe`；两格都可以用解析器包，解析器包一个都不用。下面那格不知道上面是谁，
   反向依赖就是把「一般」焊死在某一支上。
2. **功能层只能依赖基础设施，功能层之间互不依赖。** 基础设施也不 `import` 任何功能层。
   注册表里用**字符串**登记别的层（`'@show-docs/docusaurus-theme-scalar'` 那种）是数据，
   不是依赖 —— 只有 `import` 才算。
3. **单独可用是硬要求。** 每格只依赖它下面那几格，所以拿掉上面任意几格都还能装：
   解析器包对 `@show-docs` 的依赖为零，`theme-component-page` 与 `theme-iframe` 都只声明解析器包
   （`theme-iframe` 今天没用到 `theme-component-page` 那一格 —— 方向允许，不是必需）。
   新增依赖前先问：这条能不能只往下要？不能，就说明放错了地方。
4. **复用要走显式出口。** 别的层引的是 `exports` 点名的子路径（`./lib/*`、`./types/*`、
   `./plugin-slots`），不深挖 `dist/`。同一个子出口里不要混进两种运行环境：浏览器会引到的那几份
   不许拉进 `node:*`（配置期那几份由 jiti 直接吃源码，浏览器那几份由 webpack 编译）。
5. **一份判据一处实现。** 同一个判断只有一份，别的层引它、不抄它。视图层那三处共用外壳
   就是这条的样板，护栏在 [`test/view-layer-copies.test.mts`](./test/view-layer-copies.test.mts)。
6. **只收已经有两个消费者的机制。** 一个层自己只用一次的形状留在那个层里；成为基础设施要等
   第二个消费者真的出现。提前抽象多出来的是一层要同步的东西，不是少写几行。
7. **机制不带业务默认。** 空配置等于「没有这一层」：`theme-component-page` 的空清单不命中任何页，
   `theme-iframe` 没写那几把键时页面照旧，解析器包没装插件时层栈就不存在。基础设施不替站点挑
   组件、挑地址、挑文案。
8. **失败必须可见。** 配置期能判的错在配置期红掉并点名到哪一格；只有浏览器才知道的落空给开发
   模式告警。装上了却安静地什么都不做，是最难查的一类。
9. **两种用法都要有文档与用例。** 单独用法写在包 README，复用契约写在包 `docs/`；`src/` 与
   `lib/` 在覆盖率红线上，`theme/` 与 `components/` 由 e2e 钉。加一条复用契约，两边的用例一起加。
10. **两格都换 `DocItem` 时，顺序就是优先级。** `theme-iframe` 的框与 `theme-component-page` 的
    组件页都替换整个 `DocItem`：后声明的那层先判，命中就不再往下走。同一页不要同时依赖两格
    —— 谁先命中由站点 `plugins` 的顺序决定，两格互不认识，谁也报不了这条冲突。
11. **没有第二层覆盖就别走链。** 仓库里只有一个层提供某个组件时，那个层用官方别名
    `@theme-init/X`（最初那一份）—— `@theme-prev/X` 留给真有两层以上覆盖的组件
    （`DocItem`、`DocCardList` 那种）。多一层链没换来任何东西，只多一次按导入者算落点；
    反过来，有多个提供者却用 `@theme-init` 会跳过下面那几层。

新增一层之前先问：

- **要 `@theme-prev/*` 链式覆写、认某个槽位、让未编译的 TS 源码被编？** 用解析器包，
  别在各层各补一份。
- **包一个组件时？** 仓库里只有你这一层提供它 → `@theme-init/X`；有两层以上 → `@theme-prev/X`。
- **这一页整页交给一个组件？** 走 `theme-component-page` 的清单或 `getComponentPages()`，
  别新写一层 `DocItem`。
- **整页放进一个框？** 走 `theme-iframe` 的注册表 + 配置期工厂 + 跨 iframe 约定，
  别自己拼 iframe 与 `postMessage`。
- **只在正文上方加一块视图？** 用 `theme-iframe/lib/view-layer-shell.tsx` 那份外壳
  （`theme-markmap` / `theme-erd` / `theme-diff` 三条都引它）。

## 方案在哪份文档里

- **多主题链式覆盖**（`@theme-prev/X` 怎么解析、怎么接入、有哪些约束）：
  [packages/plugin-prev-layer-resolver/README.md](./packages/plugin-prev-layer-resolver/README.md)；
  机制为什么这样设计、实测与内部契约清单在同包
  [docs/internals.md](./packages/plugin-prev-layer-resolver/docs/internals.md)
- **导图主题**（frontmatter 触发、渲染位置、明暗跟随全站主题）：
  行为见 [packages/theme-markmap/docs/markmap-demo.md](./packages/theme-markmap/docs/markmap-demo.md)，用法见
  [packages/theme-markmap/README.md](./packages/theme-markmap/README.md)；实现见
  `packages/theme-markmap/`（入口与 loader 在 `src/`，层与组件在 `theme/`、`components/`）
- **关系图主题**（`.dbml` 触发、渲染位置、正文里附哪些导出、那些导出由谁生成）：
  行为见 [packages/theme-erd/docs/erd-demo.dbml](./packages/theme-erd/docs/erd-demo.dbml)，用法见
  [packages/theme-erd/README.md](./packages/theme-erd/README.md)；实现（入口、清单判据与 loader 在
  `src/`，层与组件在 `theme/`、`components/`，`@dbml/core` 实测到的形状与导出模板插拔在实现上的
  三个约束）在同包
  [docs/internals.md](./packages/theme-erd/docs/internals.md)
- **差异视图主题**（frontmatter 触发、比的是哪一份或哪两份、取不到差异时怎么办）：
  行为见 [packages/theme-diff/docs/diff-demo.md](./packages/theme-diff/docs/diff-demo.md) 与
  [两份文件对照那一页](./packages/theme-diff/docs/diff-pair-demo.md)，用法见
  [packages/theme-diff/README.md](./packages/theme-diff/README.md)；实现（入口与 loader 在 `src/`，
  层与组件在 `theme/`、`components/`，`git` 那几步与取不到差异的几种落点）在同包
  [docs/internals.md](./packages/theme-diff/docs/internals.md)
- **iframe 主题**（frontmatter 触发、URL 怎么算、在层栈里放哪一格、命中时丢掉的是哪一块）：
  行为见 [packages/theme-iframe/docs/iframe-demo.md](./packages/theme-iframe/docs/iframe-demo.md)，用法见
  [packages/theme-iframe/README.md](./packages/theme-iframe/README.md)；实现与包内组成在同包
  [docs/internals.md](./packages/theme-iframe/docs/internals.md)，跨 iframe 的口径在
  [iframe-protocol.md](./packages/theme-iframe/docs/iframe-protocol.md)
- **Stoplight 主题**（`stoplight: true` 触发、渲染为什么挪到本包自己那条 `/stoplight-view` 页面）：
  行为见 [packages/theme-stoplight/docs/stoplight-demo.md](./packages/theme-stoplight/docs/stoplight-demo.md)（示例取
  `static/openapi-stoplight.yaml`），用法见
  [packages/theme-stoplight/README.md](./packages/theme-stoplight/README.md)；实现（含那份静态样式表
  怎么只出现在框内那一页、浏览器 bundle 要补哪几样 Node 侧依赖）在同包
  [docs/internals.md](./packages/theme-stoplight/docs/internals.md)
- **Redoc 主题**（`redoc: true` 触发、渲染为什么挪到本包自己那条 `/redoc-view` 页面）：
  行为见 [packages/theme-redoc/docs/redoc-demo.md](./packages/theme-redoc/docs/redoc-demo.md)（示例取
  `static/openapi-redoc.yaml`）与
  [AsyncAPI 那一版](./packages/theme-redoc/docs/redoc-asyncapi-demo.md)（示例取
  `static/asyncapi-redoc.yaml` —— AsyncAPI 走 `aas3:` 那把 spec 键），用法见
  [packages/theme-redoc/README.md](./packages/theme-redoc/README.md)；实现（含样式为什么不需要构建期
  处理而暗色表仍要在运行期改挂）在同包
  [docs/internals.md](./packages/theme-redoc/docs/internals.md)
- **Scalar 主题**（`scalar: true` 触发、渲染为什么挪到本包自己那条 `/scalar-view` 页面）：
  行为见 [packages/theme-scalar/docs/scalar-demo.md](./packages/theme-scalar/docs/scalar-demo.md)（示例取
  `static/openapi-scalar.yaml`）与
  [AsyncAPI 那一版](./packages/theme-scalar/docs/scalar-asyncapi-demo.md)（示例取
  `static/asyncapi-scalar.yaml` —— AsyncAPI 走 `aas3:` 那把 spec 键），用法见
  [packages/theme-scalar/README.md](./packages/theme-scalar/README.md)；实现（含它的静态样式表为什么
  拦不住而只能靠 `.scalar-app` 那层前缀、亮暗为什么落在 `<body>` 那两个类名上）在同包
  [docs/internals.md](./packages/theme-scalar/docs/internals.md)
- **图片查看器主题**（这一层没有开关，判的是正文里有没有图片；查看器接管的是哪一格）：
  行为见 [packages/theme-viewer/docs/viewer-demo.md](./packages/theme-viewer/docs/viewer-demo.md)（示例取 `static/img/` 那两张图），用法见
  [packages/theme-viewer/README.md](./packages/theme-viewer/README.md)；实现（入口在 `src/`，层与组件在
  `theme/`、`components/`，两处样式收在 `styles/`，第三方那份样式表要补的那两处）在同包
  [docs/internals.md](./packages/theme-viewer/docs/internals.md)
- **导航栏那颗用户头像**（`userApi` 是这一层的开关、下拉里那两条各由哪条地址决定、只对某一台机器启用）：
  行为见 [packages/theme-avatar/docs/avatar-demo.md](./packages/theme-avatar/docs/avatar-demo.md)（本站故意不给接口，
  所以那一格只被构建、不出现头像），用法与选项见
  [packages/theme-avatar/README.md](./packages/theme-avatar/README.md)；实现（配置那一份怎么进浏览器、两处
  `PLUGIN_NAME` 字面量为什么必须一起改、从草稿换掉的三格）在同包
  [docs/internals.md](./packages/theme-avatar/docs/internals.md)
- **把渲染器关进一个框之后要对齐的那两格**（地址栏里 `#` 那一段与站点的亮暗模式，两边怎么跨文档
  送、为什么要各推一次）：
  [packages/theme-iframe/docs/iframe-protocol.md](./packages/theme-iframe/docs/iframe-protocol.md) —— 上面三条 API 层共用同一份实现
- **链是否真的成立**：`pnpm build && pnpm verify:chain`，判据清单以脚本输出为准
- **每个主题在浏览器里是否真的工作**：`pnpm test:e2e`（跑的是构建产物，只本地跑）。用例是
  Given/When/Then 句子（Gherkin 写在 `test/e2e/features/`，步骤实现在 `test/e2e/steps/`），
  用例清单与首次要装的浏览器见 [test/README.md](./test/README.md)

## 目录结构

「职责」比「位置」重要 —— 放错地方的代价不是不好看，而是行为变了（把 specifier 写在层外文件里
就是**硬失败**，不是「有时灵有时不灵」）。**先按「你想改什么」找，再在对应文档里看细节。**

| 你想改什么                           | 动哪里                                                                                                                                                                                                                                                                 | 细节                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 层栈怎么推导、specifier 怎么解析     | `packages/plugin-prev-layer-resolver/`                                                                                                                                                                                                                                 | [README](./packages/plugin-prev-layer-resolver/README.md) · [internals](./packages/plugin-prev-layer-resolver/docs/internals.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 侧边栏徽标怎么判、怎么画             | `packages/theme-git-badge/`                                                                                                                                                                                                                                            | [README](./packages/theme-git-badge/README.md) · [internals](./packages/theme-git-badge/docs/internals.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 导图怎么触发、渲染在哪               | `packages/theme-markmap/`                                                                                                                                                                                                                                              | [README](./packages/theme-markmap/README.md) · [示例页](./packages/theme-markmap/docs/markmap-demo.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 关系图怎么触发、渲染在哪             | `packages/theme-erd/`                                                                                                                                                                                                                                                  | [README](./packages/theme-erd/README.md) · [internals](./packages/theme-erd/docs/internals.md) · [示例页](./packages/theme-erd/docs/erd-demo.dbml)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 上一次改动怎么看                     | `packages/theme-diff/`                                                                                                                                                                                                                                                 | [README](./packages/theme-diff/README.md) · [internals](./packages/theme-diff/docs/internals.md) · [示例页](./packages/theme-diff/docs/diff-demo.md) · [两份对照示例页](./packages/theme-diff/docs/diff-pair-demo.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 三条视图层共用的外壳                 | `packages/theme-iframe/lib/` 的 `view-layer-shell.tsx`（兜底 + 视图那一格 + 本层 `DocItem` 的全部内容）/ `view-layer-labels.ts`（本层说法的形状）/ `view-layer.ts`（宽度补丁）—— `theme-markmap`、`theme-erd`、`theme-diff` 各只剩「交哪把键、交哪个组件、交哪段说法」 | [theme-iframe internals](./packages/theme-iframe/docs/internals.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 整页交给外部站点或外部文档           | `packages/theme-iframe/`（跨 iframe 那两格在同包 `lib/` 与 `docs/iframe-protocol.md`）、`packages/theme-stoplight/`、`packages/theme-redoc/`、`packages/theme-scalar/` —— 四包的内部实现与实测记录在各包 `docs/internals.md`                                           | [示例页](./packages/theme-iframe/docs/iframe-demo.md) · [stoplight 示例页](./packages/theme-stoplight/docs/stoplight-demo.md) · [redoc 示例页](./packages/theme-redoc/docs/redoc-demo.md) · [redoc AsyncAPI 示例页](./packages/theme-redoc/docs/redoc-asyncapi-demo.md) · [scalar 示例页](./packages/theme-scalar/docs/scalar-demo.md) · [scalar AsyncAPI 示例页](./packages/theme-scalar/docs/scalar-asyncapi-demo.md) · [iframe](./packages/theme-iframe/README.md) · [跨 iframe 约定](./packages/theme-iframe/docs/iframe-protocol.md) · [stoplight](./packages/theme-stoplight/README.md) · [redoc](./packages/theme-redoc/README.md) · [scalar](./packages/theme-scalar/README.md) |
| 正文图片怎么被接管                   | `packages/theme-viewer/`                                                                                                                                                                                                                                               | [README](./packages/theme-viewer/README.md) · [internals](./packages/theme-viewer/docs/internals.md) · [示例页](./packages/theme-viewer/docs/viewer-demo.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 导航栏那颗头像怎么来、下拉里有哪两条 | `packages/theme-avatar/`                                                                                                                                                                                                                                               | [README](./packages/theme-avatar/README.md) · [internals](./packages/theme-avatar/docs/internals.md) · [示例页](./packages/theme-avatar/docs/avatar-demo.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 某层包在组件外面的样子               | `tools/theme-{a,b,c}/theme/`、`src/theme/`                                                                                                                                                                                                                             | [tools](./tools/README.md) · [src/theme](./src/theme/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 验证「链真的成立」                   | `tools/scripts/verify-chain.mts`                                                                                                                                                                                                                                       | [tools](./tools/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 站点主页与文档                       | `packages/README.md` 带 `slug: /` 是主页；站点内容根是 `packages/`，各包的 `README.md` 与包内 `docs/` 由 `sidebars.mts` 按包组成「顶层页 + 子页」那一棵树                                                                                                              | [`packages/README.md`](./packages/README.md) · [`sidebars.mts`](./sidebars.mts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 单测、浏览器用例与夹具               | `test/`（e2e 的句子在 `test/e2e/features/`，实现在 `test/e2e/steps/`）                                                                                                                                                                                                 | [README](./test/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `@theme*` 的类型声明                 | `packages/plugin-prev-layer-resolver/types/`                                                                                                                                                                                                                           | [README「类型声明」](./packages/plugin-prev-layer-resolver/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

仓库级只有这些不在分包里的东西（`packages/README.md` 是唯一的例外：它是主页，不是包）：

```
dist/.tsbuildinfo/                 # `tsc -b` 的增量信息（git 忽略）；构建包的产物在各包自己目录里
tsconfig.json                      # 共享编译选项（noEmit）；tools / test 各一份 extends，十四个构建包在包内自带 tsconfig.build.json
tsconfig.tools.json / tsconfig.test.json  # 两份 composite 项目，由 pnpm typecheck（tsc -b）跑
docusaurus.config.mjs              # 站点配置（.mjs：站点根不是 ESM 包，靠扩展名拿 ESM；docs 的内容根是 `packages/`、路由前缀是 '/'，所以主页就是 `packages/README.md`，各包的 README 与包内 docs/ 由 sidebars.mts 按包组树）
sidebars.mts                       # 侧栏：扫 `packages/` 得到包清单，一格一个包，顶层页就是那一份 README；那份组目录自己的 README 是主页，不占包那一格（主页那张卡片列表取的也是这份清单）
pnpm-workspace.yaml                # pnpm 12 的配置落点：分包清单（packages:）+ 安装期依赖（configDependencies）+ 依赖安装脚本放行名单（allowBuilds）+ 扁平化（shamefullyHoist）
eslint.config.mjs / syncpack.config.mjs / vitest.config.mts / playwright.config.mts  # 四道检查各自的落点（后者同时是 BDD 的落点：`defineBddConfig()` 说清 `.feature` 与步骤在哪，`testDir` 由它给出）
.features-gen/                       # `bddgen` 从 `.feature` 生成的 Playwright 文件（git 忽略，别手改）
.github/workflows/                 # CI（GitHub Actions）
```

关于 `src/`：它现在只剩站点自己的那三样东西 —— `src/theme/` 是层栈最外圈的哨兵槽位，`src/css/`
是全站样式，`src/components/` 是站点自己的组件（侧边栏那枚「新建 / 更新」徽标，落在 `src/theme/`
**外面** —— 那一格是 swizzle 目录，放进去就成了一层主题）。
原来还有一格 `src/plugins/`（一个按相对路径加载的本地插件），它现在是
`packages/plugin-lazy-compilation/` 那个分包，站点改按包名加载。
站点不再有自己的页面层：主页就是 `packages/README.md`（配置把 docs 的路由前缀挪到根，那份
frontmatter 写 `slug: /`，于是它同时是 `packages/` 那一格的索引页与整站主页）。历史上 `src/pages/` 在的那一格讲的是「specifier 写在层外文件里
必定硬失败」，那条口径的产地在
[插件 README 的使用约束①](./packages/plugin-prev-layer-resolver/README.md)。
