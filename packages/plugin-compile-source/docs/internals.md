# plugin-compile-source：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：判据为什么这么切、踩过的坑与实测证据。
使用者侧的事实（接入、与解析器的分工、取配置那一步为什么不兜底）在 [`../README.md`](../README.md)。

`src/` 注释里「理由见 README『…』」的指针，凡落在下面这些章节里的，都指本文件。

## 组成

| 文件                     | 职责                                             |
| ------------------------ | ------------------------------------------------ |
| `src/index.mts`          | 插件入口：await 取 babel 配置路径 + 交那一条规则 |
| `src/source-js-rule.mts` | 认领范围判据、规则形状、`babelOptions` 的取源    |

源码全在 `src/` 下，`dist/` 是它的编译产物（`rootDir` = `src/`）。改完源码要 `pnpm build:core`
—— 站点按包名拿到的是 `dist/index.mjs`。

## 这一族构建包的编译口径

本包答的是「谁编译这一族未编译的源码」，这一族包**自己**怎么编也记在这里 —— 十五个构建包的
`tsconfig.build.json` 是**同一份差量**：`extends: @nice-move/tsconfig/node-bundle.json`，再写
`noEmit: false` 与 `rootDir` / `outDir`，能从 extends 拿的一律不重抄（各包里的注释只留指针）。

| 口径                     | 内容                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 编译范围                 | 只有 `src/`，而 `src/` 里只放 **Node 侧要跑的代码**：核心包的解析器、主题包的入口与 webpack loader、类型。JSX 一份都不进 `tsc`。                                                                                                                                                                                         |
| 层与组件为什么不编译     | 用它们的站点会编译，编译两遍只是多出一份要 `files` 点名、会和源码漂移的产物。「谁编译」那一格的判据见本文件「认领范围为什么是 scope」与「为什么不重复官方那条」两节。实测根据：`tools/theme-*/theme/**` 一直是未编译的 `.tsx`，站点收进层栈照样绿 —— `pnpm verify:chain` 打印的层栈里就有那一格。                        |
| 让 `tsc` 编 JSX 要付什么 | 多一条产物口径：`react.json` 给的 `react-jsx` 会把 JSX 编成 `.js`，而包是 `"type": "module"`，服务端构建里 babel 先把 `import()` 变成 `require('./x.js')` —— 纯 ESM 模块的 parser 不认 `require`，依赖进不了 bundle，静态渲染阶段报 `Cannot find module`；要躲它得单独钉 `jsx: "preserve"`。少编译一层就少一条这种口径。 |
| 相对 import              | 统一写**源码名**（`./x.mts` / `./x.tsx`）。编译过的由 `node-bundle.json` 的 `rewriteRelativeImportExtensions` 在产出时改成产物名（`./x.mjs`）；未编译的那份原样交给 webpack，磁盘上就是这个文件，所以两种写法都指得到。`allowImportingTsExtensions` 不用写 —— `base.json` 已给。                                         |
| `files` 点名与 `docs/`   | 发布只点站点运行时与类型要吃的格子（`dist`、`theme`、`components`、`lib`、`types`），各包的 `docs/`（维护者文档与那份共享约定）**不进** `files` —— 实现记录留在仓库里读，代价与判据见 [theme-iframe 的编译口径](../../theme-iframe/docs/internals.md)。                                                                  |

样式表那一格不是模块、`tsc` 也不搬：包根 `styles/` 里那几份走 `getClientModules()`；第三方那几份**静态**
样式表由各层入口在构建配置期把它们从「打进全站那一份 css」改成「各自一个产物」。每包自己的写法、隔离
那份实现与踩过的坑在它自己的维护者文档里。

未编译源码的类型检查由仓库根 `tsconfig.json` 接手（`*.module.css`、`@docusaurus/router` 这类只在构建期
存在的依赖靠根那份 `module-aliases.d.ts`），`@theme*` 那三条 specifier 的声明归解析器包，
`@stoplight/elements` 缺的 `types` 由依赖补丁补上 —— 这三格的落点分别在
[解析器包的维护者文档](../../plugin-prev-layer-resolver/docs/internals.md)、
[theme-stoplight 的维护者文档](../../theme-stoplight/docs/internals.md) 与 `pnpm-workspace.yaml` 的注释里。

## babelOptions 必须和官方同源

