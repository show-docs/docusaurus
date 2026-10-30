# 改造方案 v2：用 `allContent` 自注册

> 这份写的是**这一版打算改成什么样**。它已经按「迁移步骤」一节落地：现状（选项、
> `loadContent()` 交回 `componentPages` 的约定、生命周期）看 [README](../README.md) 与
> [internals](./internals.md)；两边对不上时，以代码与那两份为准，这份是提案。

## 目标

这版按五条判，缺一条就不算完成：

1. **普通 theme 只交「组件 + 规则」**。装一个包 = 一个依赖 + 一个规则模块 + 入口里三行
   `loadContent` 把规则交回；不实现本包定义的方法、不引本包的运行时、不碰站点配置。
   **一个包可以自注册多个组件、多组规则**：交回的是一列条目，每条各带自己的键、判法、组件与
   静态入参，站点可以逐键开关；交几组、文件怎么拆都由包自己定。
2. **组件不必是 DocItem**。规则指向 `@theme/任意组件` 即可；组件只认「这一页的那几份数据」，
   与 `DocItem` 没有形状关系。
3. **规则命中 ⇒ 本包替换 DocItem**。这是结构保证：站点不改 docs 插件选项、不改路由。
4. **尽量复用 Docusaurus 3 的平台能力**。逐条点名复用哪一块；做不到的那一块说清为什么。
5. **允许大改**。删掉 `getComponentPages()` 这一套约定，一次迁移到位。

现状要还掉的三条、这一版换来的收益、新增的边界、两版都不变的那一条，统一记在「代价」一节。

## 平台能力对账

| 需求                       | Docusaurus 3 的那一块                                                                  | 本方案怎么用                                                                                                                     | 为什么不直接用                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页换成别的组件           | docs 插件 `docItemComponent`（默认 `@theme/DocItem`，写进每条 doc 路由的 `component`） | 站点 doc 路由继续指向 `@theme/DocItem`；本包作为最外层 theme 层接管这个别名，命中即换                                            | 它是**每个 docs 插件实例一个值**；3.10.2 没有「按 frontmatter 逐页选组件」的选项，`frontMatter.js` 也不处理组件字段。要补的正是这一段                                       |
| 各包的规则汇到一起         | `loadContent` → `allContent` → `allContentLoaded`                                      | 贡献方在自己的 `loadContent` 里交回一列规则；本包在 `allContentLoaded` 读 `allContent`                                           | 没有更早的汇聚点：`loadContent` 与 `contentLoaded` 都是跨插件并行，`allContentLoaded` 是唯一的屏障                                                                          |
| 组件可被站点覆写           | `@theme/X` 别名 + swizzle                                                              | 规则里只写 `@theme/X` 字符串，站点在 `src/theme/X` 放一份就赢                                                                    | —                                                                                                                                                                           |
| 配置期生成浏览器可读的模块 | `@generated` 别名 + `generatedFilesDir`                                                | 注册表写到 `<generatedFilesDir>/theme-component-page/registry.ts`，与 Docusaurus 自己 `createData` 同一片目录、同一条 babel 规则 | `actions.createData` 绑在 `contentLoaded` 的 `actions` 上，并按 `<pluginName>/<pluginId>/<name>` 落盘；本包要一个固定路径、一个站点类型声明对得上的名字，自己写同一目录即可 |

一句话：平台给的是「一个插件实例一个 DocItem」，本包补的是「一份清单逐页判」；规则怎么从各包
汇过来、配置期怎么铺出浏览器读得到的模块，都落在官方已有的机制上。

## 新架构

### 三方分工

**普通 theme**（以 markmap 为例）

- 组件：`theme/MarkmapPage/index.tsx`，普通主题组件，不引本包任何运行时。
- 规则：`src/component-pages.mts`，交回 `readonly ComponentPageDeclaration[]`；组数不限，
  文件怎么拆由包自己定（见「一个包交多组规则」）。
- 入口：`loadContent()` 返回 `{ componentPages: 那一列 }`，三行。
- 类型上 peer 依赖本包（只 `import type` 取契约）；不注册本包、不实现本包的方法。

**theme-component-page**：唯一读规则、合并、生成注册表、在 `DocItem` 里判定的一层。

**站点**：`pages` 一列（最高优先级）、`component: false`（关掉某包交的键）、`src/theme/X`（换组件）。

### 规则交回的形状

```ts
/** 贡献方从 `loadContent` 交回的那一格；键名就是约定。 */
export type ComponentPageContent = {
  componentPages: readonly ComponentPageDeclaration[];
};
```

