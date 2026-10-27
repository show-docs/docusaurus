import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-iframe',
    // 本包不在这里跑 `assertThemePrerequisites()`：这份入口进 `tsc`（`rootDir` = `src/`），
    // 而那条检查住在未编译的 `lib/` 里，跨 `rootDir` import 会让构建在 TS6059 上停住。
    // 缺解析器时本包的 `theme/DocItem` 会直接撞 `@theme-prev/DocItem` 解析失败，报错点仍在
    // 本包；其余七条层（含三条 API 层）都在各自入口做那条检查，本站只要装了任何一条层就会
    // 先看到点名的那句话。
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。本包要编译的只有这一份入口。
    //
    // 「谁来编」这件事归 `@show-docs/docusaurus-plugin-prev-layer-resolver`（它按
    // `@show-docs` 这个 scope 认领 `node_modules` 里的 TS 源码），本包不自己补 babel 规则。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
  };
}