`utils.getJSLoader()` 的入参要和官方那条一致：除了 `isServer`，官方还传
`babelOptions: await getCustomBabelConfigFilePath(siteDir)`（core `lib/webpack/base.js`），
本包传的是**同一个产地取来的同一个值**（`src/source-js-rule.mts` 的 `siteBabelConfigPath`）。

少了这一格时 `getBabelOptions` 会退回 `{ babelrc: false, configFile: false }` + 默认 preset ——
站点源码按站点的 `babel.config.js` 编、这一族的源码按默认配置编，同一份代码两套编译，而差异只在
产物里、构建照绿。取不到那格的路径时传的就是 `undefined`（站点本来没有 `babel.config.js`），
与官方那条 JS 规则在这一轮里拿到的是同一个值。

### 为什么直接引官方包

`@docusaurus/babel` 是正式发布的包（不是 core 的内部文件），顶层导出
`getCustomBabelConfigFilePath`，`exports` 里带着 `types`；本包把它写进自己的
`dependencies`，从**本包**的解析上下文就引得到。

那个函数是 `path.join(siteDir, BABEL_CONFIG_FILE_NAME)` 加一次 `fs-extra.pathExists` ——
纯按 `siteDir` 算，不读任何进程级状态，所以「从哪棵树取到它」不参与答案；仓库里 `.pnpm/` 只有
`@docusaurus/babel@3.10.2` 一份物理副本，本包引到的与 core 用的就是同一份。本包因此不放
「怎么找 core」那一格判据。

- **装不到 `@docusaurus/babel` 时红在配置加载那一步**（`ERR_MODULE_NOT_FOUND`），不在代码里
  `logger.warn` 后退回默认配置：那种静默臂会让「站点配了 `babel.config.js` 却没生效」看起来像
  配置写错了。这一格归依赖清单管。

## 认领范围为什么是「scope」而不是「包根」

判据是 `node_modules/@show-docs/` 这一段，与具体哪个包无关：

- **覆盖全族**：家族里带源码层的包有十二个（三条视图层、查看器、复制按钮、头像、侧边栏徽标、
  iframe、机制层、三条 API 层），各自认领自己的包根就是十二份判据；按 scope 认领是一份。
- **与层栈无关**：认领范围不依赖「站点注册了哪些层」，所以哪一族包没装、装了哪几条，都不影响
  这一格；按包根认领就得给每个包各留一份判据和例外。
- **pnpm 的隔离布局照样在**：`node_modules/.pnpm/@show-docs+<包>@<版本>/node_modules/@show-docs/<包>/…`
  —— 那一段 `node_modules/@show-docs/` 完整。

## 为什么不重复官方那条

判据与官方 `excludeJS` 对齐：**官方那条不编的（`node_modules` 里的），本包才编**。官方那条还
额外放行 `docusaurus*.js[x]`，但本包只碰 `.ts` / `.tsx`，那一格与它无关 ——
两条规则的 `test` 覆盖面没有交集，不存在同一份文件跑两遍 babel。

工作区里（pnpm 软链把源码解析到 `node_modules` 之外）官方那条本来就在编，本包不认领：
判据里 `node_modules/@show-docs/` 那一段不在，规则自然不命中。

## 为什么不认领 `.mts` / `.cts` / `.d.ts` / `.jsx`

- `.mts` / `.cts`：官方那条规则的 `test` 是 `/\.[jt]sx?$/i`，同样不含这两类 —— 它们由 Node
  自己带类型擦除加载（配置期那几份），不进浏览器 bundle。
- `.d.ts`：声明文件没有运行期内容，编它只是白跑一遍。
- `.jsx`：这一族随包发布的是 `.tsx`。官方那条规则的 `test` 含 `.jsx`，但同样把 `node_modules`
  排除在外；哪天真要发 `.jsx`，把这一格放宽即可（判据只有这一处）。

## 护栏与用例的分工

- `test/source-js-rule.test.mts` —— 判据本身（认领/不认领的每一档、`babelOptions` 那一格）。
- `test/package-entries.test.mts` —— 那条规则确实由本包入口交出，且本包不碰 `resolve.plugins`。
- `test/plugin.test.mts` —— 解析器入口不交那条规则（用例名「不再交那条 TS 源码规则」）。
- `test/view-layer-copies.test.mts` —— 「这一格只有一处」：产地指向本包，任何主题包或解析器包
  再补一条就红；同一节还按磁盘钉「凡把免编译目录发出去的包，都在 peer 里声明了本包」。
