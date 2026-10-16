# theme/theme-stoplight

主题包：md 的 frontmatter 写 `oas3: <URL>` 时，该文档页整页换成
[Stoplight Elements](https://github.com/Stoplight/stoplight-elements) 渲染的 OpenAPI 文档。

入口做三件事：声明层目录，在构建配置期改 PostCSS 管道（把 `@stoplight/elements` 的全局样式
圈进 `.stoplight-root`），以及给浏览器 bundle 补 Node 侧的依赖（`url` / `buffer` 两个 polyfill 包，
加一份 `process` 全局 shim）。

## 状态：已接入站点

`docusaurus.config.mjs` 的 `plugins` 里排在最后（层栈最外），站点根的 `package.json` 声明了
`"@show-docs/docusaurus-theme-stoplight": "workspace:^"`。`pnpm build` 与 `pnpm verify:chain` 都绿，
层栈里能看到 `theme/theme-stoplight/theme`。

已实测到的：`@stoplight/elements` 进了懒加载 chunk（没命中 `oas3` 的页面不会下载它）、
PostCSS 那一步的改写落在产物 CSS 里（`.stoplight-root .sl-elements*`、
`[data-theme=light] .stoplight-root`），站点自己的 chrome（`.navbar` / `.footer` / `.container`）
一条都没被前缀。**没实测到的**：浏览器里那一页真正渲染出 API —— 本地起 dev server 这一步不在
自动门禁里，需要时 `pnpm start` 开一页 `oas3: <URL>` 自己看。

## 组成

| 文件                          | 编译吗              | 职责                                                                                                                                                                                                                      |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`               | ✅ `src/` → `dist/` | 入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算就是 `../theme`），加 `configurePostCss()` 与 `configureWebpack()`                                                                                                |
| `theme/DocItem/index.tsx`     | ❌ 站点编译         | 层里的组件：命中 `oas3` 时整页换成 `StoplightUI`，没命中就交回下层 `DocItem`                                                                                                                                              |
| `components/stoplight-ui.tsx` | ❌ 站点编译         | 只在浏览器端渲染 `API`（SSR 阶段返回 `null`），`url` 走 `apiDescriptionUrl`，`data` 走内联文档                                                                                                                            |
| `components/stoplight-ui.css` | ❌ 站点编译         | 本包自己那部分版式（高度、把 `pre` / 链接的默认样式还原给站点主题）                                                                                                                                                       |
| `module-aliases.d.ts`         | 类型                | 引官方 `@docusaurus/module-type-aliases`，给 `useIsBrowser` 与 `*.css` 这些构建期才存在的 import 补类型。`@stoplight/elements` 自己那一格（`exports` 里没 `types`）由仓库根 `tsconfig.json` 的 `paths` 补，只影响类型检查 |
| `tsconfig.build.json`         | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                                                                                                                                                    |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。
版式那份本来是 `.scss`，站点没有 scss 规则（内置的只有 css），所以按嵌套展开拍平成了 `.css`。
组件的 props 是**两支的并集**（给 `url` / 给内联 `data`）：`@stoplight/elements` 的 `APIProps`
就是这个形状，两个 prop 同时出现谁都不落，所以组件里按 `url` 分叉渲染，而不是把另一支传 `undefined`。

## 怎么用

```md
---
title: 订单 API
oas3: https://example.com/openapi.yaml
---
```

命中时本层**不包下层 `DocItem`**（与 `theme-iframe` 那层不同），所以那一页不会有文档正文外壳、
也不会再有导图。要「其它页照常、这页是 API 文档」就是这个位置；想让它嵌在 `DocItem` 的正文区里，
改 `theme/DocItem/index.tsx` 的那一支返回，别改层栈顺序。

## 样式怎么圈住

`@stoplight/elements` 的样式表是全局选择器，直接引进来会染到整站。入口的 `configurePostCss()`
只挂一个插件 —— `postcss-prefixwrap`：

- `whitelist` 按**文件路径**筛（每一项都按正则解析），只放行路径含 `@stoplight` 的样式表，
  站点自己的 CSS 不在名单里，所以不动。
- `prefixTransform` 接住「加前缀」这一步：它拿到的是**还没加前缀的原始选择器**与前缀本身，
  返回什么就是最终的选择器。`[data-theme=light|dark]` 打头的那几条要特殊办 —— 暗亮属性挂在
  `<html>` 上，是 `.stoplight-root` 的**祖先**，默认那种「前缀打头」的拼法（
  `.stoplight-root [data-theme=dark] …`）一条都不命中，得写成
  `[data-theme=dark] .stoplight-root …`。

`.stoplight-root` 这个类名由 `components/stoplight-ui.tsx` 挂在最外层 `div` 上，站点侧不要改名。

> 这一格原来站的是 `postcss-plugin-matcher` + `postcss-faster-namespace`：先由前者筛文件、
> 后者把**已经加好前缀**的选择器重排回来。`postcss-faster-namespace` 在 npm 与 GitHub 上都已
> 被作者删除，我们一度把它抄进仓库；后来发现 `postcss-prefixwrap` 自己就有等价的钩子
> （`1.58.0` 起），抄本与 matcher 就一起撤了。换之前把两条管线跑在同一个输入上比对过：真实样式表
> 里那 10 条 `[data-theme=…]` 选择器（含 `.sl-inverted` 的层层链），加上 `body`、`@keyframes`
> 与属性在中间的样本，输出逐字节一致。

## 浏览器 bundle 要补的三样 Node 侧依赖

两种形状，补法不一样：

**① `require('url')` / `require('buffer')`** —— `@stoplight/json-schema-ref-parser` 里
`require('url')`、`@stoplight/yaml-ast-parser` 里 `require('buffer')`。webpack 5 起不再自动补
Node 核心模块，站点构建会直接 `Module not found`。入口的 `configureWebpack()` 给客户端那一遍
在 `resolve.fallback` 里配上 `url` / `buffer` 两个 polyfill 包（本包 `dependencies`），
服务端那一遍原样返回：SSG 跑在 Node 里，那两个模块本来就有。
补的是真 polyfill，不是 `false`：这两个都走在「按 URL 取 schema」那条路上，置空会在运行时抛。

**② 裸的全局 `process`** —— `@stoplight/json-schema-ref-parser` 的 `lib/util/url.js` 与
`lib/resolvers/http.js` 里写的不是 `require('process')`，而是直接取 `process.browser` /
`process.cwd()` / `process.platform`。`resolve.fallback` 只按**模块 id**筛，管不到自由变量，
所以浏览器里求值这个 chunk 就 `ReferenceError: process is not defined`（构建期不报，
只有页面打开时看得到）。补法是 `ProvidePlugin`：把 `process` 这个标识符在每个模块作用域里换成
对 `process/browser` 的 require，同一份路径也进 `resolve.fallback`。插件构造函数取自
`configureWebpack` 第三个参数的 `utils.currentBundler.instance`（官方就是用它自己的
`DefinePlugin`，这样不必把 `webpack` 声明成本包依赖）。

> 那份 shim 只给 `process.env` / `nextTick` / `cwd()`（返回 `/`），**没有** `process.browser`
> —— 取到 `undefined`，那几个分支走非浏览器一侧。示例页用的是站点根绝对路径 `/openapi.yaml`，
> 所以结果一样；要嵌相对路径的 spec，得再把它显式设成 `true`。

> **改了 `configureWebpack()` 要 `pnpm clear` 再 `pnpm build`**：webpack 的持久化缓存不认配置函数的
> 改动，实测第二次构建客户端 chunk 的哈希都没变（shim 根本没进产物），清掉缓存才生效。

返回的形状只可能是**增量**（`{ resolve: { fallback: ... }, plugins: [...] }`），不能改完整个
`config` 再返回去 —— 官方 `applyConfigureWebpack` 用 webpack-merge 拼接，数组策略是 concat，
返回整体等于把 `rules` 翻倍，症状是「每个 `.module.css` 被 css-loader 处理两遍、
第二遍拿到的是上一遍的 JS 产物」。这条坑与 `plugins/plugin-prev-layer-resolver`
里「只返回自己那一个 resolver」是同一件事。
