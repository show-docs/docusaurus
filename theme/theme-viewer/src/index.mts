import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin, PostCssOptions } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-viewer',
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
    // 收在包根 `styles/`，两者都作为 client module 交给站点的样式表。
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
              // 官方那条 babel 规则排除整个 node_modules、只放行 `docusaurus*.js`，本包从
              // npm 安装后的 `.tsx` 会报 `Module parse failed`。补一条只覆盖本包的规则
              // （理由与代价见 theme-iframe 的 `lib/api-frame-theme.mts` 里同一条）。
              test: /\.tsx?$/,
              include: [resolve(thisDir, '..')],
              use: [utils.getJSLoader({ isServer })],
            },
          ],
        },
      };
    },
    // `viewerjs/dist/viewer.css` 写的是 CSS 原生嵌套（`.viewer-navbar.viewer-small > .viewer-list`
    // 那条里面套着 `> li { … }`）。站点那份 `postcss-preset-env` 按 browserslist 决定要不要摊平，
    // 而现代浏览器原生支持嵌套，这一步整个跳过，嵌套原样交给样式表压缩器；压缩器不认嵌套，会把
    // 子层的声明并进父选择器、再多吐一个 `}`，从第一条嵌套规则往后就是坏的样式表。这里按本包自己的
    // 依赖补一次摊平，不依赖站点把 browserslist 配成什么。
    configurePostCss(postcssOptions: PostCssOptions): PostCssOptions {
      postcssOptions.plugins.push(require.resolve('postcss-nesting'));
      return postcssOptions;
    },
  };
}
