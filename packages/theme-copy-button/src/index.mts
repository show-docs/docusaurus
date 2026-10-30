import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-component-page/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(context: LoadContext): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-copy-button',
    loadContent() {
      // 本层只在构建期引 component-page 的一条纯函数（那句安装前提检查），不需要它的插件规则；
      // 但 `theme/` 是未编译 TS 源码，编译它的 babel 规则由解析器插件一处认领，缺了它同样是
      // 构建期才炸。
      assertThemePrerequisites(context, {
        namespace: '@show-docs/docusaurus-theme-copy-button',
      });
    },
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 那一份入口。
    //
    // 「谁来编」归 `@show-docs/docusaurus-plugin-prev-layer-resolver`（它按 `@show-docs`
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
