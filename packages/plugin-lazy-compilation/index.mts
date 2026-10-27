import type { Plugin } from '@docusaurus/types';

// 开发期插件，只做一件事：开发服务器下给**客户端** webpack 编译开 `lazyCompilation`，
// 页面与依赖按需编译，首屏更快。
//
// 为什么是插件而不是 `docusaurus.config.mjs` 顶层字段：`configureWebpack` 不在 Docusaurus
// 的配置 schema 里，写在顶层会被 `Error: These field(s) ("configureWebpack",) are not
// recognized` 直接拒收；它只能是插件生命周期方法。入口按契约只读 default 导出。
//
// 「非 build」靠 NODE_ENV 自动判定，不用额外设环境变量：CLI 入口把它默认置 development
//（`@docusaurus/core/bin/docusaurus.mjs`），只有 `docusaurus build` 强制改成 production
//（`@docusaurus/core/lib/commands/build/build.js`）。于是 `start` 命中、`build` 不命中；
// `serve` 只伺服构建产物、不跑编译，压根到不了这里。
//
// 形态：本包**免编译** —— 入口就是这一份 `index.mts`（`main` 指它），由 Docusaurus 的 jiti
// 直接加载，没有 `dist/`。它也没有主题目录，所以层栈推不出它那一格（判据见
// `packages/plugin-prev-layer-resolver/src/layers.mts` 的「没有主题目录的插件不产生层」）。
export default function lazyCompilationPlugin(): Plugin {
  return {
    // Docusaurus v3 的插件契约：default 导出是工厂函数，返回的 Plugin 必须有 name。
    // 这一格按 `packages/` 那份约定写成**包名**（与 `packages/*/src/index.mts` 同形）。
    name: '@show-docs/docusaurus-plugin-lazy-compilation',
    configureWebpack(webpackConfig, isServer) {
      // 服务端编译（SSR）与 build 一律保持官方默认，不动 experiments
      if (isServer || process.env.NODE_ENV === 'production') {
        return;
      }
      // eslint-disable-next-line no-param-reassign
      webpackConfig.experiments ||= {};
      // eslint-disable-next-line no-param-reassign
      webpackConfig.experiments.lazyCompilation = {
        entries: true,
        imports: true,
      };
    },
  };
}
