import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { needsSiteJsRule } from '@show-docs/docusaurus-theme-iframe/lib/api-frame-source-js-rule.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-iframe/lib/prerequisites.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 包根：那条 `.tsx?` 规则的认领范围。 */
const packageRoot = resolve(thisDir, '..');

export default function theme(context: LoadContext): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-copy-button',
    loadContent() {
      // 本层只在构建期引 theme-iframe 的一条纯函数，不需要它的插件规则；但 `@theme-prev/*`
      // 的别名仍由解析器插件提供，缺了它同样是构建期才炸。
      assertThemePrerequisites(context, {
        namespace: '@show-docs/docusaurus-theme-copy-button',
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
    // 样式表不是模块，`tsc` 不会把它搬进 `dist/`：作为 client module 交给站点的样式表管线。
    // 提示条自己的样式由 `sonner` 在浏览器里注入，不经过这一格。
    getClientModules() {
      return [resolve(thisDir, '../styles/copy-button.css')];
    },
    configureWebpack(_config, isServer, utils) {
      return {
        module: {
          rules: [
            {
              // 官方那条 babel 规则排除整个 node_modules、只放行 `docusaurus*.js`，本包从
              // npm 安装后的 `.tsx` 会报 `Module parse failed`。补一条只覆盖本包的规则
              //（理由与代价见 theme-iframe 的 `lib/api-frame-theme.mts` 里同一条）。
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
