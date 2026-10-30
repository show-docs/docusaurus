import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { assertViewerPrerequisites, NAMESPACE } from './prerequisites.mts';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 本层的 `theme/` 是未编译 TS 源码，编译它的 babel 规则由解析器插件一处认领，缺了它同样是
      // 构建期才炸。
      //
      // CSS 压缩器也只在这一步点名：`viewerjs` 那份样式表写的是原生嵌套，默认的
      // cssnano + clean-css 会把它压坏，而本包不再替宿主全站摊平 —— 那件事交给 lightningcss。
      // 这一条判据住在本包的 `./prerequisites.mts`（只有这一家用它），本层不引机制层。
      assertViewerPrerequisites(context);
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
    // 样式表不是模块，`tsc` 不会把它搬进 `dist/`：第三方那份按包名解析，本仓那两处
    // 收在包根 `styles/`，两者都作为 client module 交给站点的样式表。第三方那份写的是
    // CSS 原生嵌套，宿主必须是 lightningcss 压缩器 —— 前置检查见上面的 `loadContent()`。
    getClientModules() {
      return [
        require.resolve('viewerjs/dist/viewer.css'),
        resolve(thisDir, '../styles/viewer.css'),
      ];
    },
  };
}
