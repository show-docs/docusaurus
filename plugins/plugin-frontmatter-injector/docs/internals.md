# plugin-frontmatter-injector：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：路线的取舍、踩过的坑与实测证据、升级时要复跑的检查单。
使用者侧的事实（接入、规则表、口径）在 [`../README.md`](../README.md)。

## 组成

| 文件             | 职责                                                     |
| ---------------- | -------------------------------------------------------- |
| `src/index.mts`  | 插件入口：`contentLoaded` 里包装站点那份 `parseFrontMatter` |
| `src/rules.mts`  | 自带那份规则表（`defaultRules`），纯数据                 |
| `src/inject.mts` | 纯函数：路径匹配 / 补值 / 套在解析结果上                 |
| `src/wrap.mts`   | 纯函数：把注入包在某个解析器外面，带幂等记号             |
| `src/types.mts`  | 公共类型                                                 |

源码在 `src/`，`dist/` 是编译产物（`rootDir` = `src/`），改完源码要 `pnpm build:core`。

## 为什么是这条路

frontmatter 有三条消费路径，弄清它才谈得上「注入点」：

| 消费方                                | 什么时候读 | 从哪读                              |
| ------------------------------------- | ---------- | ----------------------------------- |
| docs / blog 插件（`contentLoaded`）   | 产出侧边栏、`slug`、`draft` 标记 | `markdown.parseFrontMatter`         |
| `@docusaurus/mdx-loader`（每个 md）   | 生成 `export const frontMatter = {…}` | 同一个 `markdownConfig.parseFrontMatter` |
| 浏览器                                | `props.content.frontMatter.xxx` | mdx-loader 的产物                   |

关键事实：**mdx-loader 不自己解析 yaml**，它调的是 `options.markdownConfig.parseFrontMatter`，
而这个 `markdownConfig` 在 docs 插件里就是 `context.siteConfig.markdown` **本身**（同一个对象引用，
不是拷贝）。于是四条路线的取舍是：

| 路线                                        | 能做到                                   | 代价                                                                     |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| 换掉 `markdown.parseFrontMatter`（本包）    | 元数据与 MDX 产物同时变                  | 接管站点级单例，必须自己维护「谁包谁」与幂等                             |
| `markdown.preprocessor`                     | 改 yaml 文本本身，后续一切自然生效       | 它是 `markdown` 的配置项，**插件在 init 阶段改已经太晚**；且全局无过滤    |
| `enforce: 'post'` 的 webpack loader         | 给 MDX 产物多加一个命名导出              | 改不了 `frontMatter`（同名导出会 `Duplicate declaration`），只能开旁路通道 |
| 直接改磁盘上的 md                           | 最直观                                   | 构建有副作用、dev 模式反复重编译、CI 上脏工作区                          |

本包选第一条。第二条留给「要让 markdown 之外的工具也看见」的场景，那条不是插件能封装的。

## 四个坑

1. **`siteConfig.markdown` 是插件之间的共享可变对象。** `initPlugins()` 用 `Promise.all()`
   把所有插件一起起跑，构造函数里「读到什么」取决于谁先跑完。所以**接线放在 `contentLoaded`**：
   那一阶段所有插件都已初始化完，此时取到的 `parseFrontMatter` 是别人写完的那一份。
2. **别覆盖，要包装。** 站点自己可能在 `markdown.parseFrontMatter` 里接 CMS。后跑的插件直接赋值
   = 把先跑的那份整个吞掉，而且不报错。`wrapParseFrontMatter()` 的语义是「`base` 先跑，
   注入叠在结果上」，于是三份（官方的、站点的、本包的）能叠成一条链。
3. **参数必须原样透传。** mdx-loader 每次调用都会带 `defaultParseFrontMatter`，而站点可能根本
   没在配置里写 `parseFrontMatter`（那时 `siteConfig.markdown.parseFrontMatter` 是官方填进去的
   默认值，未必等于 loader 手上那份）。抓闭包里的那份、或替调用方兜一个默认值，都会让「两处
   版本错位」变成两份不同的 frontmatter —— 前端一份、侧边栏一份，查起来极贵。
4. **`reloadSite()` 会重跑插件。** dev 模式下改 `docusaurus.config.mjs` 就是这样重来的。同一份
   解析器被套两次，每条规则就算两次。所以包装层带一个 `Symbol.for(...)` 记号，见到记号直接
   交回同一个函数，不会套第二层。

## 规则表的两条语义

- **只补不覆盖**：键已经在了就不碰、算值那一步也不跑。理由是「规则表」不该变成「谁来都能改
  站点写过的东西」。
- **函数不拿原值**：上一条决定了键不存在才会算，所以函数签名里没有 `current`。要按原文推值就
  自己去问 `context`（`filePath` 与此刻的 frontmatter 都在里面）。返回 `undefined` = 不表态，
  那一格不写、也不计入改动 —— 否则 frontmatter 上会多出一格 `key: undefined`
  （`Object.keys` 数得着、`JSON.stringify` 看不见）。

## 已知限制

**这条路上没有任何钩子能拦住「后来者直接替换 `parseFrontMatter`」。** 插件是直接赋值的，
docusaurus 之后也不会再回头检查。要降低风险只有一条：本插件放在 `plugins` 数组里靠前的位置，
让自己的包装成为「先包的那一层」，后来者即便是替换，至少替换掉的是一份能跑的实现
（而不是把三份全丢掉）。这是约定，不是护栏。

## 升级检查单

`parseFrontMatter` 是官方配置项（`@docusaurus/types` 的 `MarkdownConfig`），但下面这两条是
**时序**结论，不是承诺。升 core 之前/之后跑一遍：

1. `node_modules/@docusaurus/core/lib/server/plugins/plugins.js` 里
   `executePluginContentLoading()` 仍在 `loadContent()` **之后**调 `contentLoaded()`；
2. `node_modules/@docusaurus/mdx-loader/lib/loader.js` 里 `loadMDX()` 仍读
   `options.markdownConfig.parseFrontMatter`（而不是自己 import 一份）；
3. `@docusaurus/plugin-content-docs` 仍从 `context.siteConfig.markdown` 解构 `parseFrontMatter`；
4. `pnpm test`（`test/frontmatter-injector.test.mts` 里有一条用例真的调
   `@docusaurus/utils` 的 `DEFAULT_PARSE_FRONT_MATTER`，第 1、2 条漂了它会红）；
5. `pnpm build` 之后读一眼产物：`.docusaurus/docusaurus-plugin-content-docs/default/*.json` 的
   `frontMatter` 里有注入的键，`build/assets/js/*.js` 里能找到 `markmap:{enabled:!1}`。

第 5 条是唯一「从产物回读」的判据，也是唯一能证伪「注入只在侧边栏生效、MDX 那边没跟上」的
那条分支的判据 —— 两条路读的是同一个函数，但它们不是同一次调用。
