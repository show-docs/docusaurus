import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-iframe',
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。本包要编译的只有这一份入口。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
    configureWebpack(_config, isServer, utils) {
      // 官方那条 babel 规则排除整个 node_modules、只放行 `docusaurus*.js`，本包从 npm 安装后
      // 的 `.tsx` 会报 `Module parse failed`。补一条只覆盖本包的规则（理由与代价见
      // `lib/api-frame-theme.mts` 里同一条）。
      return {
        module: {
          rules: [
            {
              test: /\.tsx?$/,
              include: [resolve(thisDir, '..')],
              use: [utils.getJSLoader({ isServer })],
            },
          ],
        },
      };
    },
  };
}
