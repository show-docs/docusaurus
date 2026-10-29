# plugin-prev-layer-resolver：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：机制为什么这么设计、踩过的坑与实测证据、
内部契约清单。使用者侧的事实（接入、语义、告警怎么读、硬性约束、边界）在
[`../README.md`](../README.md)。

`src/` 的注释里「理由见 README『…』」的指针，凡是落在下面这些章节里的，都指本文件。

## 组成

| 文件                          | 职责                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `src/index.mts`               | 插件入口：推层栈 + 空层栈告警 + 注入 resolver              |
| `src/layers.mts`              | 层栈推导（与官方 `loadThemeAliases` 同序）+ core 模块定位  |
| `src/plugin-slots.mts`        | 认层那两条判据 + 「本包注册了没有」那条前置检查（见下）    |
| `src/plugins.mts`             | 复用官方 `loadContext` / `loadPluginConfigs` 取回插件列表  |
| `src/resolve.mts`             | 纯逻辑：组件定位 / 导入者归属 / issuer / specifier 匹配    |
| `src/resolver.mts`            | 逐层解析核心（`PrevLayerResolverPlugin`）                  |
| `src/source-js-rule.mts`      | 认领 `node_modules/@show-docs/` 下未编译 TS 源码的那条规则 |
| `src/types.mts`               | 公共类型                                                   |
| `types/theme-specifiers.d.ts` | `@theme*` 三条 specifier 的类型声明，见 README「类型声明」 |

源码全在 `src/` 下，`dist/` 是它的编译产物（`rootDir` = `src/`），两者的文件一一对应。
`types/` 不参与编译，见 README 的「类型声明」。

## 实现结构

实现按「纯函数 / 副作用」切开：能穷举的解析逻辑在无副作用的函数里（`src/resolve.mts` /
`src/layers.mts` / `src/resolver.mts` 的目标选择），副作用留在接线处（`src/index.mts` 推层栈、
`src/plugins.mts` 读插件列表、`src/resolver.mts` 的 `apply()`）。各文件职责见上方「组成」，
各目录职责与「放错地方会怎样」见仓库根 README 的「目录结构」。

> 源码是 ESM 的 `.mts`，相对 import 写**源码名**（`./layers.mts`），产出时才变成 `./layers.mjs`；
> 这条口径与差量清单记在仓库根 README 的「构建包的编译口径」，这里不抄第二份。`tsc` 把改写后的
> import 搬进包内 `dist/`，那份 `dist/index.mjs` 就是包出口 —— 站点按包名拿到的就是它，
> 所以改完源码要 `pnpm build:core`。

## 名字说的是它做的事

包名、插件 `name`（`@show-docs/docusaurus-plugin-prev-layer-resolver`）与目录名取同一份标识符，
说的是同一件事：**它是给 `@theme-prev/*` 做解析的插件**，不是主题。

- **不以 `theme` 开头**：Docusaurus 里 `theme-*` / `theme/*` 是**主题插件**占的形状
  （`@docusaurus/theme-classic`）。本插件不提供任何主题（只有 `configureWebpack`、
  没有 `getThemePath()`、不往层栈里加层），名字不该长得像主题，取 `plugin-*`。
- **不顶 `@docusaurus/` 域**：它是第三方包，取官方的域会暗示官方血源，也可能撞上按域名
  分类的工具，因此与包名同标识符。
- 「prev-layer」落在**被解析的落点**上（导入者下面那一层），「resolver」落在**它做的事**上。
  别叫 `theme-chain` / `layer-chain`，那描述的是整套机制，不是干这件事的东西。

## 背景：一个全局别名喂不饱一条链

官方 `@theme-original/X` 是**每个组件一个全局值**，只能等于层栈里的某一层；而链上每一层想要的
是「**我自己下面那一层**」—— 多个消费者要多个不同答案，一个全局别名原理上无法同时满足。

这不是推理出来的，是在一个最小站点上实测出来的五条：

1. **多个主题覆盖同一个组件** → 后声明的主题完全覆盖前者，前者被静默丢弃，不叠加也不链式。
2. **`@theme-original` 的语义** → 它与 `@theme` 指向**同一个文件**；
   只有在站点层 `src/theme` 里使用才等于「上一层实现」，插件主题里使用会指向自己（自引用 → 无限递归 / OOM）。
