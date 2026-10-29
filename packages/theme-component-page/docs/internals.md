# 维护者文档：theme-component-page

这份写的是**改这个包之前要知道的事**：清单怎么变成浏览器读得到的组件、各处判据住在哪一份里、
以及失败模式的落点。使用者那一面（选项、入参、写法）在 [README](../README.md)。

## 组成

| 文件                                   | 谁编译它               | 管什么                                                                                                                                                    |
| -------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                        | `tsc` → `dist/`        | 插件入口：查解析器插件那条安装前提（`loadContent`）、校验清单、挂主题层、在 `allContentLoaded` 收集各插件交回的条目并把生成模块写进 Docusaurus 的生成目录 |
| `src/config.mts`                       | `tsc` → `dist/`        | 那一列清单的校验与归一化（配置期，红在「加载配置」那一句）                                                                                                |
| `src/contribute.mts`                   | `tsc` → `dist/`        | 别的插件交回条目的那一格：读 `allContent`、校验、与站点那一列合成                                                                                         |
| `src/registry-module.mts`              | `tsc` → `dist/`        | 生成模块的**文本**：那几行 `import` 与那份数据（配置期，纯函数）                                                                                          |
| `lib/component-page.ts`                | 用它的站点编（不编译） | 条目形状 + 命中判据 + 入参组装 + 落空告警；不引 React、不引 DOM                                                                                           |
| `types/component-page-specifiers.d.ts` | 用它的站点编（不编译） | 告诉 TS 那份生成模块存在，并把条目形状钉成 `lib/` 那一份                                                                                                  |
| `theme/DocItem/index.tsx`              | 用它的站点编（不编译） | 判清单的那一格：命中就换掉整个 `DocItem`                                                                                                                  |

`src/` 编成 `dist/`，其余都是源码：与其余各包同一口径（谁编译、为什么不编译，记在仓库根
`README.md` 那张表里）。覆盖率红线因此是 `src/` 那四份 + `lib/`（`vitest.config.mts` 的
`coverage.include`），`theme/` 那一层由 e2e 钉。

## 「配置 → 组件」这一跳为什么要生成一份文件

`@theme/*` 是 webpack 的**构建期**别名（`@docusaurus/core/lib/webpack/aliases/index.js`：
按层栈扫目录，一格一个精确 specifier），磁盘上没有 `@theme` 那个目录。浏览器侧那份 `DocItem`
因此只能写死 `import`，没法 `import(变量)` —— 配置里那串字符串到不了运行时。

这一包的解法是配置期把字符串**铺成源码**：`src/registry-module.mts` 出一份带静态 `import` 的
模块文本，`allContentLoaded` 把它写到

```
<generatedFilesDir>/theme-component-page/registry.ts
```

浏览器侧用 `@generated/theme-component-page/registry` 读它。三条根据都按**符号**认，不按行号认
（行号随 Docusaurus 版本漂），读的是 `@docusaurus/core/lib/webpack/base.js`：

- `resolve.alias` 里有 `'@generated': generatedFilesDir` —— 那条别名就是生成目录本身；
- `resolve.extensions` 收了 `.mjs` / `.js` / `.jsx` / `.ts` / `.tsx` —— 所以生成文件不用写扩展名；
- 官方那条 JS 规则 `{ test: /\.[jt]sx?$/i, exclude: excludeJS }` 里，`excludeJS()` 只对路径含
  `node_modules` 的那一路交回 `true`（docusaurus 自己的包除外）—— 生成目录不含它，
  所以 `.docusaurus/` 里的 `.ts` 照样进 babel。

这三条一升级就该重读一遍；运行时替身是 e2e 那条「命中那把键的页整页交给组件」——
它读不到生成模块就红，比这里任何一句描述都诚实。

写这一步放在 `allContentLoaded`，不放在入口调用，也不放在 `loadContent` / `contentLoaded`：
`generatedFilesDir` 要到插件装载完才存在，而客户端打包在这之后才开始；更要紧的是
`allContentLoaded` 是**唯一**「所有插件的 content 都已到齐」的点 —— 每个插件的
`contentLoaded` 紧接在自己的 `loadContent` 之后跑，别人的规则可能还没交回。入口调用那一步还会
被解析器的 `PluginDiscovery` 再跑一次，写盘会删掉自己的产物。配置期与打包期之间只有 dev server
重启 / 重新 build 会再走一遍 `allContentLoaded`，正是改配置要的效果；这一份不需要
`getPathsToWatch`（它是产物，不是输入）。

