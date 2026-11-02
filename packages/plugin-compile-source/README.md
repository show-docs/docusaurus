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

两条都得注册，缺哪条坏哪一格：缺本包，这一族的 `.tsx` 没人编；缺解析器，`@theme-prev/*` 解析不动。
本仓的站点把两格都按包名写在 `docusaurus.config.mjs` 的 `plugins` 里。

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

两件事互不依赖：层栈空了这条规则照样在（那只是 `@theme-prev/*` 失效）；摘掉这条规则，解析器照旧
解析得动，坏的是那些未编译的 `.tsx` 进了 bundle。以前这一格寄在解析器包里，判据本身没问题，
只是「谁来编译」和「层怎么叠」被写进了同一个 `configureWebpack`，读起来像它们有关系。

## 告警

| 告警                                                       | 后面是什么                        |
| ---------------------------------------------------------- | --------------------------------- |
| `拿不到 @docusaurus/babel 的 getCustomBabelConfigFilePath` | 降级：那条规则改用默认 babel 配置 |

降级那一档值得盯：站点有自己的 `babel.config.js` 时，这一族的源码会与站点源码走两套编译，
而构建照绿 —— 差异只在产物里。

## 相关文档

- [`docs/internals.md`](./docs/internals.md)：认领范围为什么是 scope、为什么不重复官方那条、
  这一格以前散在七个包里。
- 仓库根 README 的「构建包的编译口径」：`build:core` 编什么、主题层与组件为什么不进那份编译。
