# 方案：API 层自交框页，theme-iframe 只交 `iframe:`

> 本文保留已实施迁移的背景。“声明顺序 = 判定先后”只描述本站当前简单装法，不能作为
> 通用契约：`allContent` 按插件名/id 分组，会改变交错实例的顺序。本文实施之后又有一步
> 收缩：API 包直接向 component-page 注册组件与规则，公共库、两种渲染与通用框内入口均归
> component-page，theme-iframe 仅支持 frontmatter.iframe 的 URL 嵌入 —— 现状见本包
> `README.md`、`docs/internals.md` 与
> [`theme-component-page` 的维护者文档](../../theme-component-page/docs/internals.md)。

> 方案书，不是现状说明。现状（四把框键、清单、判定）见本包 `README.md`、
> `docs/internals.md` 与 `docs/iframe-protocol.md`。日期：2026-10-30。已按「落地顺序」
> 实施。

## 一句话

「哪一层接了这一页」从 theme-iframe 集中算，改成三条 API 层各自在自己的 `loadContent()`
里交自己那一页 —— 条目由共用的 `createApiFrameTheme()` 工厂代交，内容来自注册表那条
`internal` 行；theme-iframe 只交 `iframe:`。顺序不再有插件选项：命中优先级 = 站点
`plugins` 里的声明顺序。

## 原方案与它的问题

改之前，`src/api-frame-contribute.mts` 在 theme-iframe 的 `loadContent()` 里做四件事：

1. 读 `siteConfig.plugins` / `themes`，按四种声明形状（裸包名、`[包名, 选项]`、路径、
   `{ name }`）认出装了的层；
2. 过滤掉没装的层；
3. 按 `themeConfig.apiFrame.order`（缺省是注册表顺序）排先后；
4. 替这些层各交一条条目，交回的 `warnings` 在入口里打一次。

`createApiFrameTheme()` 工厂当时只挂主题层、注册框内路由、透传 webpack 差异，不交页。
四个问题：

- **同一件事各算一遍**。装了哪些层，core 读一遍、解析器读一遍、theme-iframe 再读一遍；
  中心还得懂「插件有几种声明形状」这种平台细节。
- **`order` 是第二份清单**。站点想换判定顺序，要同时改 `plugins` 与
  `themeConfig.apiFrame.order`；两处不一致时，实际行为由 `order` 决定，`plugins` 的顺序
  只是摆设。默认顺序又是注册表里写死的，与站点怎么装没有关系。
- **启用范围与装机过滤重复**。`order` 顺带承担「只让这几层参与」：列了没装的层要告警、
  拼错的名字要告警。可「没装」本来就能从「它不跑 `loadContent()`」直接得到，不需要名单。
- **同一族里两套通道**。markmap / erd / diff 都已经自交条目，只有框族由中心代交；
  「谁装了、谁交了什么」在这两套里答法不同。

## 改法

### 分工

| 谁                      | 交什么                                             | 什么时候                    |
| ----------------------- | -------------------------------------------------- | --------------------------- |
| `createApiFrameTheme()` | 该 API 层自己那一页（`framePageOf(view)`）         | 各 API 包的 `loadContent()` |
| theme-iframe 入口       | 只有 `iframe:` 那一页（`IFRAME_COMPONENT_PAGES`）  | 本层 `loadContent()`        |
| theme-component-page    | 不新增：照旧收集、合成、生成注册表                 | `allContentLoaded`          |
| 站点                    | 用 `plugins` 顺序表达优先级；用 `pages` 覆写或关掉 | 配置期                      |

三条 API 包的 `src/index.mts` 本来就只调一次工厂，这版不改它们的源码；变的是工厂在
`loadContent()` 里多交回一格，以及各包 `peerDependencies` 补上 component-page。

### 交出的条目

```ts
export function framePageOf(entry: ApiFrameEntry): ComponentPageDeclaration {
  return {
    key: entry.frontmatterKey,
    match: entry.kind === 'internal' ? 'boolean' : 'value',
    component: '@theme/ApiFramePage',
    props: { namespace: entry.namespace }
  };
}
```

| 交出方          | `key`       | `match`   | `props.namespace`                       |
| --------------- | ----------- | --------- | --------------------------------------- |
| theme-scalar    | `scalar`    | `boolean` | `@show-docs/docusaurus-theme-scalar`    |
| theme-redoc     | `redoc`     | `boolean` | `@show-docs/docusaurus-theme-redoc`     |
| theme-stoplight | `stoplight` | `boolean` | `@show-docs/docusaurus-theme-stoplight` |
| theme-iframe    | `iframe`    | `value`   | `@show-docs/docusaurus-theme-iframe`    |