- **只有数据，没有回调**：规则在配置期求值，组件在浏览器期存在，两侧只靠 `@theme/X` 字符串相连。
- **只有这一格**：本包不看贡献方 content 的别的键；没有 `componentPages` = 这个插件不交。
- **贡献方自己的提示自己打**：清单拼错、列了没装的层这类话说一次就够，由算规则的那一方在
  `loadContent` 里打（iframe 今天就是这么做的），本包不代打。
- **类型放哪**：`ComponentPageContent` 加进 [lib/component-page.ts](../lib/component-page.ts)
  （它已经是「两侧共用的那几份类型」的家），贡献方用 `import type` 取，不留运行时依赖。

**为什么借 `content`**：它是官方给「一个插件要交给别家看的东西」留的格子，`allContentLoaded`
就是为这一跨插件依赖设计的。规则是纯数据，正好放得进去；组件名仍以 `@theme/X` 字符串相连，
不跨这两侧传引用。

### 一个包交多组规则

规则交回的是一列条目，不是一条。一个包因此可以同时挂多个组件：

```ts
// theme-foo/src/component-pages.mts
import { fooErrorPageRules } from './rules/foo-error-page.mts';
import { fooPageRules } from './rules/foo-page.mts';

export const FOO_COMPONENT_PAGES = [...fooPageRules, ...fooErrorPageRules];
```

- **每组自带判定**：`key` / `match` / `props` / `component` 都在条目上，互不牵连；
  数组顺序 = 命中优先级（一页同时写中两把键时排前面那条赢）。
- **站点逐键可控**：站点列写 `component: false` 只关那一把，不牵连同包其他键；
  写同键覆写也只动那一把。
- **同一包内撞键同样红**：与跨包撞键共用同一条判据（`normalizePages` 的 `seen`）；
  「同源」不是豁免理由，一个包里两条写同一把键仍按重复报。
- **拆分放在模块内**：`import` 多少份文件都行，对外仍是一列。交几组没有第二种语义，
  不需要「发现点」这种概念。

### 发现：读 `allContent`

1. 贡献方在 `loadContent` 里交回 `{ componentPages }`。
2. 本包在 `allContentLoaded({ allContent })` 里遍历。`allContent` 的形状是
   「插件名 → id → 那个插件的 content」，只看每个 content 里有没有 `componentPages`；
   插件名就是报错与提示里的「谁交的」。
3. 没有这一格就跳过；有但写歪了，红，报出插件名。
4. 交回的那一列走与站点列同一个校验（`normalizePages`，同一包内撞键走同一条 `seen`）。
5. 与站点列合并（规则不变，见下节）。

顺序：跨包撞键本来就红，所以 `allContent` 的键序只决定提示与报错先后，不决定谁赢。
同一个包装了两次（不同 `id`）就是两份 content，撞键照样红。

**为什么覆盖得住 preset / 相对路径 / 内联**：这一条问的不是「包叫什么」，而是「这个插件实例
被装载了吗」。preset 展开出来的插件、相对路径入口、配置里直接写的函数，都会走到这一步。

这条通道有两条边界，在这里一次说清：

- **只有被装载的插件能交**。装在依赖里、没注册进 `plugins` / `themes` 的包不会出现；
  旧方案里 `contributors` 能点名「装了但没注册」的包，这一版没有对应物。
- **不再限于主题**。v1 只问有 `getThemePath()` 的实例；现在任何插件的 content 都看。
  面宽了，兜底只剩撞键红与站点 `component: false`。

### 合并与判定：不变的部分

- 站点列的条目排在最前；同一把键站点覆写会留一条提示。
- 站点写 `component: false` 关掉某包交的键。
- 两个包交同一把键：直接红；同一个包内撞键走同一条判据，不因「同源」放过。
- 命中的判定（`boolean` / `value` / `options`）、入参组装次序、开发期落空告警：一字不改。
  （`any` 是迁 `theme-diff` 时补的第四种判法，见 README 的判法表。）

也就是说，这一版换的是**条目从哪来**，不是**条目怎么用**。

### 生命周期

- **工厂**：只校验站点自己那列（纯函数，允许被解析器的 `PluginDiscovery` 重跑）。
- **贡献方 `loadContent`**：算规则、交回；只读自己的选项，没有副作用。
- **本包 `allContentLoaded`**：收集 → 合并 → 写注册表 → 打提示。原来在 `contentLoaded` 里
  那件事搬到这里。
