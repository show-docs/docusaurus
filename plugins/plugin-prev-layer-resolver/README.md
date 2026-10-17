# plugins/plugin-prev-layer-resolver

核心包：让**多个主题层层包裹同一个组件**成立，且 `@theme-original` 官方语义零改动。

用 TypeScript（`.mts`）编写，源码在本包的 `src/`，由 `tsc` 编译到本包的 `dist/`
（`.mjs` + `.d.mts`）；`dist/index.mjs` 就是包出口（`exports`），`docusaurus.config.mjs`
按**包名**加载到的正是这份产物（`require.resolve('@show-docs/docusaurus-plugin-prev-layer-resolver')`）。
改完源码要 `pnpm build:core`。
本包是 workspace 包（见 `pnpm-workspace.yaml` 的 `packages:`），所以按包名解析 —— 它搬到哪个目录都不用改站点配置。

## 一句话说明

官方 `@theme-original/X` 是**每个组件一个全局值**，只能等于层栈里的某一层；
而链上每一层想要的是「**我自己下面那一层**」——多个消费者要多个不同答案，
一个全局别名原理上无法同时满足。

本方案**不碰它**，另开一个 specifier，在 webpack resolve 阶段按「导入者属于哪一层」逐次改写。

层栈（哪些层、什么顺序）**全部自动推导**：不需要在 `docusaurus.config.mjs` 里写配置清单，
也不需要给 Docusaurus 打补丁。环境：`pnpm 12` + `Docusaurus 3.10.2` + `React 18`。

## 背景：不接本方案时的实测结论

上面那句「原理上无法同时满足」不是推理出来的，是在一个最小站点上实测出来的五条：

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

## 组成

| 文件                          | 职责                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `src/index.mts`               | 插件入口：推层栈 + 空层栈告警 + 注入 resolver             |
| `src/layers.mts`              | 层栈推导（与官方 `loadThemeAliases` 同序）+ core 模块定位 |
| `src/plugins.mts`             | 复用官方 `loadContext` / `loadPluginConfigs` 取回插件列表 |
| `src/resolve.mts`             | 纯逻辑：组件定位 / 导入者归属 / issuer / specifier 匹配   |
| `src/resolver.mts`            | 逐层解析核心（`PrevLayerResolverPlugin`）                 |
| `src/types.mts`               | 公共类型                                                  |
| `types/theme-specifiers.d.ts` | `@theme*` 三条 specifier 的类型声明，见下                 |

源码全在 `src/` 下，`dist/` 是它的编译产物（`rootDir` = `src/`），两者的文件一一对应。
`types/` 不参与编译，见下面的「类型声明」。

## 新 specifier

设层栈（内 → 外）为 `L0..Ln`，导入者在 `Li`：

| specifier       | 解析目标                      | 一句话说法       |
| --------------- | ----------------------------- | ---------------- |
| `@theme-prev/X` | 最大的 `j < i` 且 `Lj` 提供 X | 我下面最近的一层 |

> **⚠️ `@theme-prev` 必须满足 `j < i`**
>
> 「落点严格在导入者下方」不是顺带的性质，而是**整套机制的安全性来源**：每一层只依赖它下面那些层，
> 模块图因此天然无环。
>
> 组件名是**不可信输入**：`@theme-prev/<rest>` 的 `<rest>` 来自用户写的 import，会原样进
> `path.join(layer.owner, <rest>)`。所以它必须是 `/` 分隔的安全片段（不接受 `.` / `..` /
> 绝对路径 / `\` / 空段），被拒绝时告警并交回官方解析。嵌套组件（`@theme-prev/DocItem/Footer`）照常支持。
>
> `?` / `#` 之后的部分**不算组件名，但算改写后的请求**：官方别名对 `@theme/X?raw` 一样生效并把尾部
> 带回解析结果（实测），所以这里用裸名定位文件、把尾部原样拼回落点。切法与上游 `ParseModule` 同口径
> —— 第一个 `?` 或 `#` 起整段是尾部。

### 层栈里没人提供该组件时

交回官方解析。`@theme-prev/*` 是官方不认识的 specifier，所以这里**必定**是 `Module not found`。