- 组件统一是 `@theme/ApiFramePage`，靠 `props.namespace` 分派；页面组件本身不改。
- `match` 仍按值的形状分：三条 API 层的布尔键只认 `true`，`iframe:` 认非空地址。
- 工厂的安装前提从 `{ iframe: true }` 变成 `{ iframe: true, componentPage: true }` ——
  交出去的页要有人挂。解析器那条检查在 `assertThemePrerequisites()` 里常开，不必单独传；
  theme-iframe 入口只传 `{ componentPage: true }`。

### 顺序从哪来

1. 各包的 `loadContent()` 交回 `{ componentPages }`；官方把所有插件的 content 收进
   `allContent`，键序 = 插件装载顺序 = 站点声明顺序（本站四层都写在 `plugins`）。
2. component-page 的 `collectContributedPages()` 按 `Object.entries(allContent)` 的顺序
   接各列，`mergePages()` 再把它们接在站点那一列后面 —— 生成的清单顺序就是声明顺序。
3. 浏览器侧逐条走清单，第一条命中的赢。

换先后 = 挪 `plugins` 里那几项的位置，没有第二种写法。

### 「装了没有」不再是一个判断

- 没装的包不会跑 `loadContent()`，自然不会交页；不需要名单，也不需要读四种声明形状。
- 旧扫描的装机过滤结果相同：没装 = 不命中。差别只在提示：
  - 旧：`order` 里列了没装的层、或名字拼错，`loadContent()` 告警；新：这两类配置不存在。
  - 页面级那两类告警（布尔键没给 spec 地址、两把 spec 键同时写）不变。
- 落空页（写了键、但那一层没装）在新旧方案里都是「交回普通文档页」，没有新告警。

### 注册表降为纯数据

`src/api-frame-registry.ts` 仍是一族的数据来源：`namespace` / `frontmatterKey` / `route` /
`pageComponent` / `specParam` / `specFrontmatterKeys` / `frameClass` / `title`。

- 表里的排列顺序不再等于优先级：`apiFrameEntriesOrdered()` 只给单测检查唯一性；
  判定先后不读这一格。
- `apiFrameByNamespace()` 仍是工厂与页面按命名空间取条目的入口。
- 以后加一条层 = 表里加一行 + 新包调一次工厂，发现一侧不动；若要让新层先判，把它在
  `plugins` 里排前。

## 兼容与迁移

| 旧写法                                | 新行为                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `themeConfig.apiFrame.order: [...]`   | 不再被读取，静默失效（`themeConfig` 没有 schema 校验）。删掉它，按想要顺序排 `plugins` |
| 依赖默认顺序（注册表顺序）            | 默认变成 `plugins` 顺序；本站两种顺序恰好一致（scalar → redoc → stoplight → iframe）   |
| 用 `order` 列子集来「只启用一部分」   | 不注册那一层即可：没装就不交页                                                         |
| component-page 的 `pages` 覆写 / 关掉 | 不变                                                                                   |
| 页面级告警（缺 spec、两把 spec 同写） | 不变                                                                                   |

这是 breaking change：老站点若靠 `order` 改过优先级，升级后行为会回到 `plugins` 顺序，
而且不会报错。README 的注册示例已按「声明顺序 = 判定先后」写清。

没有加「检测到旧 `order` 就告警」：`themeConfig` 是未校验的自由格（core 的 schema 是
`Joi.object().unknown()`），要读它就得让本包在配置期再碰一次站点配置 —— 与这次「中心不再
读配置」的方向相反。需要兼容提示的话另开一条。

## 备选（不采用）

### A. 字面做法：theme-iframe 去读三条 API 包的「自注册」

让各包导出一份注册表，theme-iframe 在配置期 `import` 进来汇总。问题：

- 没装的包 import 会失败，得靠 `try/catch` 或再去读一遍 `plugins` 判断装没装 —— 装机扫描
  又回来了。
- 中心要认识每个包的导出名与版本，「谁交的」这层信息也会在汇总时丢掉，报错只能指到中心。
- 与 markmap / erd / diff 的通道不一致：它们都走 `allContent`，框族再留一条中心 import
  的边，族内继续分叉。

结论：采用「各包把条目交给 component-page」的既有通道，theme-iframe 与三条 API 包平级，
都只是交出方。

### B. 保留 `apiFrame.order`

- 顺序的权威来源已经有一个（`plugins`），再写一份必然漂移；站点改一处要记得改两处。
- 它承担的「启用范围」可以由「不注册」直接做到，不需要名单。
- 保留它还意味着中心继续读 `siteConfig.plugins` 的四种声明形状，与 D3 相反。

结论：删掉选项，站点的覆写 / 关掉仍走 component-page 的 `pages`。

### C. theme-iframe 在 `allContentLoaded` 里替各层交页

`contentPages` 只能在 `loadContent()` 阶段交回；`allContentLoaded` 只读不写，没有「补交
content」的入口。要中心汇总，只能回到 A 或 B 的读配置路子。

### D. 按注册表顺序判（谁在表里靠前谁先判）

