import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-stoplight',
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。本包要编译的只有这一份入口（它跑在构建配置期）。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    configureWebpack(_config, isServer) {
      // `@stoplight/elements` 的依赖树里还在 `require` Node 的 `url` / `buffer`，而
      // webpack 5 起不再自动补核心模块。服务端那份构建本来就有真的 Node 模块，
      // 只有浏览器 bundle 需要补 —— 而且补的是包里的 polyfill，不是空模块：
      // 这两个都走在「按 URL 取 schema」那条路上，置 false 会在运行时抛。
      //
      // 和 `plugin-prev-layer-resolver` 一样**只返回自己新增的那一格**：官方
      // `applyConfigureWebpack` 用 webpack-merge 拼接，改完整个 config 再返回去，
      // 数组会被 concat 一遍（`rules` 翻倍 → 每个 css 文件被 css-loader 处理两次）。
      if (isServer) {
        return {};
      }

      return {
        resolve: {
          fallback: {
            buffer: require.resolve('buffer/'),
            url: require.resolve('url/'),
          },
        },
      };
    },
    configurePostCss(config) {
      // `@stoplight/elements` 的样式表是全局选择器，会污染整站：把它们包进 `.stoplight-root`
      // 的作用域里。`whitelist` 按**样式表的路径**筛（每一项都当正则解释），只动它包里的 CSS。
      //
      // `prefixTransform` 是给暗亮模式那一类留的：`data-theme` 挂在 `<html>` 上，那是
      // `.stoplight-root` 的**祖先**，所以「前缀打头」那种默认拼法（`.stoplight-root
      // [data-theme=dark] …`）一条都不命中 —— 要把属性选择器留在最前、前缀挪到它后面。
      // 交给 `prefixwrap` 自己做，是因为它在加前缀那一步就把原始选择器交回给我们，
      // 不需要先加一遍再改写第二遍。
      config.plugins.push(
        require('postcss-prefixwrap')('.stoplight-root', {
          whitelist: [/@stoplight/],
          prefixTransform: (selector: string, prefix: string): string =>
            /^\[data-theme=(?:light|dark)\]/.test(selector)
              ? selector.replace(
                  /^(\[data-theme=(?:light|dark)\])/,
                  (_matched, attr: string) => `${attr} ${prefix}`,
                )
              : `${prefix} ${selector}`,
        }),
      );

      return config;
    },
  };
}
