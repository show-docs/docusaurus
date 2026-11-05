# @show-docs/docusaurus-plugin-lazy-compilation

开发期插件，只做一件事：`docusaurus start` 下给**客户端**编译开 `lazyCompilation` ——
页面与依赖按需编译，首屏更快。生产构建与服务端编译一律不动。这一格在两个 bundler 下各写在哪、
以及站点当前那一支实测到什么，见下面两节。

没有选项，也没有主题目录。

## 安装

```bash
pnpm add @show-docs/docusaurus-plugin-lazy-compilation
```

需要 Docusaurus `^3.9.2` 与 Node `^24`。版本号与发布状态以本包 `package.json` 为准，这里不抄第二份。

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
| `docusaurus start` | `development`（CLI 默认）  | 客户端编译开按需编译（写在哪一格见下一节） |
| `docusaurus build` | `production`（build 强制） | 两处都不动，保持官方默认                   |
| `docusaurus serve` | ——                         | 只伺服 `build/` 里的产物，压根不跑编译     |

服务端那一份编译（`isServer`）同样不动：按需编译只对浏览器 bundle 有意义。

装上的是那两个开关 —— `{ entries: true, imports: true }`：入口与动态 import 都按需编译。
`configureWebpack` 不去改传进来的那份 config，而是**交回只含本包那几格的一小份**：官方那一步
（`@docusaurus/core/lib/webpack/configure.js`）用 webpack-merge 把它并进 config，同级已有的键
（比如 `experiments` 里的持久缓存、`devServer` 里的 host）因此原样留着。

## 这一格住在两个地方

| 当前 bundler | 本插件写的那几格                                      | 另一格写进去会怎样                           |
| ------------ | ----------------------------------------------------- | -------------------------------------------- |
| webpack 5    | `experiments.lazyCompilation`                         | webpack 不认顶层那一格，等于没写             |
| rspack ≥1.x  | 顶层 `lazyCompilation` + `devServer.setupMiddlewares` | `experiments` 里那一格在 rspack 里是废弃写法 |

webpack 那份接请求的后端由它自己随编译起来，所以那一支只有这一格；rspack 把同一件事做成了一份
**必须由开发服务器挂上**的中间件（`rspack.lazyCompilationMiddleware`），官方那份开发服务器是
webpack-dev-server、不会替我们挂，所以这一支多写 `devServer.setupMiddlewares` 那一格。不挂会
怎样、挂上之后实测到什么，见下一节。

用的到底是哪一个 bundler，读 `configureWebpack` 第三份参数里的 `utils.currentBundler.name` ——
那是官方算好的那一份（`@docusaurus/bundler` 的 `getCurrentBundler()`），本包不另判一套，也不用
为此收 Docusaurus 的 context。站点改 bundler 的地方是 `docusaurus.config.mjs` 里的 `future`。

## 挂上之后实测到什么

本站点跑 rspack（Rspack 1.7.12），`docusaurus start` 同一份站点、同一份内容，只把这一支中间件
挂上与不挂对照（2026-11-05）：

| 量                                     | 只写顶层那一格（不挂中间件） | 写那一格 + 挂中间件 |
| -------------------------------------- | ---------------------------- | ------------------- |
| 首屏 `main.js`                         | 约 6.19 MB                   | 约 0.36 MB          |
| `POST /lazy-compilation-using-`        | 无请求（按需编译没起来）     | 每页 200            |
| 页面渲染（首页 / `/themes/` / 各包页） | 正常                         | 正常，与左边一致    |

（字节数两次实测略有浮动 —— 6,190,649 与 356,384 / 357,537 —— 量级不变。）

也就是说：只写那一格确实等于没写 —— 17 倍差距是那份中间件带来的，不是那一格自己带来的。
代价见「已知限制」前两条：每一页首次访问要多等一次「现编」。

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

- **只管开发服务器。** 构建产物里没有它留下的任何东西：`build` 是全量编译的，预览看到的也就
  不是「第一次打开才编译」的那份。
- **冷启动的第一个页面更慢。** 按需编译的边界跟着 bundler 走：第一次打开某一页时才开始编
  那一页与它那一支依赖。这是这个开关本身的性质，不是本插件加的。实测：开发服务器刚起来时
  第一次打开首页，那几秒里页面还是空的（编译完才渲染出来），之后同一页再打开就是现成的。
- **`devServer.setupMiddlewares` 那一格由本插件写，会和官方那份并存成重复。** 官方那份住在
  合并前的默认配置里（`@docusaurus/core/lib/commands/start/webpack.js` 的 `setupMiddlewares`，
  它 unshift 的是错误遮罩要用的 eval-source-map 中间件），而 Docusaurus 用
  `webpack-merge([默认那份, config.devServer])` 合并两格。webpack-merge 6.0.1 遇到同名函数不会
  覆盖，而是把两个函数包成一个、对同一个数组各调一次再把两个返回值串起来 —— 两个函数都往同一份
  数组里 unshift，于是 `[官方, 本插件]` 两格都在、但**各自都注册了两遍**。实测：官方那格照样在
  处理请求（拿一份不存在的 id 去打 `/__get-internal-source`，它自己的报错原样出现在开发服务器
  日志里 —— 那段栈正落在 `evalSourceMapMiddleware.js` 里，说明它确实在跑），按需编译的
  `POST /lazy-compilation-using-` 返回 200，页面正常渲染。同一份中间件被 webpack-dev-server 挂两遍
  不会互相顶掉（第一份接住请求就返回），但这是个真实的存在性代价：以后谁在这同一格加东西，得
  知道它会跟着翻倍。