3. **`@theme-init` 的语义** → 第一次冲突时被顶掉的那个实现（首个覆盖者），
   **不是** theme-fallback；因此在「最靠前的插件主题」内部同样会指向自己。
4. **能链式包裹的只有站点层** → `src/theme` 用 `@theme-original` 可包住最后一层插件主题，再往里没有合法别名。
5. **多个 plugin 用 wrap 模式改同一组件无法链式** → 插件主题里 `@theme-original` 指向自己（OOM），
   `@theme-init` 指向的是 preset 主题（如 theme-classic）而非上一个 plugin，最多只能保住一层。

第 2、3、5 条合起来就是「一个全局别名喂不饱一条链」的证据，也是下方
「为什么另起 specifier，而不改写 `@theme-original`」那一节的产地。

## 为什么另起 specifier，而不改写 `@theme-original`

`@theme-original/X` 是**公开且被广泛使用**的别名（每个组件一个全局值：`src/theme` 不提供该
组件时它与 `@theme/X` 同值）。
若把它改成「我下面那一层」，它的语义会**随导入者变化**，所有依赖它的内置组件 / 主题 /
站点 swizzle 都会被静默改写，影响范围不可控。

| 落点                             | 影响面                            |
| -------------------------------- | --------------------------------- |
| 改写 `@theme-original/X` 的解析  | ⚠️ 全站语义被改，风险不可控       |
| **新增一个 specifier**（本方案） | ✅ 零影响，未使用者的行为完全不变 |

## 插件如何注入 resolver

Docusaurus 插件在 `configureWebpack` 里给 `config.resolve.plugins` 追加一个解析器。
解析器只做一件事：**按「导入者属于哪一层」把 `@theme-prev/*` 改写到导入者下方的那一层**
（落点见上面的语义表：紧邻下方、且永不落在导入者自己或它上方）。
这一个 specifier 是**固定预设名**（`@theme-prev/`），不做成可配置项。

```js
// 插件初始化（异步）：拿插件列表
const plugins = await new PluginDiscovery(siteDir, logger).discover(); // 官方 loadContext + loadPluginConfigs

export default {
  // configureWebpack（同步）：推层栈 + 注入 resolver
  configureWebpack() {
    const layers = layersFromPlugins({ siteDir, plugins }); // 有序层栈
    // 每次构建新建实例：realpath 缓存挂在实例上，生命周期 = 一次构建
    const resolverPlugin = new PrevLayerResolverPlugin({ layers, logger });
    // 只返回自己新增的那一个：官方 `applyConfigureWebpack` 用 webpack-merge 拼接，
    // 数组默认策略是 **concat**。写成 `[resolverPlugin, ...已有]` 会让已有的 resolver
    // 被复制一份、实例化两次（实测 `[别人, resolver, 别人]`）。
    return { resolve: { plugins: [resolverPlugin] } };
  }
};
```

> 为什么分两步：Docusaurus 的 `applyConfigureWebpack()` 是**同步**的
> （`configureWebpack(...) ?? {}`），而推导层栈要 import core 的 ESM 入口。
> 插件初始化函数本身是被 `await` 的，因此层栈在初始化阶段算好、`configureWebpack` 直接用。

`PluginDiscovery` 随包公开（`src/index.mts` 的 `export { PluginDiscovery }`），因为「装了哪些主题
插件、实例长什么样」这一次推导本包之外也有消费者：`@show-docs/docusaurus-theme-component-page`
用它问「哪些装着的包交出整页条目」（约定与合成规则见
[那一包的维护者文档](../../theme-component-page/docs/internals.md)）。公开的是**这一个类**，
不是内部实现：`derivePlugins` / `withOfficialFields` 那些仍留在包内。实例随插件回收、进程里
不持状态那条承诺因此是**对外承诺** —— 别的消费者不能在这里加缓存，`reloadSite()` 之后拿到新层栈
靠的就是它（上面那段「为什么分两步」与 `./plugins.mts` 的类文档）。

代价是同一份配置可能被两个消费者各推一遍（各建一个 `PluginDiscovery` 实例）。这是有意的：
共享一次推导需要一个活过插件初始化的地方，而那正好废掉上面那条承诺。

## 谁来编未编译的 TS 源码

