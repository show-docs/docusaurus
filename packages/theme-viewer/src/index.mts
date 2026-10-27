import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { needsSiteJsRule } from '@show-docs/docusaurus-theme-iframe/lib/api-frame-source-js-rule.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-iframe/lib/prerequisites.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 包根：那条 `.tsx?` 规则的认领范围。 */
const packageRoot = resolve(thisDir, '..');

export default function theme(context: LoadContext): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-viewer',
    loadContent() {
      // 本层只在构建期引 theme-iframe 的一条纯函数，不需要它的插件规则；但 `@theme-prev/*`
      // 的别名仍由解析器插件提供，缺了它同样是构建期才炸。
      //
      // CSS 压缩器也只在这一步点名：`viewerjs` 那份样式表写的是原生嵌套，默认的
      // cssnano + clean-css 会把它压坏，而本包不再替宿主全站摊平 —— 那件事交给 lightningcss。
      assertThemePrerequisites(context, {
        namespace: '@show-docs/docusaurus-theme-viewer',
        lightningCssMinimizer: true,
      });
    },
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 那一份入口。
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
    configureWebpack(_config, isServer, utils) {
      return {
        module: {
          rules: [
            {
              // 官方那条 babel 规则排除整个 node_modules、只放行 `docusaurus*.js`，本包装进真项目
              // 之后那些未编译的 `.tsx` 会报 `Module parse failed`。补一条覆盖包根的规则接上这一格，
              // 但只在官方不认的地方认领 —— 工作区里它们是链到 `node_modules` 之外的，官方本来就在编，
              // 再命中就是白跑一遍 babel。判据见 theme-iframe 的 `lib/api-frame-source-js-rule.ts`。
              test: /\.tsx?$/,
              include: (file: string) => needsSiteJsRule(packageRoot, file),
              use: [utils.getJSLoader({ isServer })],
            },
          ],
        },
      };
    },
  };
}
