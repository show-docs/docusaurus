/**
「怎么定位 core」对**包外**交出的那一格。

实现仍住在 `./layers.mts`，这里只开名字、不抄第二份判据：那三把 helper 和层栈同源
（链底那一层就是从 core 的模块位置推出来的，这一格与那边的分工记在 `docs/internals.md`
的「谁来编这一族未编译的 TS 源码」不在本包」一节）。
要它的是包外的消费者 —— `@show-docs/docusaurus-plugin-compile-source` 借 core 自己的
`@docusaurus/babel` 依赖取官方那份 babel 配置路径，除这一格之外没有第二个理由引它。

为什么不能改成「用它的包自己 require `@docusaurus/babel`」：那是 core 的依赖，站点根通常
没声明它，pnpm 的隔离布局下从站点解析恒为 `MODULE_NOT_FOUND`；即便靠 `shamefullyHoist`
捞到一份，那份版本也不保证是 core 用的那一个 —— babel 配置解析走的正是版本相关的那条路。
基准必须是 core 的位置，这条口径只有一份，就在 `./layers.mts`。
*/

export {
  resolveCoreModule,
  resolveCoreRoot,
  resolveFromCore,
} from './layers.mts';