**代价**：生成文件的形状与 `types/component-page-specifiers.d.ts` 那份声明之间没有编译器拦着
（那份声明就是 TS 看到的唯一真相，磁盘上那份文件在类型检查时还不存在，而 `.docusaurus/` 本身
排在 `tsconfig.json` 的 exclude 里）。同理，入口写盘那一路径与浏览器侧那句 `@generated/…`
是两处字面量。所以这些对齐各由一条测试钉住（都在 `test/component-page-registry.test.mts`）：
铺出来的每一格键名 = 两份声明里的格集合，那句说明符反推的路径 = 入口真的落盘那一路径，
运行时那一半由 e2e 钉。**新增一格要走的全程**：`types/component-page.d.ts` 的形状、
`src/registry-module.mts` 的文本、`theme/DocItem` 里读它的那一格、上面那两条对齐的期望集合 ——
漏了任何一处，前两条会红；只漏最后一处，才轮到静默拿到 `undefined`。

## 判据住在哪一份

- 条目形状与命中判据、落空告警：`lib/component-page.ts`。配置期与浏览器期引同一份，
  于是 `match` 那三种判法只写一次。
- 交进组件的入参怎么组装：同一份 `lib/` 里的 `componentPageProps()`。配置里 `props` 那格垫底，
  本页那三份（`frontMatter` / `value` / `content`）盖在上面 —— **同名的键以那三份为准**，
  因为那一格是每一页共用的入参，不该盖掉本页的事实。次序写在这里而不是 `theme/DocItem` 的
  JSX 里，为的是让「谁赢」这一格由单元测试钉住（JSX 那一半只有 e2e，判不了一格的先后）。
- 校验（什么形状的配置算写歪）：`src/config.mts`。`key` 那一格先挡官方文档页 frontmatter 的
  那一组键名（`RESERVED_FRONTMATTER_KEYS`）：本层判的是「这一页写了这把键」，而官方那一组
  几乎每一页都写着，拿它当键就是把整站正文换成一个组件 —— 整组红，不看判法是哪一种。
  那份名单是**从装的这个 Docusaurus 里抄来的**，所以由一条测试对回原处
  （`test/component-page-config.test.mts` 读 `@docusaurus/plugin-content-docs/lib/frontMatter.js`
  的 `DocFrontMatterSchema.describe().keys`）：升级后官方多一把键名，那条先红。
  `props` 那一格判到底（`assertPureData()`）：
  串 / 数 / 布尔 / `null` / 普通对象 / 数组以外的一切都红在配置加载那一句，消息点名到
  `pages[0].props.filters[1].on` 那种完整路径。判到底的理由是这一格的产物走 JSON 写法，
  函数与 `undefined` 会静默消失、`NaN` 写成 `null`、`Date` 与 `Set` 变成另一种东西 ——
  与其让组件收到一个悄悄没了的入参，不如红。循环引用也在这一步拦（`parents` 那一条来路），
  否则抛在 `JSON.stringify` 里、看不出是哪一格。
- 清单顺序 = 优先级：`lib/component-page.ts` 的文件头。本包没有「装没装」这一格：
  清单就挂在本包的插件选项上，装了本层整列才参与判定。
- 别的插件交回条目那一条约定，以及两列怎么合成一列：`src/contribute.mts`。校验仍走
  `src/config.mts` 那一条（同一份函数，只是报错里的列名换成 `pages（插件名 交出的）`）；
  判定那一侧完全不知道条目从哪儿来 —— 生成模块里只有合成后的那一列。

## 条目还有第二个来源：装了的插件自己交回

站点写的那一列之外，`src/contribute.mts` 认一条约定：**插件的 `loadContent()` 交回的 content
里有 `componentPages` 这一格**，那一列就是那个插件要接管的页。这一格不新造发现机制，走的是
官方那条 `loadContent` → `allContent` → `allContentLoaded`：官方把所有插件的 content 按
「插件名 → id」汇进 `allContent`，本层在 `allContentLoaded` 里遍历它。

