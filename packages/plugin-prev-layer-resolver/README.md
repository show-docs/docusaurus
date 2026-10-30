# @show-docs/docusaurus-plugin-prev-layer-resolver

让多个主题层层包裹同一个组件成立，且 `@theme-original` 的官方语义零改动。插件在 webpack
resolve 阶段按「导入者属于哪一层」改写 `@theme-prev/X`；层栈由站点 `plugins` 自动推导，不需要
配置清单，也不需要给 Docusaurus 打补丁。

## 安装

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver
```

需要 Docusaurus `^3.9.2` 与 Node `^24`。

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver', // 一个实例即可
    '@show-docs/theme-a',
    '@show-docs/theme-b',
    '@show-docs/theme-c'
  ]
};
```

- 主题在 `plugins` 里的先后就是层栈顺序：越靠前越靠内。
- 本插件放在数组的哪一格不影响层栈推导，放在主题之前只是为了读起来直观。
- 主题增删、调序只改这个数组，没有单独的清单要维护。

### 在主题层里包住下一层

```js
// plugins/theme-x/theme/Logo/index.tsx —— 任意多个插件都这么写
import PrevLogo from '@theme-prev/Logo'; // = 我下面最近的一层

import React from 'react';

export default function MyLogo(props) {
  return (
    <span data-theme-wrapper="theme-x">
      <span className="mark">[X]</span>
      <PrevLogo {...props} />
    </span>
  );
}
```

每一层的写法与站点层完全一致，不需要知道自己在层栈里的位置。

### 站点层

`src/theme` 里原有代码不用改，继续用官方 `@theme-original/X` 即可（它本来就只在最外层安全，
语义不变）。想统一写法也可以用 `@theme-prev/X`（本仓库的 `src/theme/DocCardList` 就是这么写的）。

## 配置

本包没有插件选项。需要调整的只有 `plugins` 里主题的先后。

## 工作方式

官方 `@theme-original/X` 是**每个组件一个全局值**，只能等于层栈里的某一层；本包不碰它，另开一个
specifier，在 webpack resolve 阶段按「导入者属于哪一层」逐次改写。层栈（哪些层、什么顺序）
**全部自动推导**。

设层栈（内 → 外）为 `L0..Ln`，导入者在 `Li`：

| specifier       | 解析目标                      | 一句话说法       |
| --------------- | ----------------------------- | ---------------- |
| `@theme-prev/X` | 最大的 `j < i` 且 `Lj` 提供 X | 我下面最近的一层 |