`@show-docs` 家族的主题层与组件是**未编译的 `.tsx` / `.jsx`**，随包发布 —— 由用它们的站点编译。
官方那条 babel 规则（`@docusaurus/core/lib/webpack/base.js` 里的 `excludeJS`）把整个
`node_modules` 排除在外，只给 `docusaurus*.js[x]` 开例外，所以从 npm 装进真项目时那些文件
没人编，报 `Module parse failed`。

这一格由本插件认领：`configureWebpack` 里用官方 `utils.getJSLoader()` 补一条 `.tsx?` 规则，
`include` 走 `needsShowDocsSourceRule()`（`src/source-js-rule.mts`）。

### 认领范围为什么是「scope」而不是「包根」

判据是 `node_modules/@show-docs/` 这一段，与具体哪个包无关：

- **覆盖全族**：家族里带源码层的包有九个（三个视图层、查看器、复制按钮、iframe、三条 API 层），
  各自认领自己的包根就是九份判据；按 scope 认领是一份。
- **与层栈无关**：认领范围不依赖「站点注册了哪些层」，所以哪一族包没装、装了哪几条，都不影响
  这一格 —— 以前按包根认领时，`theme-iframe` 自己那份入口得单独例外（它进 `tsc`，`lib/` 不在
  那份 `rootDir` 里、引不到判据），例外一多就要逐个对齐。
- **pnpm 的隔离布局照样在**：`node_modules/.pnpm/@show-docs+<包>@<版本>/node_modules/@show-docs/<包>/…`
  —— 那一段 `node_modules/@show-docs/` 完整。

### 为什么不重复官方那条

判据与官方 `excludeJS` 对齐：**官方那条不编的（`node_modules` 里的），本包才编**。官方那条还
额外放行 `docusaurus*.js[x]`，但本包只碰 `.ts` / `.tsx`，那一格与它无关 ——
两条规则的 `test` 覆盖面没有交集，不存在同一份文件跑两遍 babel。

工作区里（pnpm 软链把源码解析到 `node_modules` 之外）官方那条本来就在编，本包不认领：
判据里 `node_modules/@show-docs/` 那一段不在，规则自然不命中。

### 为什么不认领 `.mts` / `.cts` / `.d.ts`

- `.mts` / `.cts`：官方那条规则的 `test` 是 `/\.[jt]sx?$/i`，同样不含这两类 —— 它们由 Node
  自己带类型擦除加载（配置期那几份），不进浏览器 bundle。
- `.d.ts`：声明文件没有运行期内容，编它只是白跑一遍。

### 这一格以前散在七个包里

同一个判据抄了七处（每个带源码层的包各补一条规则），改一处忘另两处就是漂移；而且漂移了不会有
任何用例报红，只在**装机的站点**上以 `Module parse failed` 的形式现身。现在收在
`src/source-js-rule.mts` 一处，各主题包不再自己补 —— 护栏在
`test/view-layer-copies.test.mts`（「TS 源码的编译规则只有一处」），判据本身的用例在
`test/source-js-rule.test.mts`。

## 认层：`src/plugin-slots.mts` 里那两条判据

「`siteConfig.plugins` / `themes` 里那一项是不是某个包」（`slotIsNamespace()`，连同
`pluginSlotName()` 认那四种原始写法）与「本包注册了没有」（`assertPrevLayerResolverInstalled()`）
住在 `src/plugin-slots.mts`，经包出口 `./plugin-slots` 发出去。

**为什么是本包的事**：后一条问的正是「提供 `@theme-prev/*` 别名的那个插件在不在」。这句话只有
本包自己说得住。以前它住在 `@show-docs/docusaurus-theme-iframe` 的 `lib/` 里，于是任何想用它的
层都得先引那一族层，连带把「装了 `theme-iframe`」变成自己的安装前提 —— 而真正的前提只有本包
这一个。搬过来之后，`theme-iframe` 那条继续由 `lib/prerequisites.ts` 转调（它另外两条检查确实
属于那一族层），不依赖那一族的层（如 `theme-component-page`）直接引这一份。

**为什么是纯函数、为什么单开一条 `./plugin-slots` 出口**：读者有两处，一处在配置期（Node，
jiti 直接吃 `dist/`），另一处在浏览器里（`theme-iframe/lib/api-frame-entries.ts` 那份装机判定，
读的是 Docusaurus 序列化进浏览器配置的**原始**那两份清单）。包根本机会引 `node:*` 与 webpack，
浏览器侧引它会把这些一起拖进 bundle，所以走一条只含这个文件的子路径。两处读同一份判据，
因此不存在「装机判定认路径、前置检查只认包名」那种不对称。

