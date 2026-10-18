# theme/theme-redoc

主题包：md 的 frontmatter 写 `redoc: <URL>` 时，该文档页整页换成
[Redoc](https://github.com/Redocly/redoc) 渲染的 OpenAPI 文档。

形状与 [`theme-stoplight`](../theme-stoplight/README.md) 是一对一的（入口声明层目录、
层里的 `DocItem` 判 frontmatter、组件只在浏览器端渲染），差的三处是：这一格要补的 Node 侧
依赖不一样、**样式不做前缀圈定**、以及它自带一个路由，得把这一页的地址喂给它（都见下）。

## 组成

| 文件                      | 编译吗              | 职责                                                                                                                       |
| ------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`           | ✅ `src/` → `dist/` | 入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算就是 `../theme`），加 `configureWebpack()`                         |
| `theme/DocItem/index.tsx` | ❌ 站点编译         | 层里的组件：命中 `redoc` 时整页换成 `RedocUI`（并把这一页的 `permalink` 当 `basePath` 交给它），没命中就交回下层 `DocItem` |
| `components/redoc-ui.tsx` | ❌ 站点编译         | 只在浏览器端渲染 `RedocStandalone`（SSR 阶段返回 `null`），`url` 走 `specUrl`，`data` 走内联文档                           |
| `components/redoc-ui.css` | ❌ 站点编译         | 本包自己那部分版式：容器高度，以及用 `:has()` 让正文容器去掉内边距与最大宽度                                               |
| `module-aliases.d.ts`     | 类型                | 引官方 `@docusaurus/module-type-aliases`，给 `useIsBrowser` 与 `*.css` 这些构建期才存在的 import 补类型                    |
| `tsconfig.build.json`     | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                                                     |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

## 怎么用

```md
---
title: 订单 API
redoc: /openapi.yaml
---
```

命中时本层**不包下层 `DocItem`**（与 theme-stoplight 同一位置，与 `theme-iframe` 那层不同），
所以那一页不会有文档正文外壳、也不会再有导图。要「其它页照常、这页是 API 文档」就是这个位置。

## 浏览器 bundle 要补的那一格 Node 侧依赖

`redoc` 发的是**打好的 ESM 包**（`bundles/redoc.js`），不是散着的源码，外面那层 webpack 仍要按
静态分析解析它里面的每一条 `require`。它有一支 Node 分支，先判 `typeof module !== 'undefined'`，
真的一侧去 `new (require('worker_threads').Worker)(…)`，假的一侧 `import('worker_threads')`。

浏览器里那个条件为假、跑不到，但**解析这一步照样红**：`Module not found: worker_threads`。
补法是客户端那一遍在 `resolve.fallback` 里给 `worker_threads: false`（空模块），服务端原样返回 ——
SSG 跑在 Node 里，那模块本来就有。

> 这里选 `false` 而不是 polyfill，与 theme-stoplight 那边给 `url` / `buffer` 配**真** polyfill
> 并不矛盾：那两个是「按 URL 取 spec」这条路上真会执行到的代码，置空会在运行时抛；
> `worker_threads` 那支是给「离线把文档再算一遍」用的，本仓这条路径不碰它，补个 polyfill
> 只是把浏览器 bundle 撑大一圈。

> 同款坑：`configureWebpack()` **只返回自己新增的那一格**，不能改完整个 config 再返回去。
> 细节记在 [`theme-stoplight` 的 README](../theme-stoplight/README.md) 末尾与
> `plugins/plugin-prev-layer-resolver` 的 README。改了它要 `pnpm clear` 再 `pnpm build`：
> webpack 的持久化缓存不认配置函数的改动。

## 样式：这一格不做前缀圈定，外溢是量出来的三条

theme-stoplight 用 `configurePostCss()` + `postcss-prefixwrap` 把第三方全局样式圈进
`.stoplight-root`，靠的是那份 CSS 是**磁盘上的静态文件**、能进 PostCSS 管道。

Redoc 不是：它的样式由 `styled-components` 在**运行时**往 `<head>` 里插一张
`<style data-styled-version>`，构建期产物里根本没有这份 CSS 可供改写。前缀圈定在这个组合下
做不了，所以本包不尝试 —— 代价在浏览器里量了一遍：把那张表的每条规则真的拿去问 DOM，
命中的元素里有没有 `.redoc-root` **之外**的（且改的不是 `--*` 那种自定义变量）。
`redoc@3.0.1` 在这一页恰好三条漏出去：

| 选择器    | 改了什么                                                   | 看得见的后果                                                                    |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `:root`   | `<html>` 上的 `background-color` / `color` / `font-family` | 整页换成 Redoc 的底色与字体（这正是「整页交给它」的样子）                       |
| `:root *` | 全局 `box-sizing: border-box`                              | 站点自己的盒模型跟着变，一般看不出来                                            |
| `button`  | 裸标签选择器（字体、字号、背景、`cursor`…）                | navbar 上那个亮/暗切换按钮 `<button class="clean-btn">` 被 Redoc 的按钮样式接管 |

其余 400 多条规则都以 Redoc 自己生成的类打头（`.YjVcs`、`.bImkMT:hover` 这种），
命中的元素全在 `.redoc-root` 里。离开这一页之后 styled-components 会回收这些规则，
主页上的 `<html>` 与那个按钮实测照旧。

这三条由 `test/e2e/features/redoc.feature` 钉成**等于这个集合**：Redoc 将来多写一条全局规则，
用例就红，文档得跟着改，不会让它静悄悄生效。

要真隔离得换路子：把那一页放进 iframe（`theme-iframe` 那层就是干这个的），
或者选一个样式可作用域化的渲染器（theme-stoplight 那份是静态 CSS，所以圈得住）。

本包自己的版式只有一条 `:has()`：`.container:has(.redoc-root)` 去掉正文容器的内边距与最大宽度，
否则 Redoc 那三栏布局被 Bootstrap 式的 `max-width` 挤在中间。
（stoplight 那层还有一条 `+ .footer` 的规则，这一层没抄 —— 本站 `themeConfig` 里没写
`footer`，那个元素根本不渲染，规则是死的。）

## `basePath`：给错时 Redoc 不报错，而是渲染它自己那份 404

Redoc 3 自带一个 react-router 的 `BrowserRouter`（打好的包里写的是
`typeof window < 'u' ? BrowserRouter : MemoryRouter`），它按 `basePath` 判「当前地址属于哪一格」。
`basePath` 用默认的 `/` 时，页面在 `/redoc-demo`，Redoc 匹配不到任何一条路由，
于是把**它自己那份 404** 摆在正文区 —— 左栏、搜索框、样式全都在，页面看着完全正常，
中间写着 `No page at this address`，**控制台一个字都不报**。

所以层的入口把这一页的地址交给它：`basePath = props.content.metadata.permalink`。
判据钉在 e2e 的那句「Redoc 自己的 404 没有出现」。

## 深链在静态托管上打不开（Redoc 3 的路由是按路径的）

点左栏那条接口，地址变成 `/redoc-demo/orders/createorder`（Redoc 把 `operationId` 小写进地址），
同一页里走没问题。但这是**真路径**，不是 hash：`pnpm build` 出来的产物里没有这一格，
`docusaurus serve` 直接回 404（实测），把地址发给别人也打不开。
dev server 有 history fallback，所以 `pnpm start` 下看起来是好的 —— 别据此判断线上行为。

要能分享深链，得让那一页对任意子路径都返回同一份 HTML（托管侧的 rewrite / SPA fallback），
本仓的静态产物没有这一层。同理，`static/openapi.yaml` 那种「本站的绝对路径」是取得到的，
外网 spec 就要另配 CORS。

## 状态：已接入站点，浏览器里那一页真渲染

`docusaurus.config.mjs` 的 `plugins` 里排在最后（层栈最外），站点根的 `package.json` 声明了
`"@show-docs/docusaurus-theme-redoc": "workspace:^"`。`pnpm build`、`pnpm verify:chain` 与
`pnpm test:e2e` 都绿，层栈里能看到 `theme/theme-redoc/theme`。

已实测到的（都在 `test/e2e/features/redoc.feature` 那条用例里）：`redoc` 进了懒加载 chunk
（`assets/js/460.*.js`，2 MB 上下；没命中 `redoc:` 的页面不下载它）、`/openapi.yaml` 取到了、
左栏三个接口点开就在导航里、点新建订单时详情面板换成它、这一页没有 `<article>` 正文外壳、
`.container` 的内边距是 0、外溢的就是上表那三条，全程没有运行期错误。

顺带记两处不报错的形状：SSR 那一遍本层返回 `null`，所以 `build/redoc-demo/index.html` 里
这一格是空的；`pnpm build` 时控制台会冒一句
`[zustand persist middleware] … 'mosaic-theme' … does not contain a 'removeItem' method` ——
那是预渲染阶段加载 Redoc 模块时它自己的 store 在抱怨，不影响产物，也不是本仓的代码。

没实测到的：`data`（内联文档）那一支只过类型，浏览器里没跑过（示例页走的是 `url`）；
AsyncAPI / GraphQL 那两种 `specType` 没试。