`X` 是 `/` 分隔的组件名，嵌套组件（`@theme-prev/DocItem/Footer`）照常支持；`?raw` / `#…` 这类
尾部原样保留。组件名必须是安全的相对路径（不接受 `.` / `..` / 绝对路径 / `\` / 空段），越界时
告警并交回官方解析 —— 校验口径见 [`docs/internals.md`](./docs/internals.md) 的「输入处理」一节。

**没有第二层覆盖的组件别走链**：仓库里只有一个层提供 X 时，那个层用官方别名
`@theme-init/X`（最初那一份）就够 —— 它解析到的就是同一个文件，还少一次按导入者算落点；
有两个以上提供者才用 `@theme-prev/X`（用 `@theme-init` 会跳过下面那几层）。判据与例外写在
仓库根 `README.md` 的「基础设施包」一节，`test/specifier-usage.test.mts` 读磁盘钉着。

### 层栈里没人提供该组件时

交回官方解析。`@theme-prev/*` 是官方不认识的 specifier，所以这里**必定**是 `Module not found`。
不回落官方别名：能用的落点里没有语义对的（理由见
[`docs/internals.md`](./docs/internals.md) 的「设计取舍」一节），宁可让人看到官方报错。

## 编译 `@show-docs` 家族未编译的 TS 源码

Docusaurus 官方那条 babel 规则把整个 `node_modules` 排除在外（只给 `docusaurus*.js[x]` 开例外）。
`@show-docs` 家族的主题层与组件是**未编译的 `.tsx` / `.jsx`**，随包发布 —— 从 npm 装进真项目时，
官方那条规则不编它们，于是报 `Module parse failed`。

这一格由本插件认领：`configureWebpack` 里用官方 `utils.getJSLoader()` 补一条 `.tsx?` 规则，
`include` 只收 `node_modules/@show-docs/` 底下的文件。

- **工作区里不认领**：pnpm 的软链把源码解析到 `node_modules` 之外，官方那条本来就在编；
  再命中一次就是同一份文件跑两遍 babel。
- **别家的 scope 不认领**：这一族只发在 `@show-docs` 下。
- **`.d.ts` 不认领**：声明文件没有运行期内容。

这一格以前是**每个主题包各补一条**（同一个判据抄了七处，改一处忘另两处就是漂移），收在
本插件一处之后各主题包不再自己补 —— 判据与实测见
[`src/source-js-rule.mts`](./src/source-js-rule.mts) 与
[`docs/internals.md`](./docs/internals.md) 的「谁来编未编译的 TS 源码」一节。

**它与层栈无关**：层栈空了这条规则照样在（那只是 `@theme-prev/*` 失效）。

## 各主题层那条「本插件注册了没有」的检查

缺本插件时，正常路径上要到打包那一步才报 `Module not found: @theme-prev/X` —— 报错点离真正的
原因隔着一整个构建。所以每条主题层都在自己的 `loadContent()` 里先查一遍、缺了当场点名。

那条判据（含「`plugins` / `themes` 里那一项是不是某个包」怎么认，四种原始写法：裸包名、
`[包名, 选项]`、`[路径, 选项]`、`{name}` 对象；路径按**包目录**认，不钉具体入口文件名）住在
本包的 `src/plugin-slots.mts`，由包出口 `./plugin-slots` 发出去：

```js
import { assertPrevLayerResolverInstalled } from '@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots';

// 主题层入口返回的那一份
export default function myTheme(context, options) {
  return {
    name: 'my-theme',
    loadContent() {
      assertPrevLayerResolverInstalled('my-theme', {
        plugins: context.siteConfig.plugins,
        themes: context.siteConfig.themes
      });
    }
  };
}
```

它只查本插件，不查别家：报错文案里点名的是**调用方**的包名，站点据此知道该回去看哪一层的文档。
这一份是纯函数，各层配置期那句「前置插件在不在」读的就是同一判据，
理由与内部契约见 [`docs/internals.md`](./docs/internals.md) 的「认层」一节。

## 类型声明

`types/theme-specifiers.d.ts` 给 `@theme/X`、`@theme-original/X`、`@theme-init/X`、
`@theme-prev/X` 四条 specifier 补类型：磁盘上都没有对应目录，`tsc` 只看得到 import 那一句。
文件里写清了收录口径与默认导出的形状，这里不抄第二份。四条为什么收成一体，见
[`docs/internals.md`](./docs/internals.md) 的「类型声明」。

消费方在 `tsconfig.json` 的 `files` 里点名它：

```json
{
  "files": [
    "node_modules/@show-docs/docusaurus-plugin-prev-layer-resolver/types/theme-specifiers.d.ts"
  ]
}
```

本仓库里 `tsconfig.tools.json` 与 `tsconfig.test.json` 按 workspace 路径列它；仓库根
`tsconfig.json` 走默认 include（`**/*`），站点 swizzle（`src/theme/**`）与各主题包里未编译的
层和组件都靠它。

## 告警

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
7. **Docusaurus 版本低于已验证区间**：读一次 core 版本，低于 `^3.9.2` 时告警（不阻断）。
   高于已验证区间的漂移**不在护栏内**，升级 core 后按 `docs/internals.md`「升级 `@docusaurus/core` 时的检查单」逐项跑一遍。
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

## 使用约束

这套机制的语义建立在「导入者属于哪一层」这个**隐式上下文**上，而它不像普通 import 那样显式。
以下约束越界都不报错，但行为会变得难以推理。层归属的具体判法见
[`docs/internals.md`](./docs/internals.md) 的「层归属怎么判」一节。

### ① `@theme-prev/*` 只能写在主题层的**组件文件**里

**约束**：把 `@theme-prev/*` 当成「主题层的组件专用 specifier」。
不要写在公共工具模块 / 共享库里（即使它们物理上位于主题目录内），否则一旦它在层间被复用，
解析结果会随导入者变化。

这条约束有**两种越界方式，后果不同**，别把它们混成一格：

| 越界方式                                                                                             | 后果                                                                       | 能否自查                               |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| 文件**物理在层内**，但被层间复用（共享工具模块）                                                     | 解析结果**随导入者变化**（位置敏感），不报错                               | 不能 —— 得靠约定                       |
| 文件**不在任何层内**（站点 `pages` / `components`、自定义插件的运行时模块、`docusaurus.config.mjs`） | 一律 `issuerIndex = -1` → 交回官方 → **必定 `Module not found`，构建失败** | 能 —— 告警会把这一格列为「最常见成因」 |

第二种是**硬失败**（不是「位置敏感」）。「站点自己的另一个消费方」这一格正是第二种 —— 站点目录
里只有 `src/theme` 是层，站点自己的页面与组件目录（若存在）都不是。

### ② 主题插件模块顶层不得创建**身份敏感**的全局对象

**约束**不是「构造函数无副作用」，而是「**整个模块加载期无副作用**」：
顶层不得创建「跨实例身份敏感」的对象（React Context、自定义 `Symbol`、全局注册表单例）。
我们只取 `getThemePath()`、不碰它的 Context，正常主题不受影响。

### ③ 层归属是「**真实路径**」意义上的

> **物理上位于主题目录内、但真实路径在层外的文件，不属于该主题层。**
> （`theme-a/logo-link -> /elsewhere/Logo.tsx` ⇒ `issuerIndex = -1` ⇒ 退回官方解析 + 告警。）

需要这种结构时，别把主题文件软链到层外。

## 已知限制

面向使用者的事实（机制为什么这样设计见 `docs/internals.md`「设计取舍」）：

- **`@theme-original` 语义零改动**：仍等于 `@theme/X`（全局赢家），内置组件 / 既有 swizzle 不受影响。
- **只在「导入者属于某个已知主题层」时生效**；最内层、以及不在任何主题层内的导入者保持官方行为。
- **链底必须有实现**：`theme-a` 能包裹是因为 preset 的 `theme-classic` 提供了 `DocCardList`；
  某组件在所有主题里都没实现时，最内层包裹者无东西可包（回落官方别名 → 真实的 Module not found）。
- **无需配置清单、无需补丁**：层栈顺序 = `plugins` 数组顺序，插件自己读取。
- **`NODE_ENV` 相关的层栈漂移**：`docusaurus start` 下 `plugin-debug` 会进层栈（成因与两种环境的层栈对照见 `docs/internals.md`）；
  `verify:chain` 强制 `production` 语义，因此它的绿灯**不代表** `docusaurus start` 的行为。
- **每个 specifier 只按「层 + 组件」决定**：不依赖 React 运行时状态，因此 SSR / 客户端行为一致。
- **与 `pnpm swizzle` 共存**：wrap 只在站点层 `src/theme` 生成 `@theme-original/X` 包裹文件，
  不产生 `@theme-prev/*`；站点层改用 `@theme-prev/X` 则能拿到「最后一层插件主题」。
- **会告警**：主题插件构造失败、组件名不是安全路径、层栈不变量违规、落点是 `theme-fallback`、
  导入者不属于任何已知层、resolver 缺 `internal-resolve` hook、`apply()` 抛错 / `doResolve` 失败。

  **告警 ≠ 放过**：哪些告警后面是硬失败、哪些是降级，只看上方「告警」一节的两档表
  —— 别处不复述那张表。

## 相关文档

- [维护者文档](./docs/internals.md)：机制为什么这样设计、输入怎么校验、层归属怎么判、内部契约与实测记录。
- 本包是基础设施链最下面的一格：上面依次是 `theme-component-page` 与 `theme-iframe`。
  三格的规矩写在仓库根 `README.md` 的「基础设施包」一节。
- `仓库根 README`：本包在仓库里的位置、构建口径与目录结构。
