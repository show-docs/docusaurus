# theme/theme-iframe

主题包：md 的 frontmatter 写 `iframe: <目标 URL>` 时，那一篇文档页**整页**换成那个页面 ——
命中的那一页不再有文档正文外壳（面包屑、正文、翻页、右侧目录），只剩站点的 navbar。

入口只声明层目录（`getThemePath()`，另有一条给 `docusaurus swizzle` 用的
`getTypeScriptThemePath()`）—— 不做解析、不带 loader。

## 状态：已接入站点

`docusaurus.config.mjs` 的 `plugins` 里排在 `@show-docs/docusaurus-theme-markmap` **之后**，
站点根的 `package.json` 声明了
`"@show-docs/docusaurus-theme-iframe": "workspace:^"`。`pnpm build` 与 `pnpm verify:chain` 都绿，
推导出的层栈里有 `theme/theme-iframe/theme`。这一层提供的是 `DocItem`，与 `theme-markmap`、
`theme-stoplight`、`theme-redoc` 同一个键，所以它的 `@theme-prev/DocItem` 落回 `theme-markmap`
那一层；`DocItem/Content` 那根链上现在只有官方一份实现。

产物侧能看到的是这一层进了链、`components/iframe.css` 编译进了站点样式；页面里真的嵌出外部
站点只能在浏览器看（`pnpm build && pnpm serve`）。浏览器里的实测记在仓库根的 e2e
（`test/e2e/features/iframe.feature`，跑法见 [`test/README.md`](../../test/README.md)）。

包名挂 `@show-docs/`，与仓库其它包同一域，所以列进 `test/plugin.test.mts` 那条分包用例的目录清单
只差改清单本身。

## 组成

