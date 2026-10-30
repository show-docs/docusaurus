# theme-iframe 维护者文档

这份写的是**改这一层之前要知道的事**：包内组成、编译口径、这一族收缩的来龙去脉，以及本层
剩下的那格判据实测到的形状。使用者要看的（`iframe:` 怎么用、判定先后、已知的边界）在
[`README.md`](../README.md)，同源框那套跨 iframe 约定在
[`iframe-protocol.md`](../../theme-component-page/docs/iframe-protocol.md)。

源码注释里那些「理由见包 README『…』一节」的指针，落在本节这些章节上的已经改指这份文件。

## 状态：已接入站点

`docusaurus.config.mjs` 的 `plugins` 里装了本包，站点 component-page 那一列 `rules` 里按键名
引用了 `iframe`（排在 `scalar` / `redoc` / `stoplight` 之后，所以同页写满四把键时本层轮不到 ——
`test/e2e/features/frame-precedence.feature` 钉的就是这个落点）。站点根的 `package.json` 声明了
`"@show-docs/docusaurus-theme-iframe": "workspace:^"`。`pnpm build` 与 `pnpm verify:chain` 都绿，
推导出的层栈里有 `packages/theme-iframe/theme`。

产物侧能看到的是生成目录里那份 `theme-component-page/registry.ts` 带着本层交出的那一条
（`@theme/ExternalFrame`，登记名 `external-frame`）。浏览器里的实测在
`test/e2e/features/iframe.feature`（两条用例，跑法见 `test/README.md`）：命中页整页交给 iframe、
地址栏带 `?path=` 时换嵌另一个页面。

`pnpm build` 之后，示例页 `build/theme-iframe/docs/iframe-demo/index.html` 里那一句是（构建产物
不补引号，原样抄）：

```html
<iframe class=external-frame src=/404 title="iframe 示例">
```

`src` 是 frontmatter 那一条 `/404` 原样 —— 相对写法在产物里就保持相对，`serve` 在哪个 origin
上它就指哪个 origin（见下面「服务端那一遍」）。无障碍标题用的是页面自己的 `title:`。

包名挂 `@show-docs/`，与仓库其它包同一域，所以列进 `test/plugin.test.mts` 那条分包用例的目录清单
只差改清单本身。

## 组成

| 文件                            | 编译吗              | 职责                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.mts`                 | ✅ `src/` → `dist/` | 本层入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算，就是 `../theme`）；`loadContent()` 先调 `assertThemePrerequisites()` 查解析器插件与 component-page 两条安装前提，再交回 `{ componentPage: { components, rules } }` —— 一个组件（`external-frame` → `@theme/ExternalFrame`）与一条规则（`iframe:`，`source: 'frontMatter'` / `match: 'value'`，`render` 缺省即 `page`） |
| `theme/ExternalFrame/index.tsx` | ❌ 站点编译         | 命中后铺在正文里的那一格：算出框的地址（浏览器那一遍走 `externalFrameURL()`，服务端那一遍走 `httpsOnHttpsSite()`），渲染 `<iframe class="external-frame">`，`title` 优先用页面的 `frontMatter.title`                                                                                                                                                                                 |
| `components/external-frame.css` | ❌ 站点编译         | 本层那一格的版式：框定高占满 navbar 以下那一屏、`display: block`、去边框，正文容器让位，页脚收掉。后两条与机制层那份同源框的 CSS 同文，为什么各留一份写在这份文件头上                                                                                                                                                                                                                |
| `lib/external-url.ts`           | ❌ 不进 `tsc`       | 本层唯一还剩的公共判据：`externalFrameURL()`（`/` 打头补 origin、`?path=` 再解一层）与 `httpsOnHttpsSite()`（服务端那一遍只动绝对 `http:`）。没有 DOM、没有 React，浏览器与单测引同一份；协议那一格转引机制层的 `lib/frame-url.ts`，不抄第二遍                                                                                                                                       |
| `tsconfig.build.json`           | ——                  | 构建项目：只有 `src/`，所以本包的产物出口是 `dist/index.mjs`；`lib/`、`components/`、`theme/` 都不进 `tsc`                                                                                                                                                                                                                                                                           |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/` 里的
`.tsx`，本包就不编译第二遍；`theme/ExternalFrame` 引的那份 `lib/external-url.ts` 同样是源码，
由站点按 `@show-docs` 这个 scope 认领（判据在解析器包的 `src/source-js-rule.mts`）。口径的产地
在仓库根 README 的「构建包的编译口径」。

