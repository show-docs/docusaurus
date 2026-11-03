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
[维护者文档](./docs/internals.md) 的「基础设施链的规矩」一节，`test/specifier-usage.test.mts` 读磁盘钉着。

### 层栈里没人提供该组件时

交回官方解析。`@theme-prev/*` 是官方不认识的 specifier，所以这里**必定**是 `Module not found`。
不回落官方别名：能用的落点里没有语义对的（理由见
[`docs/internals.md`](./docs/internals.md) 的「设计取舍」一节），宁可让人看到官方报错。

## 与那条「编译这一族未编译 TS 源码」的规则的分工

本插件只往 `resolve.plugins` 里放 resolver，**不碰 `module.rules`**。编译 `@show-docs` 家族那些
随包发布的 `.ts` / `.tsx` 是另一格，归
[`@show-docs/docusaurus-plugin-compile-source`](../plugin-compile-source/README.md)：
判据、认领范围、`babelOptions` 为什么必须与官方同源都写在那边，这里不抄第二遍。

两格互不依赖：层栈空了那条规则照样在（那只是 `@theme-prev/*` 失效）；摘掉那条规则，本插件照旧
解析得动，坏的是那些 `.tsx` 进了 bundle 报 `Module parse failed`。

## 「本插件注册了没有」那一条判据（只有真写 `@theme-prev/*` 的层用得上）

缺本插件时，正常路径上要到打包那一步才报 `Module not found: @theme-prev/X` —— 报错点离真正的
原因隔着一整个构建。所以**层里真写 `@theme-prev`** 的那一层在自己的 `loadContent()` 里先查一遍、
缺了当场点名。只用官方别名的层不查这一条：`@theme/X`、`@theme-init/X`、`@theme-original/X` 是
core 自己挂的 webpack alias，本插件在不在都解得开。本仓发出去的那十几个包都属于后者，真写
`@theme-prev` 的只有站点的 `src/theme` 与 `tools/theme-*` 那几层（哪一层写哪一把，
`test/specifier-usage.test.mts` 在磁盘上判）。

判据分两份：**怎么认那两份清单**（四种原始写法：裸包名、`[包名, 选项]`、`[路径, 选项]`、`{name}`
对象；路径按**包目录**认，不钉具体入口文件名）是纯函数，住在 `src/plugin-slots.mts`；
**去哪几处找那份清单**住在 `src/registered-plugins.mts` —— 站点还可以把插件写在 `presets:` 里，
那一份要官方合并（`loadPresets`）之后才看得见，`LoadContext` 上没有合并后的清单可读。只看
`siteConfig.plugins` / `themes` 会把一个装齐了的站点判死，让它去 `pnpm add` 一个已经装着的包。

所以那一句是异步的，调它的层 `loadContent()` 要把它交回官方等。本包只交判据，不代写报错文案 ——
要查的那一层自己点名自己，报错里带上「谁需要本包」，站点才知道该回去看哪一层的文档：