判据本身的用例在 `test/plugin-slots.test.mts`；`test/api-frame-entries.test.mts` 与
`test/prerequisites.test.mts` 从两侧再各跑一遍真实形状（路径写法、`themes` 那份清单）。

## 输入处理：`@theme-prev/<rest>` 怎么切、怎么校验

组件名是**不可信输入**：`@theme-prev/<rest>` 的 `<rest>` 来自用户写的 import，会原样进
`path.join(layer.owner, <rest>)`。所以它必须是 `/` 分隔的安全片段（不接受 `.` / `..` /
绝对路径 / `\` / 空段），被拒绝时告警并交回官方解析。嵌套组件（`@theme-prev/DocItem/Footer`）照常支持。
这条校验是纯输入检查，对合法输入零成本；没有它，「层」的隔离能被一段相对路径绕过。

`?` / `#` 之后的部分**不算组件名，但算改写后的请求**：官方别名对 `@theme/X?raw` 一样生效并把尾部
带回解析结果（实测），所以这里用裸名定位文件、把尾部原样拼回落点。切法与上游 `ParseModule` 同口径
—— 第一个 `?` 或 `#` 起整段是尾部。

## 两个 hook 的选择（换一个就坏）

> 入口必须 tap `resolve`（裸 specifier 默认走「去 node_modules 里找」那条支路，
> `internal-resolve` 到不了），出口必须 `doResolve` 到 `internal-resolve`（回到 `resolve` 会形成
> 回环，且别名插件会把已是绝对路径的 request 再解析一遍 ⇒ webpack 只拿到
> `(function(){return null;})` 空模块占位）。本框是这条的产地，代码里（`src/resolver.mts` 的 `apply()`）只留指针。

> webpack 5 把 `contextInfo`（含 `issuer`）作为 `resolver.resolve()` 的**首参**传入，上游把它
> 原样挂成 `request.context`（`Resolver.js`：`obj = { context, path, request }`）—— 只有这一种
> 形态。enhanced-resolve 里不存在 `request.contextInfo`；首参给成字符串时上游会把它挪去 `path`、
> `context` 归一成 `{}`，所以顶层 `request.issuer` 同样永远不出现（判据见 `resolveIssuer`）。

## 层归属怎么判

`findIssuerLayerIndex` 只做**目录前缀**判定：任何落在某层目录内的文件（包括
`theme-a/shared/util.js`、`theme-a/node_modules/...`）都会被当作「那一层的导入者」。
也就是说，同一个模块被两层的文件 import 时解析结果不同 —— 这不是 bug，是**位置敏感**。

判之前把 issuer 与每个 layer owner 都 `realpath` 一次再比前缀，所以「同一目录的两种写法」不会
因为 `..` / 软链被算成两层。代价是一条反直觉的边界：**物理上位于主题目录内、但真实路径在层外
的文件，不属于该主题层**（`theme-a/logo-link -> /elsewhere/Logo.tsx` ⇒ `issuerIndex = -1`
⇒ 退回官方解析 + 告警）。需要这种结构时，别把主题文件软链到层外（只按字符串比较会让同一目录
被算成两层，那是**静默的错层**，比显式的「不在层内」更难查）。

实测：同一个 `import '@theme-prev/Logo'`，写在层内文件里构建成功、写在层外文件里直接
`Module not found`（真实 webpack 5.111.1）。

**主题插件模块会被加载两次**：`loadPluginConfigs` 用官方 `loadFreshModule` 加载插件模块（每次
新建 jiti 工厂 + `requireCache: false`），所以 ESM 主题插件模块会被加载两次（官方一次、我们一次）；
实测 ESM 顶层求值 2 次、CJS 1 次，两者构造函数各跑 2 遍（`test/discover.test.mts` 钉住）。因此
约束不是「构造函数无副作用」，而是「**整个模块加载期无副作用**」：顶层不得创建「跨实例身份
敏感」的对象（React Context、自定义 `Symbol`、全局注册表单例）。

## 环境相关的层栈漂移（已知边界）

