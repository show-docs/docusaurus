import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-redoc',
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。本包要编译的只有这一份入口（它跑在构建配置期）。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    configureWebpack(_config, isServer) {
      // `redoc` 发的是打好的 ESM 包（`bundles/redoc.js`），外面那一层 webpack 仍然要按
      // 静态分析去解析它里面的每一条 `require`。它有一支 Node 分支长这样：
      //
      //   typeof module !== 'undefined' ? new (require('worker_threads').Worker)(...) : import('worker_threads')
      //
      // 浏览器里那个条件为假、跑不到，但**解析这一步照样红**（`Module not found: worker_threads`）。
      // 服务端有真的 Node 模块，不用管；浏览器这一格给 `false`（空模块），比补 polyfill 诚实：
      // 那支 Worker 是给「离线把文档再算一遍」用的，本仓这条路径不碰它。
      //
      // 和 `plugin-prev-layer-resolver` / theme-stoplight 一样**只返回自己新增的那一格**：
      // 官方 `applyConfigureWebpack` 用 webpack-merge 拼接，改完整个 config 再返回去，
      // 数组会被 concat 一遍（`rules` 翻倍 → 每个 css 文件被 css-loader 处理两次）。
      return isServer
        ? {}
        : { resolve: { fallback: { worker_threads: false } } };
    },
  };
}