| 文件                      | 编译吗              | 职责                                                                            |
| ------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| `src/index.mts`           | ✅ `src/` → `dist/` | 插件入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算，就是 `../theme`） |
| `theme/DocItem/index.tsx` | ❌ 站点编译         | 层里的组件：命中 frontmatter 时整页换成 `FramePage`，否则整个交回下层           |
| `components/iframe.tsx`   | ❌ 站点编译         | `FramePage`：算最终 URL，渲染那一个 `<iframe>`                                  |
| `components/iframe.css`   | ❌ 站点编译         | 全局样式（`.iframe` 与让位的 `.container`），放在用它的组件旁边                 |
| `module-aliases.d.ts`     | 类型                | 引官方 `@docusaurus/module-type-aliases`，给构建期才存在的那些 import 补类型    |
| `tsconfig.build.json`     | ——                  | 构建项目：只有 `src/`，所以本包的产物出口是 `dist/index.mjs`                    |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/` 里的
`.tsx`，本包就不编译第二遍。口径的产地在仓库根 README 的「构建包的编译口径」。

## 怎么用

```md
---
title: 外部文档
iframe: https://example.com/handbook/
---
```

命中的页面上，整个 `DocItem` 换成 iframe —— 这一页 markdown 的正文在渲染后的页面上看不到，
和 `theme-stoplight`、`theme-redoc` 那个「整页交给渲染器」是同一类取舍。
没写这个键的文档页照常走下层实现，本层等于透明。

URL 的算法（`getURL`）分三步，只有浏览器端才会全走完：

1. `src` 以 `/` 开头 → 按当前站点的 origin 补成绝对地址；否则原样用。
2. 地址栏带 `?path=<相对路径>` → 以第 1 步的结果为基准再解一层（用来切外部站点的子页）。
3. 整体 `decodeURIComponent` 一次。

服务端渲染阶段拿不到 `window`，所以那时 `url` 就是 frontmatter 里那个原值。

> 开发模式（`pnpm start`）与构建产物现在是同一个行为：直接嵌 iframe。以前这一层在开发模式给
> 的是链接（本地改动会不断重载被嵌的页面，太吵），那条分支已经删掉；要看真的 iframe 不再需要
> 先构建。

## 放在层栈的哪一处

本包覆盖的是 `DocItem`，与 `theme-markmap`、`theme-stoplight`、`theme-redoc` 同一个键，
`plugins` 里的先后因此会改变结果：越靠外的一层先判自己那个键。

- 与 `theme-markmap` **并存**：那一层把导图插在 `DocItem` 前面，本层换的是它插进去包着的
  那一格 `DocItem`，所以同一页两个键都命中时两样都在（导图在上、iframe 在下；按机制说的，
  站点没有这样一页，未实测）。
- 与 `theme-stoplight`、`theme-redoc` **互斥**：那两层排在本站配置里本层之外，命中
  `oas3:` / `redoc:` 时不包下层 `DocItem`，本层轮不到 —— 同一页同时写两个键时只有更外那层出现。

> **落点为什么是 `DocItem`**：这一层命中时**不包**下层 `DocItem`，与上面两层同形。
> 早期版本落在 `DocItem/Content`，为的是保住文档外壳；那时踩过一个坑——官方 `DocItem` 渲染的是
> `<DocItemLayout><MDXComponent /></DocItemLayout>`，`MDXComponent` 就是它的 `props.content`，
> **`props.children` 它一个字都不读**，把 iframe 当 children 塞给 `DocItem` 会静默丢掉
> （构建产物里 `iframe` 标签数为 0）。现在这一层根本不使用 children，那个坑不成立。

## 编译口径

只有 `src/index.mts` 进 `tsc`（差量清单与理由记在仓库根 README 的「构建包的编译口径」，
这里不抄第二份）。本包自己的四格：

- 入口里的 `getThemePath()` 返回 `../theme` —— 相对的是**产物**目录（`dist/`），不是 `src/`。
- 层与组件不进构建项目，`files` 因此要点名三份：`["dist", "theme", "components"]`。只发 `dist`
  的话，包装上站点会报层目录不存在。
- `components/iframe.css` 与用它的组件同目录，`theme/DocItem/index.tsx` 里的动态 import 写的是
  `../../components/iframe.tsx` —— 磁盘上就是这个文件，未编译这一侧不存在「产物名改写」。
- 改 `theme/` 与 `components/` 不用先编译，`pnpm start` 直接生效；改入口才要 `pnpm build:core`。
  这两份未编译的源码归仓库根 `tsconfig.json` 检查，所以 `pnpm lint:type` 就是它们的门：
  `@theme-prev/DocItem` 的类型产地在解析器包里
  [`types/theme-specifiers.d.ts`](../../plugins/plugin-prev-layer-resolver/types/theme-specifiers.d.ts)，
  `@docusaurus/router` 那几条靠包根的 `module-aliases.d.ts`；
  `@theme-prev/X` 的语义见
  [plugin-prev-layer-resolver 的 README](../../plugins/plugin-prev-layer-resolver/README.md)。

## 已知的边界

- 外部站点自己设了 `X-Frame-Options` 或 CSP 的 `frame-ancestors` 时，iframe 位置会是空白 ——
  那是浏览器拒绝嵌它，不是本包的失败，构建与渲染都是绿的。
- iframe 里的内容与站点主题、暗亮模式、路由都不相干：本层只负责给一个 `src`。
  嵌的是**外部站点**时只能这样（跨源，也没有对方的代码可配合）。站点上另一处 iframe 不是这一层
  放的：[`theme-redoc`](../theme-redoc/README.md) 命中页那个框装的是**本包自己那条页面**
  （`/redoc-view`，同源），所以那边能把亮暗模式与地址栏里 `#` 那一段两份文档对齐 —— 做法与代价
  记在它自己的 README，本层不跟着改。
- 命中的那页连官方 `DocItem/Metadata` 一起不要，所以浏览器标签页的标题与 `<meta description>`
  退回站点名，不跟这一页的 `title:` / `description:` 走。
- `components/iframe.css` 是**全局**样式：`.container:has(iframe)` 按「这一格里有 iframe」匹配，
  正文里手写的 iframe 也会让承载它的容器去掉内边距；`.iframe` 这个类名因此是全站的。
  站点上现在确实有第二种 iframe：`theme-redoc` 命中页那一个（类名 `.redoc-frame`），所以这条规则
  也会打到那一页 —— 与它自己要的那一格同方向（都是去掉内边距与最大宽度），效果没有冲突。
  它**不复用**这个选择器，自己按类名声明边界：哪天本层的这一条改了口径，那边要跟着红而不是静默跟着变。
