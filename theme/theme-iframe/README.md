# theme/theme-iframe

主题包：md 的 frontmatter 写 `iframe: <目标 URL>` 时，该文档页把**正文区**换成那个外部页面，
文档外壳（面包屑、页脚、翻页）照旧。

入口只声明层目录（`getThemePath()`，另有一条给 `docusaurus swizzle` 用的
`getTypeScriptThemePath()`）—— 不做解析、不带 loader。

## 状态：已接入站点

`docusaurus.config.mjs` 的 `plugins` 里排在 `@show-docs/docusaurus-theme-markmap` **之后**，
站点根的 `package.json` 声明了
`"@show-docs/docusaurus-theme-iframe": "workspace:^"`。`pnpm build` 与 `pnpm verify:chain` 都绿，
推导出的层栈里有 `theme/theme-iframe/theme`，`@theme-prev/DocItem/Content` 落回 theme-classic
那一层（`DocItem/Content` 这根链上目前只有官方与本包提供它）。

产物侧能看到的是这一层进了链、iframe 那份 CSS Module 被编译进站点样式；页面里真的嵌出外部站点
只能在浏览器看（`pnpm build && pnpm serve`，开发模式按设计不嵌 —— 见上面那条注）。
浏览器里的实测记在仓库根的 e2e（`test/e2e/iframe.spec.mts`，跑法见
[`test/README.md`](../../test/README.md)）。

包名挂 `@show-docs/`，与仓库其它包同一域，所以列进 `test/plugin.test.mts` 那条分包用例的目录清单
只差改清单本身。

## 组成

| 文件                              | 编译吗              | 职责                                                                            |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `src/index.mts`                   | ✅ `src/` → `dist/` | 插件入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算，就是 `../theme`） |
| `theme/DocItem/Content/index.tsx` | ❌ 站点编译         | 层里的组件：命中 frontmatter 时把正文那一格换成 `FramePage`，否则原样交回下层   |
| `components/iframe.tsx`           | ❌ 站点编译         | `FramePage`：算最终 URL、开发模式给链接、生产模式给 `<iframe>`                  |
| `components/iframe.module.css`    | ❌ 站点编译         | CSS Module（`.iframe` / `.center`），放在用它的组件旁边                         |
| `module-aliases.d.ts`             | 类型                | 引官方 `@docusaurus/module-type-aliases`，给构建期才存在的那些 import 补类型    |
| `tsconfig.build.json`             | ——                  | 构建项目：只有 `src/`，所以本包的产物出口是 `dist/index.mjs`                    |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/` 里的
`.tsx`，本包就不编译第二遍。口径的产地在仓库根 README 的「构建包的编译口径」。

## 怎么用

```md
---
title: 外部文档
iframe: https://example.com/handbook/
---
```

命中的页面上，正文那一格（官方 `DocItem/Content`）整个换成 iframe —— 这一页 markdown 的正文
在渲染后的页面上看不到，和 `theme-stoplight` 那个「整页交给渲染器」是同一类取舍。
没写这个键的文档页照常走下层实现，本层等于透明。

URL 的算法（`getURL`）分三步，只有浏览器端才会全走完：

1. `src` 以 `/` 开头 → 按当前站点的 origin 补成绝对地址；否则原样用。
2. 地址栏带 `?path=<相对路径>` → 以第 1 步的结果为基准再解一层（用来切外部站点的子页）。
3. 整体 `decodeURIComponent` 一次。

服务端渲染阶段拿不到 `window`，所以那时 `url` 就是 frontmatter 里那个原值。

> **开发模式（`pnpm start`）故意不嵌 iframe**：本地改动会不断重载外部页面，太吵。
> 这时页面上是一段提示加一个可点开的链接，指向算出来的同一个 URL；要看真实效果得用构建产物
> （`pnpm build && pnpm serve`）。判据是 `process.env.NODE_ENV !== 'development'`。

## 放在层栈的哪一处

本包覆盖的是 `DocItem/Content`，不是 `DocItem`：官方结构里 `DocItem`（theme-classic、
`theme-markmap`、`theme-stoplight` 覆盖的是它）里面才是 Layout 留给正文的那一格。
这一层因此不用挑位置，`plugins` 里排在哪个主题之后都不改变结果：

- 与 `theme-markmap` **并存**：那一层的导图是 `DocItem` 的前一个兄弟节点，本层换的只是它里面的
  正文格，所以同一页两个键都命中时两样都在（按机制说的；站点没有这样一页，未实测）。
- 与 `theme-stoplight` **互斥**：那一层命中 `oas3:` 时不包下层 `DocItem`，官方结构里的正文格
  根本不会被渲染，本层轮不到 —— 同一页同时写两个键时只有 Stoplight 出现。

> **落点为什么是 `DocItem/Content` 而不是 `DocItem`**：官方 `DocItem` 渲染的是
> `<DocItemLayout><MDXComponent /></DocItemLayout>`，那个 `MDXComponent` 就是它的
> `props.content` —— **`props.children` 它一个字都不读**。上一版把 iframe 当 children 塞给
> `DocItem`，页面静默退回普通正文，构建产物里 `iframe` 标签数为 0；而当时顺带写的
> `shellPadding={false}` 在官方 `DocItem` 上没有这个 prop。

## 编译口径

只有 `src/index.mts` 进 `tsc`（差量清单与理由记在仓库根 README 的「构建包的编译口径」，
这里不抄第二份）。本包自己的四格：

- 入口里的 `getThemePath()` 返回 `../theme` —— 相对的是**产物**目录（`dist/`），不是 `src/`。
- 层与组件不进构建项目，`files` 因此要点名三份：`["dist", "theme", "components"]`。只发 `dist`
  的话，包装上站点会报层目录不存在。
- 那份 CSS Module 与用它的组件同目录，`theme/DocItem/Content` 里的动态 import 写的是
  `../../../components/iframe.tsx` —— 磁盘上就是这个文件，未编译这一侧不存在「产物名改写」。
- 改 `theme/` 与 `components/` 不用先编译，`pnpm start` 直接生效；改入口才要 `pnpm build:core`。
  这两份未编译的源码归仓库根 `tsconfig.json` 检查，所以 `pnpm lint:type` 就是它们的门：
  `@theme-prev/DocItem/Content` 的类型产地在解析器包里
  [`types/theme-specifiers.d.ts`](../../plugins/plugin-prev-layer-resolver/types/theme-specifiers.d.ts)，
  `*.module.css`、`@docusaurus/router` 那几条靠包根的 `module-aliases.d.ts`；
  `@theme-prev/X` 的语义见
  [plugin-prev-layer-resolver 的 README](../../plugins/plugin-prev-layer-resolver/README.md)。

## 已知的边界

- 外部站点自己设了 `X-Frame-Options` 或 CSP 的 `frame-ancestors` 时，iframe 位置会是空白 ——
  那是浏览器拒绝嵌它，不是本包的失败，构建与渲染都是绿的。
- iframe 里的内容与站点主题、暗亮模式、路由都不相干：本层只负责给一个 `src`。