`preset-classic` 按 `NODE_ENV` 决定是否加 `docusaurus-plugin-debug`
（`preset-classic/lib/index.js`），而 `docusaurus build` 会先设 `production`、
`docusaurus start` 不设。所以：

```
docusaurus build  → theme-classic, theme-a, theme-b, theme-c
docusaurus start  → plugin-debug, theme-classic, theme-a, theme-b, theme-c   ← 多一层
```

`plugin-debug` 只提供 `Debug*` 组件，与 `theme-classic` 无重叠，因此碰巧不影响已有落点。
也不需要「缓存 key」处理：层栈挂在插件实例上，两种环境本来就是两次独立的插件初始化。

层栈（本仓库实测）：

```
@docusaurus/core/lib/client/theme-fallback
@docusaurus/theme-classic/lib/theme        ← preset 主题
tools/theme-a/theme                        ← 用户 plugin 主题（按 plugins 顺序）
tools/theme-b/theme
tools/theme-c/theme
src/theme                                  ← 最外层「哨兵」层
```

常量也全部借官方，避免抄第二遍：`THEME_PATH` 直接读 `@docusaurus/utils`，
theme-fallback 的位置以**官方同一基准**推导（core 的 `lib/webpack/aliases` →
`../../client/theme-fallback`，与官方定义同构）；定位不到 core 就说这一层缺失（见 README「已知限制」）。

> **⚠️ 为什么不直接读别名表**
> 官方别名表里每个组件只有三个落点（`@theme-init` / `@theme-original` / `@theme`）。
> 某组件被 **3 层以上**覆盖时，中间层会从别名表里消失：
>
> | 覆盖链             | 别名表能看到的                                                   |
> | ------------------ | ---------------------------------------------------------------- |
> | `site > c > b > a` | `@theme-init=a`、`@theme-original=c`、`@theme=site` → **b 消失** |
> | `site > b > a`     | `@theme-init=classic`、`@theme-original=a`、`@theme=site`        |
>
> 实测只看别名表，`site > c > b > a` 会退化成 `site > c > a`，`theme-b` 被静默跳过。
> 因此层栈必须从 plugin 列表推导（别名表在本方案里已不再被读取）。

## 实测

判据分两档，免 build 的随 `pnpm test` 常规运行（不用等一次真实 build）：

- 没有给 Docusaurus 打补丁、`@theme-original` 未被改写、官方别名全落在层栈内
  → `test/layers.test.mts`（原在 `verify-chain.mts` 里，已迁出）；
- 层栈与官方 `loadThemeAliases` 入参同序、层路径已归一
  → `test/discover.test.mts` 与 `test/layers.test.mts`。

需要真实产物的（那条渲染链在两页上的样子）由 `pnpm build && pnpm verify:chain`
（读真实 build 产物）断言，判据清单以脚本输出为准（本文件不抄第二份）：

```
build/index.html               正文里：src/theme > theme-c > theme-b > theme-a
build/theme-markmap/docs/markmap-demo/index.html  整页没有任何包裹标记
```

`build/index.html` 就是主页：站点没有单独的首页组件，`packages/README.md` 以 `slug: /` 落在根。

这条链走的是 `DocCardList`：站点层 `src/theme` 加 `tools/` 那三层主题各包一层，最里面才是 theme-classic
真实的卡片列表。它**只出现在主页** —— 站点里只有 `packages/README.md` 写了 `<DocCardList />`，别的页面
根本不渲染这个组件，于是文档页那一格判据反过来，断言整页一个包裹标记都没有。

四层每层都被保留（站点层 → `theme-c` → `theme-b` → `theme-a` → theme-classic 的真实卡片列表）。
链尾的 theme-classic 不渲染 `data-*-wrapper` 标记，故在断言里不可见。

> **💡 对照实验**
> 插件主题里用官方的 `@theme-original` 包裹会 💥 **OOM**（`heap out of memory`）；
> 换成 `@theme-prev` 构建成功、4 层链全部保留。而这两行的差别**不是**「改了 `@theme-original`」
> ——`test/layers.test.mts` 会断言它没被改动。

## 升级 `@docusaurus/core` 时的检查单