四件事值得在改它之前知道：

- **判据就是 content 上有没有那一格**，不看包名清单、不读 `themeConfig`、不要求实例上有哪个
  方法。没有这一格 = 这个插件不交；有但形状写歪，红并把插件名带进列名。同一个包装了两次
  （不同 `id`）就是两份 content，报错与提示里带上 `id` 才分得清。
- **来源 = 所有被装载的插件**：preset 展开的、相对路径入口的、配置里直接写函数的都会走到
  这一步。边界有两条：装在依赖里但没注册进 `plugins` / `themes` 的包不会出现（旧方案里
  `contributors` 能点名这种包，这一版没有对应物）；面也不再限于主题 —— 任何插件的 content
  都看，兜底只剩撞键红与站点 `component: false`。
- **合成只有四条规则**（站点排前面 / 同键用站点的并留一条提示 / 站点写 `component: false`
  就把那一把键整体关掉 / 两个插件抢同一把键直接红）。抢键那条选红不选「先到先得」：两个包各写各的，
  谁赢都没有合理依据，而让一个悄悄赢的话，另一个包自己的键照样命中、页面却归了别人 ——
  那种结果从产物里看不出来。站点关掉那把键时它让位：两边都不再生效，红不红已经没有后果，
  而「红」反倒会让站点没法收拾一个它自己改不了的冲突（键名住在那两个包里）。
- **关掉记号走的是类型，不是事后过滤**：`normalizePages` 有两个重载 —— 站点那一列
  （`siteColumn: true`）交回 `NormalizedPage`（`specifier` 可能是 `false`），包交出的那一列
  根本认不了 `false`（红），所以交回的是 `EnabledPage`。`mergePages` 把记号挑出去之后交给生成
  模块的只有 `EnabledPage`，`src/registry-module.mts` 因此不必判一种「按类型到不了」的形状。

这一版还顺带还掉了一笔旧账：以前约定是实例方法 `getComponentPages()`，本层得在
`contentLoaded` 里再建一个 `PluginDiscovery`，把主题插件多实例化一遍才问得到；现在 contribution
就是 content 里的一格，全站读两遍配置（core + 解析器）就够了，本包对解析器只剩下安装前提
（别名与未编译 TS 的 babel 规则），代码上不再依赖它的 `PluginDiscovery`。

钉这一格的是 `test/component-page-contrib.test.mts`：单元对合（认法、报错点名的列名、多 id、
四条合成规则、一个包多组规则）+ 一条端到端（夹具站点里真装一个交出条目的包，跑**真的**
`loadContext` + `loadPluginConfigs`，再照 core 的口径把各插件 `loadContent()` 的结果收进
`allContent`，要求合成结果真的落进生成文件）。

## 与 `theme-iframe` 那一族的边界

`theme-iframe` 自己那份清单**硬编码在它包里**（`src/api-frame-registry.ts`），但它不再自己判：
它在 `loadContent()` 里通过本包的约定交回装了的那几层各一页，组件是它自己的
`@theme/ApiFramePage`，`props.namespace` 说明赢的是哪一条。于是：

- 本包仍然不认得那四把键：交给它的就是普通的 `ComponentPageDeclaration`；
- 「哪一层装了」「默认顺序」「站点覆盖」都在交出方算（`src/api-frame-contribute.mts`），
  本包只管自己那四条合成规则（站点排前面 / 同键站点赢并留提示 / `component: false` 关掉 /
  两包抢同一把键直接红）；
- 框内那条路由、`oas3:` / `aas3:` 那些 spec 键、`<iframe>` 的尺寸与消息循环仍然住在它自己
  包里，机制层一概不认。

`theme-markmap` 是这张清单上的第二个交出方，走的还是同一条约定：入口的 `loadContent()` 交回
`{ key: 'markmap', match: 'options', component: '@theme/MarkmapPage' }`，「开着、选项写在键里」
那一格由 `options` 判法原样交给它自己的页面组件（口径在 `packages/theme-markmap/src/component-pages.mts`）。
两边都只交条目、不碰本层的合成规则；本层也仍然不认得 `markmap` 那把键。

