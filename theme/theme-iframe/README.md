# theme/theme-iframe

主题包：md 的 frontmatter 写 `iframe: <目标 URL>` 时，该文档页在 `DocItem` 里嵌一个 iframe，
正文换成那个外部页面。

包名 `@eaphone/docusaurus-theme-iframe`，入口只声明层目录（`getThemePath()`，另有一条给
`docusaurus swizzle` 用的 `getTypeScriptThemePath()`）—— 不做解析、不带 loader。

## 状态：还没接入站点

`docusaurus.config.mjs` 的 `plugins` 里没有它，站点根的 `package.json` 也没声明
`"@eaphone/docusaurus-theme-iframe": "workspace:^"`。所以现在只有入口被 `pnpm build:core`
编译过，它既不进层栈、也不在 `pnpm test` 的分包解析用例覆盖里。要用它得**先补这两处**（只补前一处会
`Cannot find module`：按包名加载的 importer 必须声明它）。

顺带一格：包名挂的是 `@eaphone/` 域，而本仓库其它包都挂 `@show-docs/`。
`test/plugin.test.mts` 那条分包用例对包名断言的是 `/^@show-docs\//`，所以把本包列进它的目录清单
之前，得先统一域名，否则红的就是那条断言。

## 组成

| 文件                           | 编译吗              | 职责                                                                            |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------- |
| `src/index.mts`                | ✅ `src/` → `dist/` | 插件入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算，就是 `../theme`） |
| `theme/DocItem/index.tsx`      | ❌ 站点编译         | 层里的组件：命中 frontmatter 时包下层 `DocItem`，塞进 `FramePage`               |
| `components/iframe.tsx`        | ❌ 站点编译         | `FramePage`：算最终 URL、开发模式给链接、生产模式给 `<iframe>`                  |
| `components/iframe.module.css` | ❌ 站点编译         | CSS Module（`.iframe` / `.center`），放在用它的组件旁边                         |
| `module-aliases.d.ts`          | 类型                | 引官方 `@docusaurus/module-type-aliases`，给构建期才存在的那些 import 补类型    |
| `tsconfig.build.json`          | ——                  | 构建项目：只有 `src/`，所以本包的产物出口是 `dist/index.mjs`                    |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/` 里的
`.tsx`，本包就不编译第二遍。口径的产地在仓库根 README 的「构建包的编译口径」。

## 怎么用

```md
---
title: 外部文档
iframe: https://example.com/handbook/
---
```

命中的页面上，`DocItem` 的内边距被关掉（`shellPadding={false}`），iframe 占满正文区域。
没写这个键的文档页照常走下一层实现，本层等于透明。

URL 的算法（`getURL`）分三步，只有浏览器端才会全走完：

1. `src` 以 `/` 开头 → 按当前站点的 origin 补成绝对地址；否则原样用。
2. 地址栏带 `?path=<相对路径>` → 以第 1 步的结果为基准再解一层（用来切外部站点的子页）。
3. 整体 `decodeURIComponent` 一次。

服务端渲染阶段拿不到 `window`，所以那时 `url` 就是 frontmatter 里那个原值。

> **开发模式（`pnpm start`）故意不嵌 iframe**：本地改动会不断重载外部页面，太吵。
> 这时页面上是一段提示加一个可点开的链接，指向算出来的同一个 URL；要看真实效果得用构建产物
> （`pnpm build && pnpm serve`）。判据是 `process.env.NODE_ENV !== 'development'`。

## 放在层栈的哪一处

`DocItem` 这根链上目前提供它的是 theme-classic 与 `theme-markmap`（demo 三个主题只覆盖
`DocItem/Footer`，不算 `DocItem`）。所以 `plugins` 里的位置会直接决定谁生效：

| 位置                             | `@theme-prev/DocItem` 落到   | 结果                                                    |
| -------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `theme-markmap` **之后**（末尾） | `theme-markmap` 的 `DocItem` | ✅ 导图在上、iframe 在正文区，两层串在一根链上          |
| `theme-markmap` 之前             | `theme-classic` 的 `DocItem` | ⚠️ 两层各自包同一个内层，谁在最外谁赢，另一层被静默跳过 |

要「导图 + iframe 同时在同一页生效」就用第一行那个位置。

## 编译口径

只有 `src/index.mts` 进 `tsc`（差量清单与理由记在仓库根 README 的「构建包的编译口径」，
这里不抄第二份）。本包自己的四格：

- 入口里的 `getThemePath()` 返回 `../theme` —— 相对的是**产物**目录（`dist/`），不是 `src/`。
- 层与组件不进构建项目，`files` 因此要点名三份：`["dist", "theme", "components"]`。只发 `dist`
  的话，包装上站点会报层目录不存在。
- 那份 CSS Module 与用它的组件同目录，`theme/DocItem` 里的动态 import 写的是
  `../../components/iframe.tsx` —— 磁盘上就是这个文件，未编译这一侧不存在「产物名改写」。
- 改 `theme/` 与 `components/` 不用先编译，`pnpm start` 直接生效；改入口才要 `pnpm build:core`。
  这两份未编译的源码归仓库根 `tsconfig.json` 检查，所以 `pnpm lint:type` 就是它们的门：
  `@theme-prev/DocItem` 的类型产地在仓库根 [`types/`](../../types/README.md)，
  `*.module.css`、`@docusaurus/router` 那几条靠包根的 `module-aliases.d.ts`；
  `@theme-prev/X` 的语义见
  [plugin-prev-layer-resolver 的 README](../../plugins/plugin-prev-layer-resolver/README.md)。

## 已知的边界

- 外部站点自己设了 `X-Frame-Options` 或 CSP 的 `frame-ancestors` 时，iframe 位置会是空白 ——
  那是浏览器拒绝嵌它，不是本包的失败，构建与渲染都是绿的。
- iframe 里的内容与站点主题、暗亮模式、路由都不相干：本层只负责给一个 `src`。