本插件踩在六处**没有稳定性承诺**的内部契约上。`peerDependencies` 与版本护栏都只拦
「低于 `^3.9.2`」—— **高于已验证区间的漂移同样只会 warn、不会拦**，所以升级后必须跑
下面这张单子，绿灯全亮才算真的兼容（这些用例就是护栏，只是分散在各契约面文件里）：

| 内部契约                                                              | 守它的用例                                                                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `loadContext` / `loadPluginConfigs` 两个入口的存在与导出形状          | `test/discover.test.mts` 全文件（含「只挂 `default`」「加载即抛」两档降级）                                              |
| `normalizePluginOptions`（`@docusaurus/utils-validation`）            | `test/discover.test.mts`「插件 options 校验」两节                                                                        |
| `normalizeThemeConfig` + 各插件 `validateThemeConfig` 的两条查找路    | `test/discover.test.mts`「插件构造前的 themeConfig 合并」                                                                |
| core 包结构锚点 `lib/webpack/aliases` → `../../client/theme-fallback` | `test/layers.test.mts`「theme-fallback 定位」+「路径遍历兜底」                                                           |
| 层栈顺序 / 组件赢家 / 组件可见性与官方同口径                          | `test/layers.test.mts`「与官方 `loadThemeAliases` 同序」；`test/resolve.test.mts`「官方别名赢家」「组件可见性」          |
| enhanced-resolve 的 `internal-resolve` hook 与 `contextInfo` 形态     | `test/enhanced-resolve.test.mts` 全文件；`test/resolver.test.mts`「挂在 resolve 入口」「没有 internal-resolve hook」两条 |

跑法：`pnpm verify` —— 它含真实的 `docusaurus build` 与 `verify:chain` 端到端断言
（四层链真的渲染出来），比单跑单测多一层保障。

红灯先当**上游真的变了**处理：改实现对齐，再决定要不要抬高版本护栏。

## 设计取舍（明确不做什么）

