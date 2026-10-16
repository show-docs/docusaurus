import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-markmap',
    getThemePath() {
      return resolve(thisDir, './theme');
    },
    // 样式表不是模块，`tsc` 不会把它搬进 `dist/`：官方样式按包名解析，本仓那份留在包根
    // `styles/`，两者都作为 client module 交给站点的样式表（效果等同源码里那句 `import '….css'`）。
    getClientModules() {
      return [
        require.resolve('markmap-toolbar/dist/style.css'),
        resolve(thisDir, '../styles/markmap.css'),
      ];
    },
    configureWebpack() {
      return {
        module: {
          rules: [
            {
              // md 由官方 mdx-loader 编译，这里只能在其产物后追加导出
              enforce: 'post',
              test: /\.md$/,
              loader: resolve(thisDir, './loader/md-markmap-loader.mjs'),
            },
          ],
        },
      };
    },
  };
}
