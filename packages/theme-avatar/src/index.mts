/**
导航栏那颗头像的插件入口：把站点的插件选项校验成一份配置，交给浏览器侧那一层读。

主题层（`theme/`）与共享组件（`components/`）是**源码**，站在包根上，不经 `tsc`：用本包的
Docusaurus 项目会用自己的 babel 编译它们；「谁来编」归
`@show-docs/docusaurus-plugin-prev-layer-resolver`（它按 `@show-docs` 这个 scope 认领
`node_modules` 里的 TS 源码），本包不自己补 babel 规则。本包只编译 `src/` 那两份。

**配置怎么进浏览器**：走官方的插件全局数据。这一格有两个只读代码看不出来的形状（都实测在
`@docusaurus/core@3.10.2` 的 `lib/server/plugins/` 里）：

1. `setGlobalData` 是 `actions` 上的那一个（`@docusaurus/types` 的 `plugin.d.ts` 里
   `setGlobalData: (data: unknown) => void`），**不是**插件自己定义、由 Docusaurus 调用的生命周期
   方法 —— 把入口写成 `setGlobalData() { return config; }` 永远不会被执行，浏览器里读到 `undefined`；
2. 那份数据落进全局时按 `插件名 → 插件 id → 数据` 分了三段，而 `actions` 只在插件**定义了
   `contentLoaded`** 时才创建。所以本入口必须有 `contentLoaded`，浏览器侧则用官方的
   `usePluginData(PLUGIN_NAME)` 去读（它按同一条路取，比自己去 `useGlobalData()` 里拆那一层稳）。

缺 `contentLoaded` 这一格时症状不响：配置静静地不存在，头像静静地不出现。钉住它的是
`test/package-entries.test.mts` 里那个 describe（它数「`loadContent` 与 `contentLoaded` 各交出了什么」）
与一次真实 `pnpm build` 之后回读 `.docusaurus/docusaurus.config.mjs` 旁边那份 globalData。

本层没有 `getClientModules()`：它用的类名（`avatar__photo`、`dropdown`）全是 Infima 已有的，
自己不写一行样式。选项里那一格 `id` 是 Docusaurus 注入的插件实例 id，判过形状之后不交进浏览器
（`./config.mts` 里那条 `omit`）：主题层只有一份 `ColorModeToggle`，它读的永远是 `default`
那一个实例的那一格。
*/

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-iframe/lib/prerequisites.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

import type { AvatarThemeOptions } from '../types/avatar-config.ts';

import { normalizeConfig, PLUGIN_NAME } from './config.mts';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(
  context: LoadContext,
  options: AvatarThemeOptions = {},
): Plugin {
  // 配置期就判到底：写歪的形状红在加载配置那一句，而不是红在浏览器里那颗头像上。
  const config = normalizeConfig(options);

  return {
    name: PLUGIN_NAME,
    loadContent() {
      // `@theme-prev/ColorModeToggle` 的别名由解析器插件提供，缺了它要等整个构建才炸。
      assertThemePrerequisites(context, { namespace: PLUGIN_NAME });
    },
    contentLoaded({ actions }) {
      // 见文件头第 1 条：这是 `actions` 上那一个，不是生命周期方法。
      actions.setGlobalData(config);
    },
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
  };
}