不回落官方别名，是因为能用的落点里没有语义对的：`@theme-init` 要「最内层提供者」，
而 `@theme` 是**最外层**全局赢家 —— 正好相反。宁可让人看到官方报错，
也不要安静地给一个语义相反的落点。

## 类型声明

`types/theme-specifiers.d.ts` 给 `@theme/X`、`@theme-original/X`、`@theme-prev/X` 三条 specifier
补类型：它们由本包在 resolve 阶段改写，磁盘上没有对应目录，`tsc` 只看得到 import 那一句。
文件里写清了收录口径与默认导出的形状，这里不抄第二份。

这份文件**不编译**（构建项目的 `include` 只有 `src/`），发布要靠 `files` 点名 —— 本包是
`["dist", "types"]`，只发 `dist` 的包装上站点就拿不到它。

消费方拿到它的写法是把自己 `tsconfig.json` 的 `files` 指过去：

```json
{
  "files": [
    "node_modules/@show-docs/docusaurus-plugin-prev-layer-resolver/types/theme-specifiers.d.ts"
  ]
}
```

本仓库里被三处收到：`tsconfig.demo.json` 与 `tsconfig.test.json` 把自己的 workspace 路径
`plugins/plugin-prev-layer-resolver/types/theme-specifiers.d.ts` 列进 `files`（那两份的 `include`
只收源码，不吃 `.d.ts`），仓库根 `tsconfig.json` 走默认 include（`**/*`），
站点 swizzle（`src/theme/**`）与各主题包里未编译的层和组件都靠它。

官方那两个别名（`@theme/X`、`@theme-original/X`）不是顺手带上的：Docusaurus 的
`@docusaurus/module-type-aliases` 只列了 `@theme-original/*` 与 `@theme-init/*` 两条**无类型**
的通配，`@theme/*` 则是一串写死的组件名；而本仓库的 `node_modules` 布局让 `tsc` 解析不到
`@docusaurus/theme-classic`。所以这三条是一个整体，**不能只删 `@theme-prev` 那一条**。

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

## 会告警的地方

核心意图是**不要静默退化**：危险的往往不是「它会做错」，而是「它什么都不做还不告诉你」。
所以所有静默退化路径都告警（只 `warn`，各报一次，同一构建内不刷屏）。

**先分清两档，别把「告警」读成「放过」** —— 同一句 `warn` 后面接的东西完全不同：

| 档         | 行为                        | 落到构建上的结果                                            | 下面哪些条          |
| ---------- | --------------------------- | ----------------------------------------------------------- | ------------------- |
| **降级**   | 交回官方解析，本次改写不做  | **不一定红**（官方能解析就成功，不能就 `Module not found`） | 1、4、5、6、7、8、9 |
| **硬失败** | 不改写、把 request 交回官方 | **必定红**（官方不认识 `@theme-prev/*`）                    | 1b、2、3、4b        |

所以**看到告警不等于构建会过**：「把 `@theme-prev/*` 写在层外文件里」属硬失败档，
它出现在列表里只是因为告警是让你知道是哪一格。硬失败档的四条都标了「硬失败」。

1. **落点是 `theme-fallback`**（官方链底的 stub 层）：看起来「解析成功」，拿到的却是空 stub。
   1b. **组件名不是安全的相对路径**：交回官方解析并告警。**硬失败**。
   这条**按类别限流**：消息里带用户写的组件名，按消息去重等于「每个坏名各报一次」。
2. **不变量违规**（`targetIndex >= issuerIndex`）：设计上不可能发生（落点恒收在
   `j < i`），一旦发生就是层栈推导错了。**硬失败**。判据取 `>=` 而不是 `==`：落点在导入者
   **上方**与落回自己破坏的是同一条不变量 —— 这也是它在代码里唯一的判据。
3. **导入者不属于任何已知层**（`issuerIndex < 0`）：必定 `Module not found`，**硬失败**。
   三种成因（写在层外文件里 / issuer 是软链路径 / 层栈漏层）表现相同，告警把它们列全。
   这条**按类别限流**：消息里带 issuer 路径，按消息去重等于「同一个问题报 2000 次」。
4. **resolver 没有 `internal-resolve` hook**：`apply()` 启动时自检一次（enhanced-resolve 的
   内部 hook 名，换版本可能改名）。失败即告警并整体禁用改写，把「无声漂移」变成启动时可见。
   4b. **匹配到 `@theme-prev/*` 却拿不到 issuer**：上游不再把 `contextInfo` 挂成
   `request.context` 时的漂移信号，正常构建里不该出现（webpack 的模块解析都带它）。
   告警并交回官方解析。**硬失败**。