本包在 `src/index.mts` 里只跑**一条**前置检查：解析器插件在不在那两份清单里，走的是那个包自己
发出来的 `assertPrevLayerResolverInstalled()`（`@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots`）。
它**不**引 `theme-iframe` 那份 `assertThemePrerequisites()`：那一格里另外两条检查（`theme-iframe`
有没有注册成插件、有没有开 lightningcss）属于另一族层，引它就把那一族变成本层的安装前提，
而本层是通用机制，站点不装 `theme-iframe` 也用得上。

以前这条只能空着：判据住在 `theme-iframe` 未编译的 `lib/` 里，本层入口（进 `tsc`，
`rootDir` = `src/`）跨不过去，缺解析器时红在本层 `theme/DocItem` 那句 `@theme-prev/DocItem`
的 `Module not found` 上，报错点隔着一整个构建。判据搬到解析器包之后，两头都保住 ——
既当场点名，又没有认另一族层。钉这一格的是 `test/package-entries.test.mts` 里
「loadContent 只查解析器插件」那一条，判据本身在 `test/plugin-slots.test.mts`。

本站把本层声明在其余各层**之后**，所以它在层栈最外、最先判（越晚声明 = 层栈越靠外 = 越先判，
那条口径记在 [`theme-iframe` 的协议文档](../../theme-iframe/docs/iframe-protocol.md)里）；
换个位置放就换个先后，机制本身不管这件事。

**在最外的那一格因此遮住下面各层的 `DocItem`**：一页同时写中本层的键和下面某条视图层的键时，
本层的组件赢，那条视图层的 `DocItem` 根本不会被走到、它的告警也不会打（`theme-erd` 与
`theme-diff` 仍属于这一类）。两层互不认识，谁也报不了这条冲突，所以顺序是站点作者的判据。
`theme-iframe` 那四条框键与 `theme-markmap` 那把 `markmap` 不再有这个问题 —— 它们本来就在本层
的清单里，命中后分别由 `ApiFramePage` / `MarkmapPage` 渲染（一页只交出一个组件这一点没变：
本层清单里排前面的那条赢，所以一页同时写了 `markmap:` 与某把框键时也只挂其中一个）。

## 失败模式与落点

| 症状                                                                 | 落点                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 清单形状写歪                                                         | 配置加载那一步红，消息带 `pages[下标].哪一格`                              |
| `key` 用了官方文档页 frontmatter 的那一把键名                        | 配置加载那一步红，点名那一格与该键名                                       |
| 两条用了同一把键                                                     | 同上（`seen` 那一条）                                                      |
| `component` 指到别名表认不出的地方                                   | 打包那一步 `Module not found`；生成文件里那条 `import` 上面有出处          |
| `props` 深处不是纯数据（函数、`undefined`、`NaN`、`Date`、循环引用） | 配置加载那一步红，消息带完整路径 `pages[0].props.a.b`                      |
| 键写了但形状不合那条的判法                                           | dev 控制台一条告警，页面交回普通文档页                                     |
| 一页同时命中两条                                                     | dev 控制台一条告警，只用排在最前那条                                       |
| 装了本层却一条没配                                                   | 静默：生成一份空清单，每一页都原样交回下层（这是合法配置）                 |
| 某个插件交回的 `componentPages` 写歪                                 | `allContentLoaded` 那一步红，消息带 `pages（插件名 交出的）[下标].哪一格`  |
| 两个插件交出同一把键                                                 | 同上，把抢的两边都点出来                                                   |
| 站点与某个插件写了同一把键                                           | 用站点那条，构建日志一条提示（点名那个插件）                               |
| 站点把某一格写成 `component: false`                                  | 那把键整体不生效（插件交回的也丢），构建日志一条提示；不进生成模块         |
| 插件交回的那一列写了 `component: false`                              | 同上那一步红：关掉一把键只有站点那一列写得算                               |
| `component` 写成 `@theme/DocItem`                                    | 配置加载那一步红：那个别名归本层，注册表会 import 回自己                   |
| 抢键的那两把正好被站点关掉                                           | 不红：两边都不生效，各留一条提示                                           |
| 解析器插件没注册（缺 `@theme-prev/*` 那组别名）                      | 配置加载那一步红，点名那个包与 `pnpm add`；不再等打包报 `Module not found` |