```js
import { pluginIsRegistered } from '@show-docs/docusaurus-plugin-prev-layer-resolver/registered-plugins';

// 主题层入口返回的那一份
export default function myTheme(context, options) {
  return {
    name: 'my-theme',
    async loadContent() {
      const installed = await pluginIsRegistered(
        context,
        '@show-docs/docusaurus-plugin-prev-layer-resolver'
      );
      if (!installed) {
        throw new Error(
          'my-theme 需要 @show-docs/docusaurus-plugin-prev-layer-resolver：`@theme-prev/*` 由它提供别名，请先装上并加进 `plugins`。'
        );
      }
    }
  };
}
```

那条判据查的是**任一**包名，不只本包。本仓真调它的只有一处：`themes/theme-git-badge` 用同
一份文件里那条「数几份」的判据查自己那一格（`assertSinglePluginInstance`）。要查解析器注册了
没有的那一层照上面的写法自己查。
判错的两侧不对称 —— 误报判死一个本来能成的构建，漏报只是把构建期注定会炸的那一步留到构建期，
所以「问不到官方那一份」（core 结构变了、配置文件读不了、preset 函数自己抛）一律放行。
`./plugin-slots` 那条纯函数出口仍然单独发了给只读清单的读者用，理由与内部契约见
[`docs/internals.md`](./docs/internals.md) 的「认层」一节。

这两条子路径、加上 `.` 那条的 `types`，发的是 `src/` 里那份未编译的 `.mts`：读它们的时刻在配置期，
早于任何人跑 `build`，而 Node 24 默认剥类型（本包 `engines.node` 因此写的是 `^24.0.0`）。走通这一步的是
官方加载插件入口与配置那份 jiti（`@docusaurus/utils/lib/moduleUtils.js` 的 `loadFreshModule`）—— 站点自己
拿 plain `import()` 去引一把子路径不在这条承诺里：文件真落在 `node_modules` 里时，Node 有
`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` 这一格限制。`.` 那条的 `default` 仍是 `dist/index.mjs` ——
站点把本包注册成插件时拿到的还是产物，改完源码照旧要 `pnpm build:core`。口径与代价记在
[维护者文档](./docs/internals.md) 的「配置期跨包的出口」一节。

## 「这一层只能有一份实例」那条检查（同一个出口）

官方只拦「同一个插件挂两次又不给 id」（`Plugin IDs must be unique`），给了不同 id 的两份在它那里
合法 —— 但合法不等于有用。吃不下第二份实例的那几层，症状都要等构建跑完才看得见，而且都不指向真正
的原因（徽标那层第二份被「只包一次」的护栏原样交回，等于什么都没干；机制层那一份各写一遍同一份
产物，谁说了算只看插件顺序）。所以同一份文件里还发这两个：

```js
import { assertSinglePluginInstance } from '@show-docs/docusaurus-plugin-prev-layer-resolver/registered-plugins';

// 主题层入口返回的那一份
export default function myTheme(context, options) {
  return {
    name: 'my-theme',
    async loadContent() {
      await assertSinglePluginInstance(
        context,
        'my-theme',
        '为什么这一层吃不下第二份实例'
      );
    }
  };
}
```

数的是**包名**而不是实例 id，读法与上面那条同一套两档（原始清单 + preset），误差也同一档：
只可能少判，不可能多判 —— 原始清单数到了就不翻案，问不到官方那一份时按原始清单那份交回。
想要份数本身（不给判据、只做诊断）用同一份文件发出来的 `pluginInstanceCount()`。
「为什么两份不行」归调用方自己在 `why` 里说，这里只负责数出来并给一句能照着改的话；一份都没有
也不点名（那是「装没装」那道题，不是这道）。

**两条都判到「注册」为止**：清单上有那个名字就算，官方允许插件构造函数返回 `null` 自行禁用，那种
包在清单上照样看得见，但它的 `loadContent()` 不会跑 —— 读得到真实例的唯一一处是 `allContent`，而它
不在 `LoadContext` 上，本包这一跳读不到。本仓库每一个包的入口都不返回 `null`，所以这条今天不影响
本站；三处判据（层栈 / 注册 / `allContent`）的分工记在
[`theme-component-page` 的维护者文档](../theme-component-page/docs/internals.md)里。

## 类型声明

`types/theme-specifiers.d.ts` 给 `@theme/X`、`@theme-original/X`、`@theme-init/X`、
`@theme-prev/X` 四条 specifier 补类型：磁盘上都没有对应目录，`tsc` 只看得到 import 那一句。
文件里写清了收录口径与默认导出的形状，这里不抄第二份。四条为什么收成一体，见
[`docs/internals.md`](./docs/internals.md) 的「类型声明」。

那一份 `.d.ts` 里 `import('react').FunctionComponent` 用到了 react 的类型，所以 `react` 按
**optional peer** 声明：只有真去用这四条 specifier（也就是在 JSX 站点里）的消费者需要它，
纯配置期用本包的站点不会因此多一个装包要求。

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
4. **resolver 没有 `internal-resolve` hook**：`apply()` 启动时向 resolver **要**这个 hook
   （enhanced-resolve 的 `getHook` 在 hook 不存在时抛；同名的 `ensureHook` 会自己造一个，
   拿它自检永远不会红 —— 所以自检只能用 `getHook`）。失败即告警并整体禁用改写，
   把「无声漂移」变成启动时可见。
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
  拿不到 `theme-fallback` 目录（链底那一层缺席）、
  导入者不属于任何已知层、resolver 缺 `internal-resolve` hook、`apply()` 抛错 / `doResolve` 失败。

  **告警 ≠ 放过**：哪些告警后面是硬失败、哪些是降级，只看上方「告警」一节的两档表
  —— 别处不复述那张表。

## 相关文档

- [维护者文档](./docs/internals.md)：机制为什么这样设计、输入怎么校验、层归属怎么判、内部契约与实测记录。
- 本包是基础设施链最下面的一格：上面依次是 `plugin-compile-source`、`theme-component-page`
  与 `theme-iframe`。四格的规矩写在[维护者文档](./docs/internals.md) 的「基础设施链的规矩」一节。
- `仓库根 README`：本包在仓库里的位置、分包清单与目录结构。