5. **改写逻辑抛错 / `doResolve` 返回失败**：告警后交回官方解析，让「解析真的坏了」
   不再和「本来就不该我管」长得一样。
6. **插件构造失败**：**一律告警，但一次构建聚合成一条**（没有判据能区分「本来就没主题」与
   「有主题但构造失败」，漏报的代价是层栈少一层且完全静默 —— 所以一条都不能省；N 个失败
   逐条报就是每次构建刷 N 行，汇总里名单与原因全内联，行数从 N 降到 1）。
7. **Docusaurus 版本低于已验证区间**：读一次 core 版本，低于 `^3.10.0` 时告警（不阻断）。
   高于已验证区间的漂移**不在护栏内**，升级 core 后跑下方「升级 @docusaurus/core 时的检查单」。
8. **组件文件用了官方体系外的扩展名**（`mjs/cjs/mts/cts`）：不算组件（与官方同口径）。
   8b. **组件路径里有点开头的段**（`.hidden/Logo`、`Sub/.Icon.js`）：官方枚举用的 glob 默认
   `dot: false`，两边都看不见它们；我们同样不算组件，否则又是两套可见性。
9. **层栈是空的**：本插件什么都不做的形态，最容易被当成「链不生效」。由问层栈的那个人报
   （`src/index.mts`），解析器不重复报同一件事。

> **⚠️ `theme-fallback` 是 stub 层，不是实现层**
> 它 `提供` 的组件（`Root` / `Layout` / `Error` / `Loading` / `NotFound` …）实际都是 **空 stub**。
> `@theme-prev/X` 落到它时会告警。
> 要某个具体实现时，把 `layersFromPlugins` 推导出的层栈打出来、显式
> import 该主题路径，比依赖任何「跳过 stub」的隐式语义都稳。

> **📌 两个 hook 的选择（换一个就坏）**
> 入口必须 tap `resolve`（裸 specifier 默认走「去 node_modules 里找」那条支路，
> `internal-resolve` 到不了），出口必须 `doResolve` 到 `internal-resolve`（回到 `resolve` 会形成
> 回环，且别名插件会把已是绝对路径的 request 再解析一遍 ⇒ webpack 只拿到
> `(function(){return null;})` 空模块占位）。本框是这条的产地，代码里（`src/resolver.mts` 的 `apply()`）只留指针。

> webpack 5 把 `contextInfo`（含 `issuer`）作为 `resolver.resolve()` 的**首参**传入，上游把它
> 原样挂成 `request.context`（`Resolver.js`：`obj = { context, path, request }`）—— 只有这一种
> 形态。enhanced-resolve 里不存在 `request.contextInfo`；首参给成字符串时上游会把它挪去 `path`、
> `context` 归一成 `{}`，所以顶层 `request.issuer` 同样永远不出现（判据见 `resolveIssuer`）。

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
demo/theme-a/theme                         ← 用户 plugin 主题（按 plugins 顺序）
demo/theme-b/theme
demo/theme-c/theme
src/theme                                  ← 最外层「哨兵」层
```

常量也全部借官方，避免抄第二遍：`THEME_PATH` 直接读 `@docusaurus/utils`，
theme-fallback 的位置以**官方同一基准**推导（core 的 `lib/webpack/aliases` →
`../../client/theme-fallback`，与官方定义同构）；定位不到 core 就说这一层缺失（见「边界与限制」）。

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

## 接入方式

**1. 站点配置里加载插件 —— 不需要任何选项**

```js
// docusaurus.config.mjs
const config = {
  plugins: [
    require.resolve('@show-docs/docusaurus-plugin-prev-layer-resolver'), // = tsc 产物，只放一个实例
    '@show-docs/theme-a', // 下面这些的顺序 = 层栈顺序
    '@show-docs/theme-b',
    '@show-docs/theme-c'
  ]
};

