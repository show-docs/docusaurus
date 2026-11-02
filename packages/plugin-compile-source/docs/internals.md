# plugin-compile-source：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：判据为什么这么切、踩过的坑与实测证据。
使用者侧的事实（接入、与解析器的分工、告警怎么读）在 [`../README.md`](../README.md)。

`src/` 注释里「理由见 README『…』」的指针，凡落在下面这些章节里的，都指本文件。

## 组成

| 文件                     | 职责                                             |
| ------------------------ | ------------------------------------------------ |
| `src/index.mts`          | 插件入口：await 取 babel 配置路径 + 交那一条规则 |
| `src/source-js-rule.mts` | 认领范围判据、规则形状、`babelOptions` 的取源    |

源码全在 `src/` 下，`dist/` 是它的编译产物（`rootDir` = `src/`）。改完源码要 `pnpm build:core`
—— 站点按包名拿到的是 `dist/index.mjs`（口径见仓库根 README「构建包的编译口径」）。

## babelOptions 必须和官方同源

`utils.getJSLoader()` 的入参要和官方那条一致：除了 `isServer`，官方还传
`babelOptions: await getCustomBabelConfigFilePath(siteDir)`（core `lib/webpack/base.js`），
本包传的是**同一个产地取来的同一个值**（`src/source-js-rule.mts` 的 `siteBabelConfigPath`）。

少了这一格时 `getBabelOptions` 会退回 `{ babelrc: false, configFile: false }` + 默认 preset ——
站点源码按站点的 `babel.config.js` 编、这一族的源码按默认配置编，同一份代码两套编译，而差异只在
产物里、构建照绿。取不到那个函数时退回 `undefined`（= 少这一格的老行为）并**告警**。

### 为什么借解析器包那一格出口，而不是自己 require

`@docusaurus/babel` 是 core 的依赖，被 pnpm 隔离进 `.pnpm/`：从站点根解析恒为
`MODULE_NOT_FOUND`。所以这一跳必须**从 core 的位置** require 它，那把 helper
（`resolveFromCore` / `resolveCoreRoot` / `resolveCoreModule`）住在解析器包的
`src/layers.mts` —— 层栈链底那一层就是从 core 的模块位置推出来的，同源。

本包不复制那份判据，走解析器新开的出口 `./resolve-from-core`：

- **不自己 require `@docusaurus/babel`**：那要把它声明成 peer，而站点不会替 core 装它；就算靠
  `shamefullyHoist` 捞到一份，那份版本也不保证是 core 用的那一个，babel 配置解析正是版本相关的那条路。
- **不在本包再放一份「怎么找 core」**：两份实现会漂，而漂了没有任何用例报红 —— 上游给 core 补上
  `exports` 那天，只改一处就是半边静默失效。护栏 `test/layers.test.mts`「包外那一格 core 定位出口」
  钉的是**同一个函数引用**，出口指向复制实现就红。

代价要说清楚：本包因此离不开解析器包（那一格出口在它里面）。这一格只有「读 core 的位置」这一点，
不含层栈、不含 resolver，所以引它不会把链式覆盖那套语义带进本包。

## 认领范围为什么是「scope」而不是「包根」

判据是 `node_modules/@show-docs/` 这一段，与具体哪个包无关：

- **覆盖全族**：家族里带源码层的包有十二个（三条视图层、查看器、复制按钮、头像、侧边栏徽标、
  iframe、机制层、三条 API 层），各自认领自己的包根就是十二份判据；按 scope 认领是一份。
- **与层栈无关**：认领范围不依赖「站点注册了哪些层」，所以哪一族包没装、装了哪几条，都不影响
  这一格 —— 以前按包根认领时，`theme-iframe` 自己那份入口得单独例外（它进 `tsc`，`lib/` 不在
  那份 `rootDir` 里、引不到判据），例外一多就要逐个对齐。
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

## 这一格的三次搬家

同一个判据在仓库里搬过三次，每次都是因为「寄居」看起来无害：

1. **每个带源码层的主题包各补一条**（七处）—— 改一处忘另两处就是漂移，而且漂移了不会有
   任何用例报红，只在装机的站点上以 `Module parse failed` 的形式现身。
2. **收进解析器插件一处**（`src/source-js-rule.mts`）—— 判据成了一份，但它和「链式覆盖」挤在
   同一个 `configureWebpack` 里，`index.mts` 与 README 都得额外写一句「它与层栈无关」才是真的。
3. **独立成本包** —— 那句注释不再需要，两个 `configureWebpack` 各交自己那一格。

第 2 步留下的判据仍然只有一份，所以第 3 步搬的是文件，不是逻辑：`include` 认的是 scope 而不是
「本包的包根」，这正是它当初能收成一处的原因。

护栏与用例的分工：

- `test/source-js-rule.test.mts` —— 判据本身（认领/不认领的每一档、`babelOptions` 那一格）。
- `test/package-entries.test.mts` —— 那条规则确实由本包入口交出，且解析器入口不再交它。
- `test/view-layer-copies.test.mts` —— 「这一格只有一处」：产地指向本包，任何主题包或解析器包
  再补一条就红；同一节还按磁盘钉「凡把免编译目录发出去的包，都在 peer 里声明了本包」。