- **本包 `contentLoaded`**：删掉，没有第二件事。
- **浏览器**：`theme/DocItem` 静态 import 注册表，命中即
  `<page.Component {...componentPageProps(...)} />`，否则 `@theme-init/DocItem`。

为什么不能放工厂：工厂会被解析器的 `PluginDiscovery` 再跑一次
（`plugin-prev-layer-resolver/src/plugins.mts`），写盘会删掉自己的产物。

为什么不能放本包 `loadContent` / `contentLoaded`：这两个阶段都不是跨插件的屏障 ——
每个插件的 `contentLoaded` 紧接在自己的 `loadContent` 之后跑，别的插件可能还没交回；
`allContentLoaded` 是唯一「所有 content 都已到齐」的点，而且它仍在写路由与打包之前。

dev：改贡献方的规则文件触发整站重载，或（若它把它声明进了 `getPathsToWatch`）单插件重载；
后者会重跑**所有**插件的 `allContentLoaded`，注册表当场重写。

### 替换语义（目标 3）

判定注册表、整页替换只发生在本包这一层；`theme-diff` 的 `DiffPage` 与 `theme-erd` 那份
`DocItem` 是**包裹**（在正文上方加一个兄弟视图），不判命中，不在「谁替换」之列 —— 前者已经
是清单上的一页，后者仍靠层栈覆盖（后来也迁到了清单上，见 `proposal-export-match.md`）。

组件收到 `{ ...配置 props, frontMatter, value, content }`，与它是不是 DocItem 无关（目标 2）。
命中时本层不再往下走，会丢掉 `DocItem` 内部那层壳 —— 这条两版都有，记在「代价」最后一节。

`isComponentPageContributor` / `collectContributedPages` 那套「像不像交出方」的形状检查删掉：
现在判据就是 content 里有没有那一格。

**组件不许是 `DocItem`**：`component` 写成 `@theme/DocItem` 时，生成的注册表会 import 回本层
自己（`@theme/DocItem` 的赢家就是本层），成了自引用 / 递归。配置期直接红，报出条目下标与键。

## 备选（不采用）

### 把本包做成 Docusaurus preset

- **时机不对**：preset 在 `loadPluginConfigs` 最前面跑，拿到的只有原始 `siteConfig`，返回
  `{ plugins, themes }`；那时没有任何插件实例，也看不到别的 preset 展开出了什么。
- **位置反了**：preset 交出的配置排在站点自己那两份清单前面，而主题层序是后者盖前者 ——
  preset 里的本包会成为**最内层**，它的 `DocItem` 被更外层的 `DocItem` 盖掉，永远不跑。
  preset 没有「排最后」的旋钮。
- **想自己枚举插件就会递归**：在 preset 工厂里调 `loadContext` + `loadPluginConfigs`，
  会重新调用所有 preset（含自己）。解析器能这么干，正因为它是插件不是 preset。

preset 能做的只有**打包**：把解析器与某一整套层栈装成一个 preset（`preset-classic` 那种形态）。
那是发行方式，不是发现机制。

### 运行时自注册（`getClientModules` / `injectHtmlTags`）

- 字面的注入脚本不进打包：没有构建期别名、拿不到组件，SSR 也不执行，服务端与客户端看到的
  注册结果因此不同（hydration 对不上）。
- client module 能跑（`@generated/client-modules` 由 `App` 在两侧一起 import，注册副作用在
  渲染前执行），但校验从配置期挪到运行期 / SSG；注册表成了模块级全局状态，注册方与消费方
  必须解析到同一份，HMR 还会重复注册。为一个发现通道换掉「配置期红」与「纯数据」两条前提，
  不划算。

### 落空那一跳改用 `@theme-init/DocItem`

先把前提说清：`@theme-prev/DocItem` 需要存在，是因为 component-page **下面**还有别的
`DocItem` 提供者（本仓库现在是 `theme-erd`）。如果它也迁走，component-page 就是
唯一提供者，按仓库那条规矩确实该改用 `@theme-init/DocItem`。但这个「迁走」有两个前提，
而且省不下解析器：

- **迁移不是换个入口就完**：erd 要在普通文档页**上方**摆一个视图、正文与页面结构原样
  保留；规则通道是「整页换掉 `DocItem`」，所以它的页面组件仍得在内部渲染一份 `DocItem`
  （markmap 与 diff 就是这么写的）。改完之后它内部那句可以从 `@theme-prev` 换成
  `@theme-init`，链确实断了 —— 但只是把 `DocItem` 依赖挪了个位置，没有消失。