export default config;
```

主题增删 / 调序都不用改上面这一行。把本插件放在其它主题插件之前只是更直观 ——
层栈在初始化阶段推导，与它在 `plugins` 里的位置无关。

**2. 每一层的写法和站点层完全一致，无需感知层级**

```js
// plugins/theme-x/theme/Logo/index.tsx —— 任意多个插件都这么写
import React from 'react';
import PrevLogo from '@theme-prev/Logo'; // = 我下面那一层

export default function MyLogo(props) {
  return (
    <span data-theme-wrapper="theme-x">
      <span className="mark">[X]</span>
      <PrevLogo {...props} />
    </span>
  );
}
```

**3. 站点层 `src/theme` 原有代码不用改**

继续用官方 `@theme-original/X` 即可（它本来就只在最外层安全，语义不变）。
想统一写法也可以用 `@theme-prev/X`（本仓库的 `src/theme/Logo` 就是这么写的）。

## 实测

判据分两档，免 build 的随 `pnpm test` 常规运行（不用等一次真实 build）：

- 没有给 Docusaurus 打补丁、`@theme-original` 未被改写、官方别名全落在层栈内
  → `test/layers.test.mts`（原在 `verify-chain.mts` 里，已迁出）；
- 层栈与官方 `loadThemeAliases` 入参同序、层路径已归一
  → `test/discover.test.mts` 与 `test/layers.test.mts`。

需要真实产物的（两条页面的渲染链）由 `pnpm build && pnpm verify:chain`
（读真实 build 产物）断言，判据清单以脚本输出为准（本文件不抄第二份）：

```
build/index.html               Logo 链：src/theme-logo > theme-c > theme-b > theme-a
                                      > src/theme > theme-a-footer
                               正文里另一条：theme-c > theme-b > theme-a
