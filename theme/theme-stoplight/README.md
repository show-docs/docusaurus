# theme/theme-stoplight

主题包：md 的 frontmatter 写 `oas3: <URL>` 时，该文档页整页换成
[Stoplight Elements](https://github.com/Stoplight/stoplight-elements) 渲染的 OpenAPI 文档。

入口只做两件事：声明层目录，以及在构建配置期改 PostCSS 管道（把 `@stoplight/elements` 的
全局样式圈进 `.stoplight-root`）。

## 状态：还没接入站点，而且依赖装不上

1. `docusaurus.config.mjs` 的 `plugins` 里没有它，站点根的 `package.json` 也没声明
   `"@show-docs/docusaurus-theme-stoplight": "workspace:^"`。要用它得**先补这两处**（只补前一处会
   `Cannot find module`：按包名加载的 importer 必须声明它）。
2. `dependencies` 里的 `postcss-faster-namespace` 写的是 `workspace:^`，但本仓库没有这个包，
   npm 上也查不到（404）。在它落地之前 `pnpm install` 过不去，所以下面这些**都还没实跑过**：
   PostCSS 改写、样式作用域、`API` 组件的渲染。构建绿只绿在入口那份编译上（`tsc` 不碰它）。

## 组成

| 文件                           | 编译吗              | 职责                                                                                               |
| ------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------- |
| `src/index.mts`                | ✅ `src/` → `dist/` | 入口：`getThemePath()` 指向包根的 `theme/`（按产物位置算就是 `../theme`），加 `configurePostCss()` |
| `theme/DocItem/index.tsx`      | ❌ 站点编译         | 层里的组件：命中 `oas3` 时整页换成 `StoplightUI`，没命中就交回下层 `DocItem`                       |
| `components/stoplight-ui.jsx`  | ❌ 站点编译         | 只在浏览器端渲染 `API`（SSR 阶段返回 `null`），`url` 走 `apiDescriptionUrl`，`data` 走内联文档     |
| `components/stoplight-ui.scss` | ❌ 站点编译         | 本包自己那部分版式（高度、把 `pre` / 链接的默认样式还原给站点主题）                                |
| `tsconfig.build.json`          | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                             |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。
组件那一格还是 `.jsx`：`@stoplight/elements` 的类型要装了它才拿得到，而本包的依赖现在装不上
（上面那格），所以先按 JS 写、props 用 `PropTypes` 校验。

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
按顺序挂三个插件：

1. `postcss-prefixwrap`：把选择器统一加 `.stoplight-root` 前缀，`whitelist` 放行 `@stoplight` 那些 at-rule。
2. `postcss-plugin-matcher`：只对路径含 `@stoplight` 的样式表执行下面的插件，别误伤站点自己的 CSS。
3. `postcss-faster-namespace`：把 `.stoplight-root [data-theme=light]` 这类「作用域在前」的选择器
   改写成 `[data-theme=light] .stoplight-root` —— 前者要求根节点自己带 `data-theme`，而暗亮是加在
   `<html>` 上的，不改写就一条都不命中。

`.stoplight-root` 这个类名由 `components/stoplight-ui.jsx` 挂在最外层 `div` 上，站点侧不要改名。
