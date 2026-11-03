# @show-docs/docusaurus-plugin-compile-source

补上 Docusaurus 官方那条 babel 规则漏掉的一格：编译 `@show-docs` 家族**随包发布、尚未编译**的
`.ts` / `.tsx`（各主题层的 `theme/**`、`components/**` 与机制层的 `lib/**`）。缺了它，那些文件在
打包那一步报 `Module parse failed`。

## 接入

```js
// docusaurus.config.mjs
export default {
  plugins: [
    // 编译这一族未编译的 TS 源码（本包）
    '@show-docs/docusaurus-plugin-compile-source'
  ]
};
```

缺本包，这一族的 `.tsx` 没人编。解析器插件是**另一格**、也是另一道题：只在有层真写 `@theme-prev/*`
时才需要注册，只用官方别名的层不引它。本仓的站点把两格都按包名写在 `docusaurus.config.mjs` 的
`plugins` 里（站点 `src/theme` 那几份写 `@theme-prev`）。

用它们的主题包把本包写在 `peerDependencies` 里 —— 站点装那一层时它就跟着装上，漏注册在装包那一步
就看得见，而不是等到打包。

## 工作方式

`configureWebpack` 往 `module.rules` 里放**一条**规则：`test` 收 `.ts` / `.tsx`，`use` 用的就是
官方给插件作者的那把 `utils.getJSLoader()`，`include` 只收 `node_modules/@show-docs/` 底下的文件。

- **工作区里不认领**：pnpm 的软链把源码解析到 `node_modules` 之外，官方那条本来就在编；
  再命中一次就是同一份文件跑两遍 babel。
- **别家的 scope 不认领**：这一族只发在 `@show-docs` 下。
- **`.d.ts` 不认领**：声明文件没有运行期内容。

判据、`babelOptions` 为什么必须与官方同源、以及 `.jsx` / `.mts` / `.cts` 那一档，都记在
[`docs/internals.md`](./docs/internals.md)，这里不抄第二遍。

## 与解析器插件的分工

| 那一格                           | 谁交的 |
| -------------------------------- | ------ |
| `module.rules`（编译这一族源码） | 本包   |

两件事互不依赖，本包也**不引**那个包：层栈空了这条规则照样在（那只是 `@theme-prev/*` 失效）；
摘掉这条规则，解析器照旧解析得动，坏的是那些未编译的 `.tsx` 进了 bundle。

## 没有降级臂

那条规则要用站点那份自定义 babel 配置的产地，取它走官方同一个函数 —— `@docusaurus/babel` 的
`getCustomBabelConfigFilePath`，本包按自己的依赖清单直接引它。装不到那个包就红在配置加载那一步
（`ERR_MODULE_NOT_FOUND`），不在代码里 `logger.warn` 之后改用默认 babel 配置：那样「站点配了
`babel.config.js` 却没生效」看起来像配置写错了，而差异只在产物里、构建照绿。

`siteDir` 下本来就没有 `babel.config.js` 时取到的是 `undefined` —— 官方那条 JS 规则在这一轮里
拿到的也是同一个值，这不算降级。

## 相关文档

- [`docs/internals.md`](./docs/internals.md)：认领范围为什么是 scope、为什么不重复官方那条；
  同一份文件还收着**这一族构建包的编译口径**（`build:core` 编什么、主题层与组件为什么不进那份编译）。