- **解析器不会因此退场**：本族随包发布的是**未编译**的 `theme/*.tsx` 与 `lib/*.ts`，官方 babel
  规则把整个 `node_modules` 排除在外，要靠解析器那条 `node_modules/@show-docs/**` 规则才编得动
  （工作区里 pnpm 软链把源码解析到 `packages/` 之外，所以本地看不出来）。这条与别名无关；
  站点自己的 `src/theme/DocCardList` 链与 `plugin-slots` 的装机判据也住在那个包里。
- **对发布出去的包，`@theme-init` 是不可证明的假设**：component-page 不能保证第三方站点
  没把别的 `DocItem` 层排在下面；`@theme-init` 会静默跳过它。

既然解析器无论如何都得装，`@theme-prev/DocItem` 就不增加任何额外依赖，只是让落空那一跳
接到**真正的下一层**。结论：保持 `@theme-prev`；要做的是「组件不许是 `DocItem`」那条校验，
不是换 specifier。

> **后来（2026-10-30）**：`theme-erd` 也迁到了这份清单上（见
> [`proposal-export-match.md`](./proposal-export-match.md)），component-page 成了仓库里唯一
> 提供 `DocItem` 的一层。按仓库规则 10，落空那一跳与三页里的 `DocItem` 都改成了
> `@theme-init/DocItem`。上面那三个前提里，「解析器照旧要装」「迁移本身不减少依赖」仍然成立，
> 变的是「本层下面还有别的提供者」这一条 —— 所以当时那句「保持 `@theme-prev`」到此作废。

### 注入点提到 DocItem 的父组件

路由树是这样的（`plugin-content-docs/lib/routes.js` + `theme-classic`）：

```
DocVersionRoot
└─ DocRoot            ← 父级，component: docRootComponent
   └─ DocItem         ← 路由组件，component: docItemComponent（默认 @theme/DocItem）
      └─ DocProvider → DocItem/Metadata → DocItem/Layout → DocItem/Content
```

看起来「在父级判一次、命中就不渲染 DocItem」会更省事，实际三处都不划算：

- **`DocRoot`（真正的父级）信息最少、职责最多**。它经 `useDocRootMetadata({ route })` 只拿到
  `{ docElement, sidebarName, sidebarItems }`：知道当前是哪条 doc 路由、sidebar 是谁，
  **拿不到 frontMatter** —— content 在子元素 props 里，读它就是碰 React 元素的内部形状。
  它还得替 Docusaurus 处理 NotFound 与整套 sidebar / layout 组合；为了一页的判定接管所有
  docs 页面的外壳，影响面比现在大得多，也会和站点自己的 `DocRoot` swizzle 抢同一格。
- **`DocItem/Layout`、`DocItem/Content` 是子级，不是父级**。它们能 `useDoc()`，能保住
  Provider / Metadata（`Content` 还能保住面包屑、目录、翻页），但整页组件被塞进正文栏，
  视觉契约变了；而且同样会和站点对这两格的覆写抢格。
- **换注入点消不掉丢壳**。父级注入只是把「谁重画壳」从下层搬到本包；要保住壳就得复制
  DocItem 的组合（DocProvider + Metadata + HtmlClassNameProvider + Layout），主题升级时最脆，
  还会绕过其他主题层对 `DocItem` 的覆写。

`DocItem` 恰好是「既有 content / frontMatter、又只有一处 override、又没有额外职责」的最窄点，
保持不动。真要改善丢壳，正确的分档是「整页级（换 `DocItem`，现状）」与「正文级（换
`DocItem/Content`）」，而不是把注入点提到 `DocRoot`。

## 逐包迁移

### `@show-docs/docusaurus-theme-markmap`

- `src/component-pages.mts`：留成一列常量（现在只一组 `markmap` → `@theme/MarkmapPage`），
  类型标 `readonly ComponentPageDeclaration[]`。要挂第二个组件就在这一列追加，不用新文件。
- `src/index.mts`：删 `getComponentPages()`，换成：

  ```ts
  const plugin = {
    loadContent() {
      return {
        componentPages: MARKMAP_COMPONENT_PAGES
      } satisfies ComponentPageContent;
    }
  };
  ```

- `package.json`：不加 subpath、不动导出。

### `@show-docs/docusaurus-theme-iframe`