| 取舍                                                                        | 原因                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **层栈从 plugin 列表推导，而不是只读别名表**                                | 别名表每个组件只有 3 个落点，3 层以上覆盖会丢中间层                                                                                                                                                                                                                                                                                                                                                                                                  |
| **不改 Docusaurus 任何文件**                                                | 只复用官方已导出的 `loadContext` / `loadPluginConfigs`，不与版本强绑定                                                                                                                                                                                                                                                                                                                                                                               |
| **解析失败一律交回官方**                                                    | 最坏情况退化为官方语义（真实报错），而不是静默产出错误产物                                                                                                                                                                                                                                                                                                                                                                                           |
| **层栈里没人提供该组件时不回落官方别名**                                    | 能用的落点里没有语义对的：`@theme-init` 要「最内层提供者」，而 `@theme` 是**最外层**全局赢家 —— 正好相反。宁可让人看到官方 `Module not found`，也不要安静地给一个语义相反的落点                                                                                                                                                                                                                                                                      |
| **不试图让插件主题「感知自己是不是栈顶」**                                  | 那需要跨层运行时状态，反而引入不可判定行为                                                                                                                                                                                                                                                                                                                                                                                                           |
| **`@theme-prev` 恒满足 `j < i`**                                            | 「落点严格在导入者下方」是模块图无环（不会 OOM）的来源，整个机制只有这一个 specifier，没有例外形态                                                                                                                                                                                                                                                                                                                                                   |
| **组件名必须通过安全校验**                                                  | 它是从 specifier 拼出来的不可信输入，直接进 `path.join` 会让「层」的隔离被一段相对路径绕过；校验是纯输入检查，对合法输入零成本                                                                                                                                                                                                                                                                                                                       |
| **插件构造失败一律告警（一次构建聚合成一条）**                              | 没有任何判据能可靠区分主题 / 非主题（入口都读得到、`getThemePath` 在压缩产物里会变短名）；漏报（层栈少一层且完全静默）比误报（多一行日志）严重得多                                                                                                                                                                                                                                                                                                   |
| **不为「没人走的路径」留机制**                                              | 没有真实触发场景的开关 / 兜底 / 自证装置，成本是永久的，收益是零；发现它就该**删掉**，而不是补算术让它成立                                                                                                                                                                                                                                                                                                                                           |
| **不为「只有测试在接的出口」留出口**                                        | 判据是「外面真的在用」。跨模块真在用的一个不动；只在本文件用的收成内部函数；只被测试用的**删掉**，测试改走真实路径（真实 `loadContext` / `layersFromPlugins` / 行为断言）。对外形状与「实际谁在用」对不上，文档和测试就会跟着这个形状一直把人往回带                                                                                                                                                                                                  |
| **同一件事只有一个产地**                                                    | `resolveCoreModule` 是 core 内部文件定位的唯一入口（`resolveFallbackDir` 的锚点判据也走它）；层栈推导在**一个循环里**既解析 `getThemePath()` 又入栈                                                                                                                                                                                                                                                                                                  |
| **内部状态不为「可读」而对外开洞**                                          | `realpathCache` 整体 private：外面要的只是「带上限的 `normalizeLayerPath`」这一个动作（`realpathOf`），不是那个 Map                                                                                                                                                                                                                                                                                                                                  |
| **缓存的上限是构造入参，出厂值照旧**                                        | 那一条判据钉的是「越过上限就不再写入、之后照旧现算出正确答案」这**两条行为**，与那个数具体是多少无关；按出厂的 8192 跑就是八千多次真实 fs 解析（实测 14s，慢机器上顶到 vitest 的 30s 超时就成了假红）。所以交出来的是**上限**，不是那个 Map；生产路径（`index.mts` 造 resolver 那一格）两格都不传，落回出厂值                                                                                                                                        |
| **组件扩展名固定为官方四种**                                                | 放宽会让 `provides()` 比官方别名体系宽 → 解析落到官方不认的文件上，出现两套可见性。同名多形态时的**赢家顺序**不靠推理（那是 fast-glob 的发射行为、非文档化契约），由与官方 `createAliasesForTheme` 交叉核对的用例钉住；同一口径还排掉**点开头的段**（官方 glob 默认 `dot: false`，`.hidden/Logo` 在它那边根本没有别名），排掉的形状与保留的形态在同一条交叉用例里双向断言                                                                            |
| **层只认「官方别名指向的那一个」主题目录，不收 `getTypeScriptThemePath()`** | 两个声明**不是同一份实现**：实测 `theme-classic` 的 JS 形态是 `lib/theme`（编译产物），TS 形态是它发布出去的 `src/theme`（**未编译源码**）。把后者也当层，`@theme-prev/X` 就从「紧邻下面那一层」落进了未编译 `.tsx`：`theme-a` 的 `@theme-prev/Logo` 本该到 `lib/theme/Logo/index.js`，结果到 `src/theme/Logo/index.tsx` —— 与官方 `@theme/X` 分叉，且构建直接 `Module parse failed`。「能不能被 `swizzle --typescript`」是 swizzle 的事，不属于层栈 |
| **`theme-fallback` 位置跟着 core 走，不从别名表反查**                       | 别名表里只有被覆盖 / 冲突过的组件才有落点，全覆盖时一个指向 fallback 的值都没有；语义关键层（落在它上面时要告警的锚点）不能建在别人数据的完整性上。拿不到 core 就明说这一层缺失，不再留第二条「有时灵有时不灵」的路                                                                                                                                                                                                                                  |
| **层属于哪一层按「层」判，不按文件路径判**                                  | 层不等 ⇒ 文件必不等，按层判严格更强；按路径判两个方向都会错（同层多文件漏判、同层同名不同文件误伤）                                                                                                                                                                                                                                                                                                                                                  |
| **组件名只做一次安全校验，不再加落点校验**                                  | `isSafeComponentName` 已经保证 `path.join` 不会越出层目录；它放行的一切都进不了落点校验，挡不住任何东西的分支只多一个漂移点                                                                                                                                                                                                                                                                                                                          |
| **realpath 缓存与层栈推导都挂在实例上**                                     | `configureWebpack` 每次构建都新建 resolver 实例、每次插件初始化都新建插件实例 —— 「实例 = 一次构建 / 一次初始化」就是需要的粒度；跨实例共享状态要额外处理 epoch 切换、窗口淘汰与构建交错，保护的是一个不存在的场景                                                                                                                                                                                                                                   |
| **解析缓存只存正解，负结论每次现算**                                        | 「这一层还没有 X」在 dev/watch 里会随文件出现而失效，而缓存没有任何失效路径 —— 存过负结论就把「现在有了」永久钉死。负结论的代价只是重算 `computeTarget`（字符串比较 + 有限次 exists），比静默不生效便宜得多                                                                                                                                                                                                                                          |
| **缓存键的分隔符取 NUL，不用 `\|`**                                         | `\|` 是合法文件名字符（POSIX），出现在组件名或 issuer 里就能让两组不同字段划分的请求拼成同一个键 → 拿到别人的落点，是静默错层。组件名已拒 NUL，真实路径也不含它，所以 NUL 分隔的键是单射的                                                                                                                                                                                                                                                           |
| **组件存在性只查文件系统，没有可注入的「存在」探针**                        | 唯一消费方是 `provides()`，而它必须与「这个文件真的在不在」同口径；探针只能在测试里假装文件存在，那测的是探针而不是生产路径                                                                                                                                                                                                                                                                                                                          |
| **改写的「栈上判等」只看 `(name, request)`，不复刻上游七个字段**            | 上游 `StackEntry#has` 比七个字段（name/path/request/query/fragment/directory/module）+ `preSeeded`，我们**故意更粗**：同名的 `internal-resolve` 加同一个绝对目标路径本就只可能来自同一条改写。误判方向是保守 —— 少改写一次、交回官方（对 `@theme-prev/*` 即真实 `Module not found`），不会静默回环；逐项复刻多六个永不参与判等的漂移点                                                                                                               |
| **`findIssuerLayerIndex` 收「realpath 函数」而不是「缓存对象」**            | 它只关心「怎么把路径归一」；把带上限的 Map 包成一个类再传进来，等于让判层逻辑知道「谁在缓存」。缓存是 resolver 的私有实现，`realpathOf` 是它交出去的那一个能力                                                                                                                                                                                                                                                                                       |
| **从 core 的解析上下文读它自己的依赖**                                      | core 在 pnpm 下是符号链接进 `.pnpm/` 的，它的依赖只在它的真实路径下可解析；拿别人的 `node_modules` 当基准，拿到的是「凑巧也能用」的那一份                                                                                                                                                                                                                                                                                                            |

