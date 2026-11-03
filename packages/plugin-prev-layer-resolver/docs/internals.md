# plugin-prev-layer-resolver：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：机制为什么这么设计、踩过的坑与实测证据、
内部契约清单。使用者侧的事实（接入、语义、告警怎么读、硬性约束、边界）在
[`../README.md`](../README.md)。

`src/` 的注释里「理由见 README『…』」的指针，凡是落在下面这些章节里的，都指本文件。

## 组成

| 文件                          | 职责                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/index.mts`               | 插件入口：推层栈 + 空层栈告警 + 注入 resolver                                                      |
| `src/layers.mts`              | 层栈推导（与官方 `loadThemeAliases` 同序）+ core 模块定位                                          |
| `src/plugin-slots.mts`        | 认那两份清单的纯判据（`slotIsNamespace` / 四种原始写法）                                           |
| `src/registered-plugins.mts`  | 「本包注册了没有」与「注册成了几份」两条判据（后者另发一条现成的点名）：原始清单 + preset 两处都认 |
| `src/plugins.mts`             | 复用官方 `loadContext` / `loadPluginConfigs` 取回插件列表                                          |
| `src/resolve.mts`             | 纯逻辑：组件定位 / 导入者归属 / issuer / specifier 匹配                                            |
| `src/resolver.mts`            | 逐层解析核心（`PrevLayerResolverPlugin`）                                                          |
| `src/types.mts`               | 公共类型                                                                                           |
| `types/theme-specifiers.d.ts` | `@theme*` 三条 specifier 的类型声明，见 README「类型声明」                                         |

源码全在 `src/` 下，`dist/` 是它的编译产物（`rootDir` = `src/`），两者的文件一一对应。
三条出口发的是 `src/` 那一份（`./plugin-slots`、`./registered-plugins` 两条整条指过去，
`.` 那条只把 `types` 指过去），口径与代价记在下面「配置期跨包的出口」一节。
`types/` 不参与编译，见 README 的「类型声明」。

## 实现结构

实现按「纯函数 / 副作用」切开：能穷举的解析逻辑在无副作用的函数里（`src/resolve.mts` /
`src/layers.mts` / `src/resolver.mts` 的目标选择），副作用留在接线处（`src/index.mts` 推层栈、
`src/plugins.mts` 读插件列表、`src/resolver.mts` 的 `apply()`）。各文件职责见上方「组成」，
各目录职责见仓库根 README 的「目录结构」；放错地方的代价见本包 README 的「使用约束」。

> 源码是 ESM 的 `.mts`，相对 import 写**源码名**（`./layers.mts`），产出时才变成 `./layers.mjs`；
> 这条口径与差量清单记在[编译插件包的维护者文档](../../plugin-compile-source/docs/internals.md)的
> 「这一族构建包的编译口径」，这里不抄第二份。`tsc` 把改写后的 import 搬进包内 `dist/`，站点按包名
> 拿到的那一份入口（`.` 的 `default`）就是 `dist/index.mjs`，所以改完源码要 `pnpm build:core`。
> 另外两条子路径与 `.` 的 `types` 指回 `src/*.mts`：读它们的是别的包在配置期的源码，而那一步跑在任何
> 构建之前 —— 口径、`files` 那笔闭包账、以及「Node 凭什么吃得动未编译的 `.mts`」都记在下面
> 「配置期跨包的出口」一节。

## 配置期跨包的出口

本包的三条出口（`.` 的 `types` + `./plugin-slots` / `./registered-plugins`）发的都是 `./src/*.mts`，
**不指 `dist/`**。

理由是那三道静态闸门 —— `lint:type`、`typecheck`、`lint:eslint:check` —— 都不 build：干净检出里
`dist/` 还不存在，出口指产物的话，按包名引这几把出口的那些入口当场 TS2307（`import type` 也查），
`import-x/no-unresolved` 跟着红。**两道闸门与 knip 读的都是 `exports` 这一处**，没有第二张要同步的表。

运行期这一侧分两种装法，两边都实测过：

- **工作区里（pnpm 软链）**：软链把 realpath 挪出 `node_modules`，Node 默认剥类型
  （`base.json` 的 `erasableSyntaxOnly` 保证 `.mts` 里没有需要编译才存在的语法），连 plain `import()`
  都吃得动。各包 `engines.node` 的下界跟着根那份 `engines` 走（`^24.0.0 || ^26.0.0`），就是这一格。
- **真·npm 安装**：包被**复制**进 `node_modules`，Node 自己有一条
  `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` 拒绝对 `node_modules` 下的源码剥类型。这一格由官方
  加载插件入口那一步接住 —— Docusaurus 用 jiti 的 `loadFreshModule` 读配置与插件入口
  （`@docusaurus/utils/lib/moduleUtils.js`），jiti 自带剥类型、不受那条限制：把本包与
  `theme-git-badge` 的 tarball 解进同一个 `node_modules`、用 jiti 加载
  `theme-git-badge/dist/index.mjs`，它按包名引 `…/registered-plugins`（指回 `src/registered-plugins.mts`）
  那一条边走得通，入口也照常跑出插件实例。

**边界**：这几把源码出口只承诺 Docusaurus 配置期那条加载链；站点自己拿 plain `import()` 去引一把子路径，
npm 安装下撞的就是上面那条限制。同一格限制早就是 `./lib/*` 那一族的前提 ——
`theme-scalar` / `theme-stoplight` 的 `dist/index.mjs` 一直在配置期按包名引本包的
`lib/isolate-renderer-css.ts`。

代价两条：

1. `files` 得把**被引源码的传递闭包**一起点名（本包发整个 `src/`），少一个文件就是发布物里的运行期
   `ERR_MODULE_NOT_FOUND`。护栏在 `test/plugin.test.mts` 里那条「`exports` 指回源码的那几格，那份源码
   连同它的相对 import 闭包都在发布清单里」—— 它在真打包清单上把闭包走完。
2. 各包 `.` 那条只换 `types`，`default` 仍是 `dist/index.mjs` —— 插件入口那一份照旧要 `pnpm build:core`
   才生效。

使用者侧的那一半（接入、语义、边界）在 [`../README.md`](../README.md) 的「出口」一节。

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
// 插件初始化（异步）：拿插件列表（第三个参数是站点实际加载的那份配置文件 `context.siteConfigPath`）
const plugins = await new PluginDiscovery(
  siteDir,
  logger,
  siteConfigPath
).discover(); // 官方 loadContext + loadPluginConfigs

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
插件、实例长什么样」这一次推导在包外也有用处（集成测试就拿它按真站点骨架把插件实例取出来，
见 `test/component-page-contrib.test.mts`）。公开的是**这一个类**，不是内部实现：
`derivePlugins` / `withOfficialFields` 那些仍留在包内。实例随插件回收、进程里不持状态那条
承诺因此是**对外承诺** —— 消费者不能在这里加缓存，`reloadSite()` 之后拿到新层栈靠的就是它
（上面那段「为什么分两步」与 `./plugins.mts` 的类文档）。

## 「谁来编这一族未编译的 TS 源码」不在本包

那条 `.tsx?` 规则、它的认领范围、`babelOptions` 为什么必须与官方同源，都记在
`@show-docs/docusaurus-plugin-compile-source`
（[`../../plugin-compile-source/docs/internals.md`](../../plugin-compile-source/docs/internals.md)）。
本包与它只有「与层栈无关」这一句交集：`configureWebpack` 只交 `resolve.plugins`。

本包也不向那边交任何东西：「怎么定位 core」那三把 helper 只在包内用（链底那一层就是从 core 的
模块位置推出来的），包外没有消费者，而「用不到的那一格不许声明」。

## 认层：`src/plugin-slots.mts` 与 `src/registered-plugins.mts`

「`siteConfig.plugins` / `themes` 里那一项是不是某个包」（`slotIsNamespace()`，连同
`pluginSlotName()` 认那四种原始写法）住在 `src/plugin-slots.mts`，经包出口 `./plugin-slots` 发出去；
「本包注册了没有」（`pluginIsRegistered()`，报错文案由调用方自己给）住在
`src/registered-plugins.mts`，经 `./registered-plugins` 发出去。同一份文件里还有另一道题：
「**这个包被注册成了几份**」（`pluginInstanceCount()` / `assertSinglePluginInstance()`），
吃不下第二份实例的那两层各调它一次。

**为什么拆成两份**：前一份是纯函数，只看手上的那两份清单；后一份还要回答「清单上还可能有
**第三处来源**」。站点把插件写在 `presets:` 里完全合法，而官方把那几份清单合并成真实插件表发生
在 `loadPluginConfigs` 内部，`LoadContext` 上没有合并后的清单可读 —— 只读原始清单会把一个装齐了的
站点判死（那句报错让它去 `pnpm add` 一个已经装着的包）。所以先按原始清单判（同步、也是绝大多数
站点的全部），判不出且站点确实写了 `presets` 时，再复用官方那一对函数问一次：
`loadContext({siteDir, config: siteConfigPath})` → `loadPresets(official)`，读它按声明顺序 flatMap
出来的 `plugins` / `themes`。

**代价与判错口径**：问官方那一跳只在「缺的这一侧 + 站点写了 presets」时发生，而且要等，
所以这一格交回 `Promise`，调它的层 `loadContent()` 必须把它交回官方等（入口里别的活照旧同步干完，
别让这一跳插到「必须在被读走之前装上」的那些动作前面 —— `theme-git-badge` 那一份是先把
`parseFrontMatter` 包住再 `await` 的）。判错的两侧不对称：误报判死一个本来能成的构建，漏报只是
把构建期注定会炸的那一步留到构建期，因此**问不到官方那一份时不拦**（core 结构变了、配置文件读不了、
preset 函数自己抛，三种都退成「不知道」）；而「官方答了、那份清单里没有」判得实。

「几份」那一道是同一套读法的第二个问题（`pluginInstanceCount()`：原始清单数一遍，站点写了 presets
再把 preset 那份加上），误差方向也同一档 —— **只可能少判，不可能多判**：原始清单数到了就不去翻案，
问不到官方时按原始清单那份交回。认的是包名而不是实例 id，因为官方只拦「同一插件挂两次又不给 id」，
给了不同 id 的两份在它那里合法。`assertSinglePluginInstance()` 只在两份以上才响：一份都没有是
「装没装」那道题（上面那一条报），这里跟着报只会让站点去多装一个本来不缺的包；「为什么这一层吃不下
第二份」由调用方在 `why` 里自己说，本包不管 —— 否则这句话要在每家复读一遍。

**这两条判据的上限是「注册」**：官方允许插件构造函数返回 `null` 自行禁用（core `init.js` 的
`onlyInitializedPlugins()` 把 `plugin: null` 那些滤掉），那种包在清单上照样看得见，但官方不会跑它的
`loadContent()`。读得到真实例的唯一一处是 `allContent`，而它不在 `LoadContext` 上 —— 所以
「装了却什么都没交」不在本包的题目里，归机制层那一侧判。三处判据（层栈 / 注册 / `allContent`）各读
什么、什么时候能给出不同答案，集中记在
[`packages/theme-component-page/docs/internals.md`](../../theme-component-page/docs/internals.md)
的「「装了」这件事有三处判据」。

**为什么是本包的事**：那一条问的是「这一族的插件在不在站点那两份清单上」，而「哪一份清单、
按什么名字认」只有本包自己说得住。住在任何一层里，想用它的层就得先引那一层，连带把那一层的
安装前提一起背走 —— 而真正的前提只有本包这一个。这一格交出去的是判据 `pluginIsRegistered`：
要查的那一层自己调它、自己写报错（README 那段给的就是这一份写法），本仓今天没有哪一层在配置期
真查它 —— 用例仍从判据那一侧钉着它（`test/registered-plugins.test.mts`）。
同一份文件里的另一道题（「注册成了几份」）只剩一家查自己那一格：`themes/theme-git-badge`，
护栏在 `test/infrastructure-rules.test.mts`。

**为什么纯函数那一份单开一条 `./plugin-slots` 出口**：读者都在配置期（Node）。包根本机会引
`node:*` 与 webpack，配置期读者不该为此多背依赖，所以走一条只含这个
文件的子路径；纯函数也让判据本身能在单测里直接钉，不必先建一个站点。

判据本身的用例在 `test/plugin-slots.test.mts`；preset 那一半在
`test/registered-plugins.test.mts`（走真的 `loadContext` + `loadPresets`，替身掉就什么都没验），
真实形状（路径写法、`themes` 那份清单、写成 preset 里那一份）也在这一份里从判据那一侧钉；
「注册了两份要响」接进入口那一面由 `test/package-entries.test.mts` 里徽标那一组那条
「第二份实例当场点名」钉。

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
docusaurus build  → theme-classic, theme-base, theme-a, theme-b, theme-c
docusaurus start  → plugin-debug, theme-classic, theme-base, theme-a, theme-b, theme-c   ← 多一层
```

`plugin-debug` 只提供 `Debug*` 组件，与 `theme-classic` 无重叠，因此碰巧不影响已有落点。
也不需要「缓存 key」处理：层栈挂在插件实例上，两种环境本来就是两次独立的插件初始化。

层栈（本仓库实测）：

```
@docusaurus/core/lib/client/theme-fallback
@docusaurus/theme-classic/lib/theme        ← preset 主题
tools/theme-base/theme                     ← 链底：组件本体在这一层
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
> 因此层栈必须从 plugin 列表推导（本方案不读那份别名表）。

## 实测

判据分两档，免 build 的随 `pnpm test` 常规运行（不用等一次真实 build）：

- 没有给 Docusaurus 打补丁、`@theme-original` 未被改写、官方别名全落在层栈内
  → `test/layers.test.mts`（原在 `verify-chain.mts` 里，已迁出）；
- 层栈与官方 `loadThemeAliases` 入参同序、层路径已归一
  → `test/discover.test.mts` 与 `test/layers.test.mts`。

需要真实产物的（那条渲染链在各页上的样子）由 `pnpm build && pnpm verify:chain`
（读真实 build 产物）断言，判据清单以脚本输出为准（本文件不抄第二份）：

```
build/plugin-prev-layer-resolver/docs/chain-demo/index.html  正文里：src/theme > theme-c > theme-b > theme-a
build/index.html                整页没有任何包裹标记
build/theme-markmap/docs/markmap-demo/index.html  整页没有任何包裹标记
```

那条链走的是 `ChainDemo`：站点层 `src/theme` 加 `tools/` 那三层主题各包一层，最里面才是链底那份
组件本体（`tools/theme-base` 那一层提供的）。它只出现在**渲染了这个组件的那一格**（解析器包那份
示例页 `docs/chain-demo.md`），而组件别名是全局解析的，所以链跟内容根无关；别的页面根本不渲染
这个组件，于是那些页面的判据反过来，断言整页一个包裹标记都没有。

四层每层都被保留（站点层 → `theme-c` → `theme-b` → `theme-a` → 链底那份组件本体）。
链尾那一层不渲染 `data-*-wrapper` 标记，故在断言里不可见。

> **💡 对照实验**
> 插件主题里用官方的 `@theme-original` 包裹会 💥 **OOM**（`heap out of memory`）；
> 换成 `@theme-prev` 构建成功、4 层链全部保留。而这两行的差别**不是**「改了 `@theme-original`」
> ——`test/layers.test.mts` 会断言它没被改动。

## 升级 `@docusaurus/core` 时的检查单

本插件踩在七处**没有稳定性承诺**的内部契约上。`peerDependencies` 与版本护栏都只拦
「低于 `^3.9.2`」—— **高于已验证区间的漂移同样只会 warn、不会拦**，所以升级后必须跑
下面这张单子，绿灯全亮才算真的兼容（这些用例就是护栏，只是分散在各契约面文件里）：

| 内部契约                                                                 | 守它的用例                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `loadContext` / `loadPluginConfigs` 两个入口的存在与导出形状             | `test/discover.test.mts` 全文件（含「只挂 `default`」「加载即抛」两档降级）                                              |
| `loadContext` 的 `config` 入参（官方 `loadSiteConfig` 用它定位配置文件） | `test/discover.test.mts`「配置文件：读站点实际用的那一份」                                                               |
| `normalizePluginOptions`（`@docusaurus/utils-validation`）               | `test/discover.test.mts`「插件 options 校验」两节                                                                        |
| `normalizeThemeConfig` + 各插件 `validateThemeConfig` 的两条查找路       | `test/discover.test.mts`「插件构造前的 themeConfig 合并」                                                                |
| core 包结构锚点 `lib/webpack/aliases` → `../../client/theme-fallback`    | `test/layers.test.mts`「theme-fallback 定位」+「路径遍历兜底」                                                           |
| 层栈顺序 / 组件赢家 / 组件可见性与官方同口径                             | `test/layers.test.mts`「与官方 `loadThemeAliases` 同序」；`test/resolve.test.mts`「官方别名赢家」「组件可见性」          |
| enhanced-resolve 的 `internal-resolve` hook 与 `contextInfo` 形态        | `test/enhanced-resolve.test.mts` 全文件；`test/resolver.test.mts`「挂在 resolve 入口」「没有 internal-resolve hook」两条 |

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
| **`theme-fallback` 位置跟着 core 走，不从别名表反查**                       | 别名表里只有被覆盖 / 冲突过的组件才有落点，全覆盖时一个指向 fallback 的值都没有；语义关键层（落在它上面时要告警的锚点）不能建在别人数据的完整性上。拿不到 core 就明说这一层缺失，不留第二条「有时灵有时不灵」的路                                                                                                                                                                                                                                    |
| **层属于哪一层按「层」判，不按文件路径判**                                  | 层不等 ⇒ 文件必不等，按层判严格更强；按路径判两个方向都会错（同层多文件漏判、同层同名不同文件误伤）                                                                                                                                                                                                                                                                                                                                                  |
| **组件名只做一次安全校验，不加落点校验**                                    | `isSafeComponentName` 已经保证 `path.join` 不会越出层目录；它放行的一切都进不了落点校验，挡不住任何东西的分支只多一个漂移点                                                                                                                                                                                                                                                                                                                          |
| **realpath 缓存与层栈推导都挂在实例上**                                     | `configureWebpack` 每次构建都新建 resolver 实例、每次插件初始化都新建插件实例 —— 「实例 = 一次构建 / 一次初始化」就是需要的粒度；跨实例共享状态要额外处理 epoch 切换、窗口淘汰与构建交错，保护的是一个不存在的场景                                                                                                                                                                                                                                   |
| **解析缓存只存正解，负结论每次现算**                                        | 「这一层还没有 X」在 dev/watch 里会随文件出现而失效，而缓存没有任何失效路径 —— 存过负结论就把「现在有了」永久钉死。负结论的代价只是重算 `computeTarget`（字符串比较 + 有限次 exists），比静默不生效便宜得多                                                                                                                                                                                                                                          |
| **缓存键的分隔符取 NUL，不用 `\|`**                                         | `\|` 是合法文件名字符（POSIX），出现在组件名或 issuer 里就能让两组不同字段划分的请求拼成同一个键 → 拿到别人的落点，是静默错层。组件名已拒 NUL，真实路径也不含它，所以 NUL 分隔的键是单射的                                                                                                                                                                                                                                                           |
| **组件存在性只查文件系统，没有可注入的「存在」探针**                        | 唯一消费方是 `provides()`，而它必须与「这个文件真的在不在」同口径；探针只能在测试里假装文件存在，那测的是探针而不是生产路径                                                                                                                                                                                                                                                                                                                          |
| **改写的「栈上判等」只看 `(name, request)`，不复刻上游七个字段**            | 上游 `StackEntry#has` 比七个字段（name/path/request/query/fragment/directory/module）+ `preSeeded`，我们**故意更粗**：同名的 `internal-resolve` 加同一个绝对目标路径本就只可能来自同一条改写。误判方向是保守 —— 少改写一次、交回官方（对 `@theme-prev/*` 即真实 `Module not found`），不会静默回环；逐项复刻多六个永不参与判等的漂移点                                                                                                               |
| **`findIssuerLayerIndex` 收「realpath 函数」而不是「缓存对象」**            | 它只关心「怎么把路径归一」；把带上限的 Map 包成一个类再传进来，等于让判层逻辑知道「谁在缓存」。缓存是 resolver 的私有实现，`realpathOf` 是它交出去的那一个能力                                                                                                                                                                                                                                                                                       |
| **从 core 的解析上下文读它自己的依赖**                                      | core 在 pnpm 下是符号链接进 `.pnpm/` 的，它的依赖只在它的真实路径下可解析；拿别人的 `node_modules` 当基准，拿到的是「凑巧也能用」的那一份                                                                                                                                                                                                                                                                                                            |

## 不能碰的做法（留作对照）

试过、看着可行但**不成立**的做法。留下这张表是为了不重复踩坑（源码注释不复述）。

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

## 基础设施链的规矩

这一族的基础设施有四格：本包（最一般）、`plugin-compile-source`、`theme-component-page`、
`theme-iframe`（最具体）。地图见仓库根 README 的「基础设施包」一节。

判据不是「谁比较大」，而是**有没有别的层靠它成形**：功能层回答「这一页长什么样」，基础设施回答
「这一类页怎么被交给别的东西」，并且只实现一次。依赖只能从具体指向一般 —— 下面那一格不知道上面是谁。
两种用法都要成立（单独装上 / 被别人复用），缺一条就不成基础设施。

下面是这一格的规则。第 1–3 条、第 5 条与第 10 条读磁盘就能查：前者由
`test/infrastructure-rules.test.mts` 与 `test/view-layer-copies.test.mts`、后者由
`test/specifier-usage.test.mts` 钉住；其余靠评审。

1. **四格按一般度分层，依赖只从具体指向一般。** `theme-component-page` 是 `theme-iframe` 的基础设施
   —— 整页交给一个框就是整页交给一个组件的一支特例：`theme-iframe` 可以用它，它不能用
   `theme-iframe`；上面那几格都可以用解析器包，解析器包一个都不用。下面那格不知道上面是谁，
   反向依赖就是把「一般」焊死在某一支上。
2. **功能层只能依赖基础设施，功能层之间互不依赖。** 基础设施也不 `import` 任何功能层。
   注册表里用**字符串**登记别的层（`'@show-docs/docusaurus-theme-scalar'` 那种）是数据，
   不是依赖 —— 只有 `import` 才算。反过来也一样：**用不到的那一格不许声明** —— 只有真把规则
   交给 `theme-component-page` 的层才引它 —— 它们引的也只有 `./lib/` 那两格（那份类型与样式表
   分流）；`themes/`
   那一族（头像、复制按钮、侧边栏徽标、图片查看器）各管自己那一格，既不引机制层也不声明它，
   装包时要的只剩编译插件那一条 —— 徽标那一层
   另装解析器包的**模块**跑自己那条单实例判据，但也不查解析器**注册**了没有：层里写的是官方别名。
3. **单独可用是硬要求。** 每格只依赖它下面那几格，所以拿掉上面任意几格都还能装：
   解析器包和 `plugin-compile-source` 对 `@show-docs` 的依赖都为零（编译插件取那份 babel 配置路径
   那一跳改成按自己的依赖清单直接引官方 `@docusaurus/babel`），`theme-component-page` 只声明编译插件那一格，
   `theme-iframe` 再加
   `theme-component-page`（框页今天就是经后者挂上去的 —— 方向正是一般到具体）。
   新增依赖前先问：这条能不能只往下要？不能，就说明放错了地方。
4. **复用要走显式出口。** 别的层引的是 `exports` 点名的子路径（`./lib/*`、`./types/*`、
   `./plugin-slots`、`./registered-plugins`），不深挖 `dist/`。
   同一个子出口里不要混进两种运行环境：浏览器会引到的那几份
   不许拉进 `node:*`（配置期那几份由 jiti 直接吃源码，浏览器那几份由 webpack 编译）。
5. **一份判据一处实现。** 同一个判断只有一份，别的层引它、不抄它。视图层那三处共用外壳
   就是这条的样板，护栏在 `test/view-layer-copies.test.mts`。
   同一条的另一头是「谁用它」：编译这一族未编译 TS 源码那条 babel 规则只住在
   `plugin-compile-source` 一处，各主题包一行都不 `import` 它 —— 但**谁把 `.ts` / `.tsx` 随包发出去，
   谁就在 `peerDependencies` 里声明它**，站点漏装的那一步因此红在装包而不是拖到打包
   （护栏在 `test/infrastructure-rules.test.mts` 第六条，
   按各包自己那份 `files` 判，新增一个发源码的包不必回来改清单）。
6. **只收已经有两个消费者的机制。** 一个层自己只用一次的形状留在那个层里；成为基础设施要等
   第二个消费者真的出现。提前抽象多出来的是一层要同步的东西，不是少写几行。
7. **机制不带业务默认。** 空配置等于「没有这一层」：`theme-component-page` 的空清单不命中任何页，
   `theme-iframe` 没写那几把键时页面照旧，解析器包没装插件时层栈就不存在。基础设施不替站点挑
   组件、挑地址、挑文案。
8. **失败必须可见。** 配置期能判的错在配置期红掉并点名到哪一格；只有浏览器才知道的落空给开发
   模式告警。装上了却安静地什么都不做，是最难查的一类。
9. **两种用法都要有文档与用例。** 单独用法写在包 README，复用契约写在包 `docs/`；`src/` 与
   `lib/` 在覆盖率红线上，`theme/` 与 `components/` 由 e2e 钉。加一条复用契约，两边的用例一起加。
10. **没有第二层覆盖就别走链。** 仓库里只有一个层提供某个组件时，那个层用官方别名
    `@theme-init/X`（最初那一份）—— `@theme-prev/X` 留给真有两层以上覆盖的组件
    （`ChainDemo` 那种）。多一层链没换来任何东西，只多一次按导入者算落点；
    反过来，有多个提供者却用 `@theme-init` 会跳过下面那几层。

### 新增一层之前先问

- **要 `@theme-prev/*` 链式覆写、认某个槽位？** 用解析器包，别在各层各补一份。
- **这一族随包发布的未编译 `.ts` / `.tsx` 要被编？** 用 `@show-docs/docusaurus-plugin-compile-source`，
  别在各层各补一条 babel 规则。
- **包一个组件时？** 仓库里只有你这一层提供它 → `@theme-init/X`；有两层以上 → `@theme-prev/X`。
- **这一页整页交给一个组件？** 走 `theme-component-page` 的清单（站点写 `components` + `rules`
  两格，或主题包在 `loadContent()` 里交回 `componentPage: { components, rules }`），别新写一层 `DocItem`。
- **整页放进一个同源框？** 也只走 `theme-component-page`：交一个组件、配一条 `render: 'iframe'` 的规则，
  框内那份文档、握手与地址都在机制层的 `lib/` 里，别自己拼 iframe 与 `postMessage`
  （`scalar` / `redoc` / `stoplight` 三条就是这么接的）。嵌**别人站点**的页面是 `theme-iframe` 的
  `iframe:`，跨源、没有那套通道。
- **只在正文上方加一块视图？** 用 `theme-component-page/lib/view-layer-shell.tsx` 那份外壳
  （`theme-markmap` / `theme-erd` / `theme-diff` 三条都引它，三页都由 component-page 的清单挂上）。

## 语言与编译约定

核心包用 TypeScript 编写（`.mts`，ESM，源码在 `src/`），由 `tsc` 编译到本包的 `dist/`
（`.mjs` + `.d.mts`），站点按包名取的入口（`.` 的 `default`）就是那份产物；三条子路径发的是
`src/` 里的源码本身（见上方「组成」）。改动后记得 `pnpm build:core`
（`pnpm build` / `pnpm test` 已内置）。

`@theme-prev/*` 是运行时动态别名，类型声明见本包的
`../types/theme-specifiers.d.ts`（连同官方那两个别名一起，理由见本文件的
「类型声明」一节）；删掉那份文件，`pnpm typecheck` 与 `pnpm lint:type` 都会红。