- 新增 `src/component-pages.mts`：把现在入口里那次 `contributeApiFramePages(...)` 调用挪进来，
  导出那一列 `componentPages`。它同时交回的 `warnings` 仍在 `loadContent` 里自己打一次
  （现状就是这样），不经过 component-page。
- `src/index.mts`：删 `getComponentPages()` 与工厂里那次计算；`loadContent` 变成
  「前提断言 + 交回上面那份」。
- 它的四把框键本来就是一列条目的四行（同一个组件、不同 `namespace`）；以后若再加一个组件
  （比如错误页），在同一列追加，发现一侧不动。

### `@show-docs/docusaurus-theme-diff`

- 新增 `src/component-pages.mts`：一列常量
  `{ key: 'diff', match: 'any', component: '@theme/DiffPage' }`。判法要 `any` —— `diff:` 的三种
  写法（`true` / 路径 / `{ old, new }`）都算命中，写下的那一格原样交进组件；`diff:` 那种
  「开关本身还能写参数」的形状，`boolean` / `value` / `options` 各自都盖不全。
- `theme/DocItem/index.tsx` 换成 `theme/DiffPage/index.tsx`：外壳、`lazy`、本层说法原样，
  只把「正文从哪来」换成 component-page 交进来的 `content`，正文由这一页自己转给
  `@theme-init/DocItem`（与 markmap 同一形态）。
- `src/index.mts`：`loadContent()` 里补前提断言（theme-iframe 的共享外壳 + 本包的清单），
  交回上面那份；`theme/DocItem` 那一份删掉。
- `package.json`：peer 依赖加本包。

### 站点

配置不动，但有一个**结构前提**：component-page 必须排在主题层最后（最外层提供
`theme/DocItem` 的那一层）。否则 `@theme/DocItem` 的赢家是别的层，本包这份 `DocItem` 根本
不会被渲染 —— 替换会静默失效，且不报任何错。

## 代价

### 还掉的（现状）

- **同一件事做了两遍推导**。本包在 `contentLoaded` 里 `new PluginDiscovery(...).discover()`
  问「装了哪些包」（[contribute.mts](../src/contribute.mts)）；解析器插件为了 `@theme-prev/*`
  也做一遍。全站因此读三遍配置、实例化三遍插件（core 一遍、解析器一遍、本包一遍）。
- **约定是一个实例方法**。`getComponentPages()` 只能在插件实例上被看见，所以必须把每个主题包
  **真的实例化**才能问它；包自己也得写一个工厂把方法挂上去。规则是纯数据，却被迫经过一次运行。

### 换来的（收益）

- 本包不再多读一遍配置、多实例化一遍插件（全站三遍 → 两遍：core + 解析器）。
- 约定从「实例方法」变成「content 里那一格」：可见面是官方生命周期，本包不需要注册、
  不需要 subpath，也不需要一份 `contributors` 名单。
- **发现范围按构造等于「装了的全部插件」**：preset 里的、相对路径的、内联写的都在，
  不存在「名字拼不出来所以发现不到」那一类缺口。
- 注册表在 `allContentLoaded` 一次算清；`contentLoaded` 整个删掉。
- 多组规则不再有「发现点」这一维：交回的是一列，一个包想交几组就交几组。

解析器包仍是安装前提：一是 `@theme-prev/DocItem` 的别名，二是那条把 `node_modules/@show-docs/**`
下未编译 TS 编进产物的 babel 规则。peer 依赖保留，去掉的只是本包对它 `PluginDiscovery` 的
**代码**依赖。

### 新增的（含剩余边界）

| 代价                         | 影响                                                    | 兜底                                                                                   |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 贡献方入口要加 `loadContent` | 不是「只加一个文件」                                    | 每个主题包本来就有入口，三行；`ComponentPageContent` 约束形状                          |
| `content` 被借来放规则       | 若贡献方自己定义了 `translateContent`，要原样透传这一格 | 主题包都没有；文档写一句                                                               |
| 标记是公开契约               | 别家 content 里恰好有同名键会被误认                     | 只有「有这一格 + 形状对」才算交；有但写歪 → 红并点名插件                               |
| 规则模块在配置期跑           | 不得有副作用、不引 React/DOM、纯 Node                   | 文档写明                                                                               |
| 组件字符串拼错               | 构建期 `Module not found`                               | 注册表每条带 `pages[N]，键 X` 注释，指回配置条目；与官方 `docItemComponent` 同一条边界 |
| 没装本包时规则没人读         | 无行为；那一列数组照算一次（可忽略）                    | 类型上仍是 peer 依赖本包                                                               |

