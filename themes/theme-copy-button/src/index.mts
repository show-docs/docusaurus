import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertPrevLayerResolverInstalled } from '@show-docs/docusaurus-plugin-prev-layer-resolver/registered-plugins';

import type { LoadContext, Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(context: LoadContext): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-copy-button',
    async loadContent() {
      // 本层不交规则给机制层，安装前提只有解析器那一个。这一条**今天不坏本包构建**：层里用的是
      // 官方那把 `@theme-init`，编译未编译 TS 源码那条 babel 规则归
      // `@show-docs/docusaurus-plugin-compile-source`（本包只在 `peerDependencies` 里点名它）；
      // 留着它是因为它是这一族共用的前提。
      // 交回 Promise：官方 await 它，preset 里那一份要等官方合并完才看得见。
      await assertPrevLayerResolverInstalled(
        context,
        '@show-docs/docusaurus-theme-copy-button',
      );
    },
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 那一份入口。
    //
    // 「谁来编」归 `@show-docs/docusaurus-plugin-compile-source`（它按 `@show-docs`
    // 这个 scope 认领 `node_modules` 里的 TS 源码），本包不自己补 babel 规则。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 样式表不是模块，`tsc` 不会把它搬进 `dist/`：作为 client module 交给站点的样式表管线。
    // 提示条自己的样式由 `sonner` 在浏览器里注入，不经过这一格。
    getClientModules() {
      return [resolve(thisDir, '../styles/copy-button.css')];
    },
  };
}
