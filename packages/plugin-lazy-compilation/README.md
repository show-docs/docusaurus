# @show-docs/docusaurus-plugin-lazy-compilation

开发期插件，只做一件事：`docusaurus start` 下给**客户端** webpack 编译开 `lazyCompilation` ——
页面与依赖按需编译，首屏更快。生产构建与服务端编译一律不动。

没有选项，也没有主题目录。

## 安装

```bash
pnpm add @show-docs/docusaurus-plugin-lazy-compilation
```

需要 Docusaurus `^3.9.2` 与 Node `^24`。版本停在 `0.0.0`（还没正式发版）。

## 使用

按包名挂进 `plugins`，没有选项，顺序无关（它不读别的插件，别的插件也不读它）：

```js
// docusaurus.config.mjs
export default {
  plugins: ['@show-docs/docusaurus-plugin-lazy-compilation']
};
```

## 什么时候生效

判据是 `NODE_ENV`，不用额外设环境变量 —— 这两档都是 Docusaurus 自己置的：

| 命令               | `NODE_ENV`                 | 结果                                       |
| ------------------ | -------------------------- | ------------------------------------------ |
| `docusaurus start` | `development`（CLI 默认）  | 客户端编译开 `experiments.lazyCompilation` |
| `docusaurus build` | `production`（build 强制） | 不动 experiments，保持官方默认             |
| `docusaurus serve` | ——                         | 只伺服 `build/` 里的产物，压根不跑编译     |

服务端那一份编译（`isServer`）同样不动：按需编译只对浏览器 bundle 有意义。

装上的是 webpack 原生那两格 —— `{ entries: true, imports: true }`：入口与动态 import 都按需
编译。`configureWebpack` 改的是传进来的那份 config，且只补 `lazyCompilation` 这一格：
`experiments` 里已有的键与别的键都原样留着。

## 为什么是插件

`configureWebpack` 不在 Docusaurus 的配置 schema 里：写在 `docusaurus.config.mjs` 顶层会被
`These field(s) ("configureWebpack",) are not recognized` 直接拒收。它只能是插件的生命周期
方法，所以这一格收成一个插件、站点按包名挂上 —— 按包名而不是相对路径，移动目录不用改配置。

## 不在层栈里

它没有主题目录，也没有 `getThemePath()`，所以层栈推不出它那一格 —— 判据在
`packages/plugin-prev-layer-resolver/src/layers.mts`（没有主题目录的插件不产生层）。站点那几层
主题怎么串，见 [`plugin-prev-layer-resolver` 的 README](../plugin-prev-layer-resolver/README.md)。

## 形态

构建包：源码在 `src/index.mts`，`pnpm build:core`（`tsc -p tsconfig.build.json`）编译出
`dist/`，包出口是 `dist/index.mjs`（Docusaurus 按包名解析到它，由 jiti 加载那份 ESM 产物）。
入口按契约只读 default 导出。

## 已知限制

- **只对 webpack 生效。** `experiments.lazyCompilation` 是 webpack 5 的那一格；站点若换
  bundler（`future.faster.rspackBundler`），这一格要重新确认。
- **只管开发服务器。** 构建产物里没有它留下的任何东西：`build` 是全量编译的，预览看到的也就
  不是「第一次打开才编译」的那份。
- **冷启动的第一个页面更慢。** 按需编译的边界跟着 webpack 走：第一次打开某一页时才开始编
  那一页与它那一支依赖。这是这个开关本身的性质，不是本插件加的。