### 不变的：整页替换会丢掉 DocItem 的壳

命中时本层不再往下走，所以 `DocProvider`、页面标题与描述、面包屑、翻页、右侧目录一并不要。
根源是「整页交给另一个组件」这条语义，与注入点无关：把它挪到 `DocRoot` 只会把「谁重画壳」
搬进本包，要保住壳就得复制 DocItem 的组合（见「备选」里「注入点提到 DocItem 的父组件」）。

## 测试与文档

### 测试

- 单测（`test/component-page-contrib.test.mts` 改写）：从 `allContent` 收集（多插件、同插件
  多个 `id`）、没有那一格即跳过、那一格写歪即红并点名、站点 `false` 仍能关掉包交的键、
  同键两包仍红。
- 多组规则三条：一个包交两列不同组件的条目都进注册表；同一包内撞键按重复报；
  站点关掉其中一把时同包另一把不受影响。
- 另补一条：`component: '@theme/DocItem'` 在配置期红。
- 集成：保留现有 fixture（真跑一遍官方插件加载路径），贡献方改走 `loadContent`；补一条
  「未装本包的站点仍能正常启动」。
- `test/package-entries.test.mts`：删掉 `getComponentPages` 那几条断言。

### 文档

- `docs/internals.md` 重写发现与生命周期两节。
- README 接入段改成「一个规则模块 + 入口三行」。
- `docs/component-page-demo.md` 标注 iframe / markmap 已走新通道。
- 解析器包：删掉注释里「component-page 也建了一个 `PluginDiscovery`」那句。

### 门禁

`pnpm verify`、`pnpm verify:chain`、相关单测与 e2e。

## 落地顺序

1. 本包：`allContentLoaded` 收集与合并、注册表从 `contentLoaded` 挪过来、删旧通道与
   `contentLoaded`（`PluginDiscovery` 依赖一并删）。
2. `theme-markmap`：最简单，先验证通道。
3. `theme-iframe`：验证「包自己解释自己的选项、自己的提示自己打」。
4. `theme-diff`：验证「一把键有多种命中写法」，补上 `any` 判法。
5. 测试、文档、门禁。

## 已确认的取舍（2026-10-29）

逐条过了一遍边界与代价，编号与前面各节的称呼对得上。

| #   | 取舍                                                                    | 结论     | 依据 / 备注                                                                                            |
| --- | ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| D1  | 发现通道 = `loadContent` → `allContent` → `allContentLoaded`            | 采用     | 唯一跨插件屏障；覆盖 preset / 相对路径 / 内联；不用二次实例化、不用跨包解析                            |
| D2  | 把本包做成 preset                                                       | 否       | preset 排在最前 = 主题层最内层，`DocItem` 会被盖掉；也拿不到插件实例                                   |
| D3  | 运行时自注册（`getClientModules` / 注入脚本）                           | 否       | 校验挪出配置期；注册表成模块级全局状态                                                                 |
| D4  | 落空那一跳改用 `@theme-init/DocItem`                                    | 后来采用 | erd 迁走后本层是唯一的 `DocItem` 提供者，规则 10 要求改用（2026-10-30，见 `proposal-export-match.md`） |
| D5  | 注入点提到 `DocRoot`                                                    | 否       | 信息最少、职责最多；丢壳不会因此消失                                                                   |
| B3  | 规则在配置期求值，`options` 是原始值                                    | 接受     | 包自己按需防御；iframe 的 `order` 就是这样取的                                                         |
| B4  | 组件名拼错在构建期才报                                                  | 接受     | 与官方 `docItemComponent` 同一条边界                                                                   |
| C1  | 命中即整页替换，`DocProvider` / 标题 / 面包屑 / 翻页 / 右侧目录一并丢掉 | 接受     | 语义使然，与注入点无关，两版一致                                                                       |
| C2  | 站点必须把本包放在主题层最外层，否则静默落空                            | 接受     | 写进 README 作为结构前提；放错时没有任何报错可给                                                       |
| C3  | `component` 不许写成 `@theme/DocItem`（自引用会递归）                   | 接受     | 配置期直接红，报条目下标与键                                                                           |
| C4  | 解析器包仍是安装前提                                                    | 接受     | 别名 + 未编译 TS 的 babel 规则，两件事都靠它                                                           |

早先待定的 B1（发现范围只覆盖裸包名）与 B2（一个包能有几个发现点）由 D1 一并消解：
前者是 `allContent` 的覆盖面，后者在「交回的是一列」之下没有这个维度。