表是包内实现细节，与站点装法无关；站点想换顺序就得改包源码。现在把表降为纯数据，
顺序交给站点唯一已有的那份清单。

## 影响面

| 文件                                                  | 改动                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/component-pages.mts`                             | 收 `framePageOf()` 与 `IFRAME_COMPONENT_PAGES`（只含 `iframe:` 一条）                                    |
| `src/index.mts`                                       | `loadContent()` 只传 `componentPage: true`（解析器那条常开）、交回上面那列；删插件选项类型与扫描         |
| `lib/api-frame-theme.mts`                             | `loadContent()` 断言 `{ iframe, componentPage }`，交回 `framePageOf(view)`                               |
| `src/api-frame-contribute.mts`                        | 删除                                                                                                     |
| `src/api-frame-registry.ts`                           | 降为纯数据；文件头说明「不决定判定先后」                                                                 |
| `package.json`（theme-iframe + 三条 API 包）          | theme-iframe 的 `files` 补 `src/component-pages.mts`；三条 API 包的 `peerDependencies` 补 component-page |
| `docusaurus.config.mjs`                               | 按 scalar → redoc → stoplight → iframe 排，注释写明声明顺序 = 优先级                                     |
| `tools/scripts/verify-chain.mts` 第 3 节              | 回读清单四条的键序与 `match` 表                                                                          |
| `test/api-frame-pages.test.mts`（新）                 | 条目映射与入口只交 `iframe:` 一条                                                                        |
| `test/api-frame-contribute.test.mts`                  | 删除                                                                                                     |
| `test/api-frame-theme.test.mts`                       | 工厂交出的那一页 + 两条安装前提                                                                          |
| `test/package-entries.test.mts`                       | 入口交出的形状与 component-page 前提                                                                     |
| `test/e2e/features/frame-precedence.feature`          | 场景名与注释改成「按声明顺序判」                                                                         |
| 两份 README / internals / iframe-protocol / 根 README | 同步顺序口径，去掉 `order` 与装机扫描的说法                                                              |

## 测试与门禁

- 单测：`framePageOf()` 的四种键 → `match` / `namespace` 映射；theme-iframe 入口只交
  `iframe:` 一条；工厂 `loadContent()` 交出的那一条；两条安装前提各自缺失时点名。
- `verify-chain` 第 3 节：真实 build 后生成清单里四条的顺序是
  `scalar > redoc > stoplight > iframe`，`match` 依次为
  `boolean` / `boolean` / `boolean` / `value`。
- e2e `frame-precedence`：四把键同写 → scalar 赢；去掉 scalar → 剩下的三把里 redoc 赢
  （钉「判定逐条走清单」，不是「只有第一条被实现」）。
- 门禁：`pnpm verify`、`pnpm verify:chain`、`pnpm test:e2e`。

## 落地顺序

1. theme-iframe：`src/component-pages.mts` 收 `framePageOf()` + `IFRAME_COMPONENT_PAGES`；
   入口只交这条；工厂 `loadContent()` 交 `framePageOf(view)` 并补 component-page 前提；
   删 `src/api-frame-contribute.mts`；注册表头改成「数据来源，不决定先后」；`files` 补
   `src/component-pages.mts`。
2. 三条 API 包：`peerDependencies` 补 component-page。源码不动 —— 工厂共用。
3. 演示站：`plugins` 按 scalar → redoc → stoplight → iframe 排，写清「声明顺序就是命中
   优先级」。
4. 测试、`verify-chain`、e2e。
5. 文档全扫：本包 README / internals / iframe-protocol、component-page 两份文档、三条 API
   包的 README / internals / 示例页、根 README、`test/README.md`。

## 已确认的取舍（2026-10-30）

| #   | 取舍                                     | 结论 | 依据                                                                     |
| --- | ---------------------------------------- | ---- | ------------------------------------------------------------------------ |
| D1  | 各包自交，还是 theme-iframe 读各包的注册 | 自交 | 与 markmap / erd / diff 同一条 `allContent` 通道；「装了没有」由平台回答 |
| D2  | 顺序 = 站点 `plugins` 的声明顺序         | 采用 | 顺序已有唯一权威来源；删掉 `apiFrame.order` 这份第二清单                 |
| D3  | 删除装机扫描与四种声明形状的判据         | 采用 | 没装就不会跑 `loadContent()`；本包不再读 `siteConfig.plugins`            |
| D4  | 注册表只留数据，排列顺序不再表示优先级   | 采用 | 表顺序只用于单测检查唯一性；判定先后只看清单                             |
| D5  | 旧 `apiFrame.order` 静默失效             | 接受 | `themeConfig` 无 schema 校验；README 写迁移；未加弃用告警                |
| D6  | 顺序语义变化是 breaking change           | 接受 | 声明顺序从「层栈」升级为「判定先后」；演示站与 e2e 已按期望排            |
