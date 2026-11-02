import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-copy-button',
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 那一份入口。
    //
    // 「谁来编」归 `@show-docs/docusaurus-plugin-compile-source`，本包不自己补 babel 规则。
    // 层里那句 `@theme-init/Footer/Copyright` 用的是官方别名，所以本层没有配置期要查的前提。
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