build/markmap-demo/index.html  只有 Logo 那一条
```

`build/index.html` 就是主页：站点没有单独的首页组件，`docs/intro.md` 以 `slug: /` 落在根。

正文里那第二条走的是 `DocCardList` 这根链（demo 三层主题各包一层，站点没有 swizzle 它，所以链尾
就是 `theme-a`）。它**只出现在主页**：站点里只有 `docs/intro.md` 写了 `<DocCardList />`，别的页面
根本不渲染这个组件 —— 于是文档页那一格判据反过来，断言正文里没有这条链。「同一个组件被三层同时
保留」因此有两根独立的链可看，而不是只有 `Logo` 一例。

四层每层都被保留（`LogoC → LogoB → LogoA → theme-classic` 的真实 Logo）。链尾的
theme-classic 不渲染 `data-*-wrapper` 标记，故在断言里不可见。

> **💡 对照实验**
> 插件主题里用官方的 `@theme-original` 包裹会 💥 **OOM**（`heap out of memory`）；
> 换成 `@theme-prev` 构建成功、4 层链全部保留。而这两行的差别**不是**「改了 `@theme-original`」
> ——`test/layers.test.mts` 会断言它没被改动。

## 使用约束（硬性）

这套机制的语义建立在「导入者属于哪一层」这个**隐式上下文**上，而它不像普通 import 那样显式。
以下约束越界都不报错，但行为会变得难以推理：

### ① `@theme-prev/*` 只能写在主题层的**组件文件**里

`findIssuerLayerIndex` 只做**目录前缀**判定：任何落在某层目录内的文件（包括
`theme-a/shared/util.js`、`theme-a/node_modules/...`）都会被当作「那一层的导入者」。
也就是说，同一个模块被两层的文件 import 时解析结果不同 —— 这不是 bug，是**位置敏感**。

**约束**：把 `@theme-prev/*` 当成「主题层的组件专用 specifier」。
不要写在公共工具模块 / 共享库里（即使它们物理上位于主题目录内），否则一旦它在层间被复用，
解析结果会随导入者变化。

这条约束有**两种越界方式，后果不同**，别把它们混成一格：

| 越界方式                                                                                             | 后果                                                                       | 能否自查                               |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| 文件**物理在层内**，但被层间复用（共享工具模块）                                                     | 解析结果**随导入者变化**（位置敏感），不报错                               | 不能 —— 得靠约定                       |
| 文件**不在任何层内**（站点 `pages` / `components`、自定义插件的运行时模块、`docusaurus.config.mjs`） | 一律 `issuerIndex = -1` → 交回官方 → **必定 `Module not found`，构建失败** | 能 —— 告警会把这一格列为「最常见成因」 |

第二种是**硬失败**（不是「位置敏感」）。实测：同一个 `import '@theme-prev/Logo'`，
写在层内文件里构建成功、写在层外文件里直接 `Module not found`（真实 webpack 5.111.1）。
「站点自己的另一个消费方」这一格正是第二种 —— 站点目录里只有 `src/theme` 是层，
站点自己的页面与组件目录（若存在）都不是。

### ② 主题插件模块顶层不得创建**身份敏感**的全局对象

`loadPluginConfigs` 用官方 `loadFreshModule` 加载插件模块（每次新建 jiti 工厂 +
`requireCache: false`），所以 ESM 主题插件模块会被加载**两次**（官方一次、我们一次）；
实测 ESM 顶层求值 2 次、CJS 1 次，两者构造函数各跑 2 遍（`test/discover.test.mts` 钉住）。

所以约束不是「构造函数无副作用」，而是「**整个模块加载期无副作用**」：
顶层不得创建「跨实例身份敏感」的对象（React Context、自定义 `Symbol`、全局注册表单例）。
我们只取 `getThemePath()`、不碰它的 Context，正常主题不受影响。

### ③ 层归属是「**真实路径**」意义上的

`findIssuerLayerIndex` 把 issuer 与每个 layer owner 都 `realpath` 一次再比前缀，所以
「同一目录的两种写法」不会因为 `..` / 软链被算成两层。代价是一条反直觉的边界：

> **物理上位于主题目录内、但真实路径在层外的文件，不属于该主题层。**
> （`theme-a/logo-link -> /elsewhere/Logo.tsx` ⇒ `issuerIndex = -1` ⇒ 退回官方解析 + 告警。）

需要这种结构时，别把主题文件软链到层外（只按字符串比较会让同一目录被算成两层，
那是**静默的错层**，比显式的「不在层内」更难查）。

## 边界与限制

面向使用者的事实（机制为什么这样设计见下方「设计取舍」）：

- **`@theme-original` 语义零改动**：仍等于 `@theme/X`（全局赢家），内置组件 / 既有 swizzle 不受影响。
- **只在「导入者属于某个已知主题层」时生效**；最内层、以及不在任何主题层内的导入者保持官方行为。
- **链底必须有实现**：`theme-a` 能包裹是因为 preset 的 `theme-classic` 提供了 `Logo`；
  某组件在所有主题里都没实现时，最内层包裹者无东西可包（回落官方别名 → 真实的 Module not found）。
- **无需配置清单、无需补丁**：层栈顺序 = `plugins` 数组顺序，插件自己读取。
- **`NODE_ENV` 相关的层栈漂移**：`docusaurus start` 下 `plugin-debug` 会进层栈（见上文）；
  `verify:chain` 强制 `production` 语义，因此它的绿灯**不代表** `docusaurus start` 的行为。
- **每个 specifier 只按「层 + 组件」决定**：不依赖 React 运行时状态，因此 SSR / 客户端行为一致。
- **与 `pnpm swizzle` 共存**：wrap 只在站点层 `src/theme` 生成 `@theme-original/X` 包裹文件，
  不产生 `@theme-prev/*`；站点层改用 `@theme-prev/X` 则能拿到「最后一层插件主题」。
- **会告警**：主题插件构造失败、组件名不是安全路径、层栈不变量违规、落点是 `theme-fallback`、
  导入者不属于任何已知层、resolver 缺 `internal-resolve` hook、`apply()` 抛错 / `doResolve` 失败。

  **告警 ≠ 放过**：哪些告警后面是硬失败、哪些是降级，只看上方「会告警的地方」一节的两档表
  —— 别处不复述那张表。

## 升级 `@docusaurus/core` 时的检查单

本插件踩在六处**没有稳定性承诺**的内部契约上。`peerDependencies` 与版本护栏都只拦
「低于 `^3.10`」—— **高于已验证区间的漂移同样只会 warn、不会拦**，所以升级后必须跑
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

## 实现结构

实现按「纯函数 / 副作用」切开：能穷举的解析逻辑在无副作用的函数里（`src/resolve.mts` /
`src/layers.mts` / `src/resolver.mts` 的目标选择），副作用留在接线处（`src/index.mts` 推层栈、
`src/plugins.mts` 读插件列表、`src/resolver.mts` 的 `apply()`）。各文件职责见上方「组成」，
各目录职责与「放错地方会怎样」见仓库根 README 的「目录结构」。

> 源码是 ESM 的 `.mts`，相对 import 写**源码名**（`./layers.mts`），产出时才变成 `./layers.mjs`；
> 这条口径与差量清单记在仓库根 README 的「构建包的编译口径」，这里不抄第二份。`tsc` 把改写后的
> import 搬进包内 `dist/`，那份 `dist/index.mjs` 就是包出口 —— 站点按包名拿到的就是它，
> 所以改完源码要 `pnpm build:core`。

## 设计取舍（明确不做什么）

| 取舍                                                                        | 原因                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **层栈从 plugin 列表推导，而不是只读别名表**                                | 别名表每个组件只有 3 个落点，3 层以上覆盖会丢中间层                                                                                                                                                                                                                                                                                                                                                                                                  |
| **不改 Docusaurus 任何文件**                                                | 只复用官方已导出的 `loadContext` / `loadPluginConfigs`，不与版本强绑定                                                                                                                                                                                                                                                                                                                                                                               |
| **解析失败一律交回官方**                                                    | 最坏情况退化为官方语义（真实报错），而不是静默产出错误产物                                                                                                                                                                                                                                                                                                                                                                                           |
| **不试图让插件主题「感知自己是不是栈顶」**                                  | 那需要跨层运行时状态，反而引入不可判定行为                                                                                                                                                                                                                                                                                                                                                                                                           |
| **`@theme-prev` 恒满足 `j < i`**                                            | 「落点严格在导入者下方」是模块图无环（不会 OOM）的来源，整个机制只有这一个 specifier，没有例外形态                                                                                                                                                                                                                                                                                                                                                   |
| **组件名必须通过安全校验**                                                  | 它是从 specifier 拼出来的不可信输入，直接进 `path.join` 会让「层」的隔离被一段相对路径绕过；校验是纯输入检查，对合法输入零成本                                                                                                                                                                                                                                                                                                                       |
| **插件构造失败一律告警（一次构建聚合成一条）**                              | 没有任何判据能可靠区分主题 / 非主题（入口都读得到、`getThemePath` 在压缩产物里会变短名）；漏报（层栈少一层且完全静默）比误报（多一行日志）严重得多                                                                                                                                                                                                                                                                                                   |
| **不为「没人走的路径」留机制**                                              | 没有真实触发场景的开关 / 兜底 / 自证装置，成本是永久的，收益是零；发现它就该**删掉**，而不是补算术让它成立                                                                                                                                                                                                                                                                                                                                           |
| **不为「只有测试在接的出口」留出口**                                        | 判据是「外面真的在用」。跨模块真在用的一个不动；只在本文件用的收成内部函数；只被测试用的**删掉**，测试改走真实路径（真实 `loadContext` / `layersFromPlugins` / 行为断言）。对外形状与「实际谁在用」对不上，文档和测试就会跟着这个形状一直把人往回带                                                                                                                                                                                                  |
| **同一件事只有一个产地**                                                    | `resolveCoreModule` 是 core 内部文件定位的唯一入口（`resolveFallbackDir` 的锚点判据也走它）；层栈推导在**一个循环里**既解析 `getThemePath()` 又入栈                                                                                                                                                                                                                                                                                                  |
| **内部状态不为「可读」而对外开洞**                                          | `realpathCache` 整体 private：外面要的只是「带上限的 `normalizeLayerPath`」这一个动作（`realpathOf`），不是那个 Map                                                                                                                                                                                                                                                                                                                                  |
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

## 语言与编译约定

核心包用 TypeScript 编写（`.mts`，ESM，源码在 `src/`），由 `tsc` 编译到本包的 `dist/`
（`.mjs` + `.d.mts`），那份产物就是包出口。改动后记得 `pnpm build:core`
（`pnpm build` / `pnpm test` 已内置）。

`@theme-prev/*` 是运行时动态别名，类型声明见本包的
[`types/theme-specifiers.d.ts`](./types/theme-specifiers.d.ts)（连同官方那两个别名一起，理由在
上面的「类型声明」）；删掉那份文件，`pnpm typecheck` 与 `pnpm lint:type` 都会红。