## 这一族收缩成了本层，其余搬去了机制层

v3 之前，这一族（`scalar` / `redoc` / `stoplight` / `iframe` 四把键）的外层套壳、注册表、跨
iframe 的消息协议、框内页面工厂都住在 `theme-iframe` 里，三条 API 层经它的配置期工厂
`lib/api-frame-theme.mts` 交页。上一族的自注册提案与验收记在
[`proposal-api-self-register.md`](./proposal-api-self-register.md)（已落地）；机制层统一分派
那一步的设计与现状都在 [`theme-component-page` 的维护者文档](../../theme-component-page/docs/internals.md)里。

搬走之后各归其主：

| 原来在本包                                                                                                                                    | 现在                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/api-frame-registry.ts`（四条键的中心表）与 `lib/api-frame-registry.ts` 那条浏览器转出                                                    | 删了。机制层不认识「哪把键归哪一层」，各包在自己的 `loadContent()` 里交            |
| `src/component-pages.mts` 的 `framePageOf()` / `IFRAME_COMPONENT_PAGES`                                                                       | 删了。规则的形状就是 component-page 契约里的那一条，本层直接写                     |
| `lib/api-frame-theme.mts`（配置期工厂）、`lib/api-frame-view.tsx`（框内页面工厂）                                                             | 删了。三条 API 层不再经工厂，直接交「一个组件 + 一条规则」                         |
| `theme/ApiFramePage`、`components/api-frame.tsx` / `.css`（四条层共用的外层框）                                                               | 变成机制层的 `theme/ComponentFramePage`、`components/component-frame.tsx` / `.css` |
| `lib/frame-messages.ts` / `frame-sync.tsx` / `frame-url.ts` / `frame-route.ts` / `frame-view.tsx` / `frontmatter-values.ts`（同源框那套约定） | 机制层的 `lib/`，口径在 `docs/iframe-protocol.md`                                  |
| `lib/location-mirror.tsx`、`lib/isolate-renderer-css.ts`、`lib/view-layer-*`（三条视图层共用的外壳）                                          | 机制层的 `lib/`                                                                    |
| `src/prerequisites.mts`（安装前提检查）                                                                                                       | 机制层的 `src/prerequisites.mts`，各层经 `…/prerequisites` 子路径引                |

于是验收成立：**卸载 `theme-iframe` 只影响 `iframe:` 那一把键**，三条 API 层与它们的同源框照常
可用。磁盘上钉这一头的是 `test/infrastructure-rules.test.mts`（基础设施三格谁都不向上引：
`theme-component-page` 引不到本包）与 `tools/scripts/verify-chain.mts`（按生成的那张表查三条
API 键各自引用自己的登记名，`iframe:` 只多出一条、不替谁兜底）；真把本包从站点里卸掉跑一遍
记在仓库根的验收清单里。

## 落点：机制层判表，本层只交组件

这一族不再自己提供 `DocItem`，本层也没有任何「这一页归谁」的代码：`loadContent()` 交回一条
规则，机制层那份 `DocItem` 按站点那一列 `rules` 判，命中后因为这条规则没写 `render`（缺省
`page`），直接把本层的 `@theme/ExternalFrame` 铺在文档里 —— 不走那条 `/__component-frame` 的
同源框路由，因为框里是**别人的**文档，跨源，没有东西可送。

早期版本落在 `DocItem/Content`，为的是保住文档外壳；那时踩过一个坑 —— 官方 `DocItem` 渲染的是
`<DocItemLayout><MDXComponent /></DocItemLayout>`，**`props.children` 它一个字都不读**，把 iframe
当 children 塞给 `DocItem` 会静默丢掉（构建产物里 `iframe` 标签数为 0）。现在替换的是整个
`DocItem`，那一条不适用；留着它是提醒：别把 `<iframe>` 塞进一个只渲染 `props.content` 的壳里。

## 服务端那一遍与浏览器那一遍

`externalFrameURL()` 要 `window.location.origin`（补相对地址）和当前地址栏的 `search`
（`?path=` 那一层），两者服务端都拿不到，所以 SSR 那一遍走 `httpsOnHttpsSite()`：只把绝对
`http:` 升成 https，相对写法一个字不碰。这个框先加载、后由 React 改 `src`，构建产物里留着
http 的话线上首屏还会先撞一次混合内容；把相对地址在构建期钉死成某个 origin，则会让本地
`serve` 与 e2e 上同一个框指向站点配置里的域名。

`?path=` 只在那一个参数上解码，收尾**不再**对整串做二次解码 —— 旧写法那样会把地址里合法的
`%` 序列解坏（`a=%25` 变成 `a=%`、`/a%2Fb` 变成 `/a/b`）。`src` 是相对写法时 `?path=` 展开不了
（基准就是那条地址本身），这时交回 `src` 而不是抛：任何人都能手工拼一条带 `?path=…` 的链接
打开这一页，一条拼错的链接不该把整页弄崩。

## 开发模式与构建产物同一个行为

`iframe:` 曾经在开发模式给的是链接（本地改动会不断重载被嵌的页面，太吵），那条分支已经删掉。
现在 `pnpm start` 与构建产物都直接嵌 iframe，要看真的 iframe 不用先构建。

## 编译口径

`src/index.mts` 进 `tsc`（差量清单与理由记在仓库根 README 的「构建包的编译口径」，这里不抄
第二份）。本包自己的几格：

- 入口里的 `getThemePath()` 返回 `../theme` —— 相对的是**产物**目录（`dist/`），不是 `src/`。
- `src/` 只剩入口一份。原来陪它的三份（注册表、交出清单、安装前提）都随上面那张表走了：
  前两份删掉，第三份搬进机制层。
- 层、`components/` 与 `lib/` 都不进构建项目，`files` 因此是
  `["components", "dist", "lib", "theme"]` 四格。只发 `dist` 的话，包装上站点会报层目录不存在；
  `lib` 少了，`theme/ExternalFrame` 引的那份地址算法在装好的站点里就断了。
- `docs/` **不进** `files`（本包的维护者文档与各层的 `docs/internals.md` 都算这一格）：发布只带
  站点运行时与类型要吃的东西，实现记录留在仓库里读。代价是发布包那份 README（npm 无条件带上）
  里指向 `docs/…` 的链接对装包的人是断的 —— 认这个代价，因为少一份要点名、会和源码漂移的产物更贵。
- 「谁来编本包未编译的 TS 源码」不归本包：官方 babel 规则排除 `node_modules`，不补的话 npm 安装后
  层源码报 `Module parse failed` —— 那一格由
  `@show-docs/docusaurus-plugin-prev-layer-resolver` 一处认领（按 `@show-docs` 这个 scope，
  判据在它的 `src/source-js-rule.mts`）。口径见仓库根 README 的「构建包的编译口径」，与解析器包
  [internals](../../plugin-prev-layer-resolver/docs/internals.md) 的「谁来编未编译的 TS 源码」一节。
- 改 `theme/` 与 `components/` 不用先编译，`pnpm start` 直接生效；改入口要 `pnpm build:core`。
  这些未编译的源码归仓库根 `tsconfig.json` 检查，所以 `pnpm lint:type` 就是它们的门：
  `@docusaurus/router` / `@docusaurus/useDocusaurusContext` / `@docusaurus/useIsBrowser` 那几条
  别名靠仓库根那份 `module-aliases.d.ts`。
- 覆盖率红线扫的是 `packages/*/src/**` 与 `packages/theme-iframe/lib/**`，所以
  `lib/external-url.ts` 这一份要有单测钉到 100%（`test/external-url.test.mts`）；`theme/`
  那一格是浏览器代码，由 e2e 那两条用例钉。