## 不能碰的做法（留作对照）

试过、看着可行但**不成立**的做法。留下这张表是为了不重复踩坑（源码注释不再复述）。

| 不成立的做法                                                   | 为什么                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 自己读配置算指纹感知配置改动                                   | 配置要生效必先过官方那一关，官方重读后 `loadContext` 交出的就是新配置；自己再读一遍多一类「读到了但没生效」的失败                                                                                                                                                |
| 从 `configureWebpack` 的第二参数（或插件上下文）取插件实例列表 | 第二个形参是 `isServer` **布尔值**；`context.plugins` 在初始化阶段也还没有（实测：它只在官方自己调 `configureWebpack` 时才被拼进那份拷贝里）。据此改过一版，「链失效」被 `.docusaurus` 的 webpack 缓存遮住，本地全绿、CI 红在 `Can't resolve '@theme-prev/Logo'` |

## 类型声明

`types/theme-specifiers.d.ts` 把四条 specifier 收成一体，理由不是顺手：

- Docusaurus 的 `@docusaurus/module-type-aliases` 里 `@theme-original/*` 与 `@theme-init/*`
  是两条**无类型**的通配（`@theme-init` 那份 `any` 会把包裹组件的 props 全放开，与其余三条
  不是一个口径），`@theme/*` 则是一串写死的组件名；
- 本仓库的 `node_modules` 布局让 `tsc` 解析不到 `@docusaurus/theme-classic`。

所以这四条是一个整体，**不能只删 `@theme-prev` 那一条**。文件怎么被消费方收进 program（`files`
点名）、为什么它不编译、发布要靠 `files` 带上 `types/`，是使用者要照着做的那一半，记在
[`../README.md`](../README.md) 的「类型声明」一节。

## 语言与编译约定

核心包用 TypeScript 编写（`.mts`，ESM，源码在 `src/`），由 `tsc` 编译到本包的 `dist/`
（`.mjs` + `.d.mts`），那份产物就是包出口。改动后记得 `pnpm build:core`
（`pnpm build` / `pnpm test` 已内置）。

`@theme-prev/*` 是运行时动态别名，类型声明见本包的
`../types/theme-specifiers.d.ts`（连同官方那两个别名一起，理由见本文件的
「类型声明」一节）；删掉那份文件，`pnpm typecheck` 与 `pnpm lint:type` 都会红。
