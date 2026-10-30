import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-component-page/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本层的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-redoc';

/**
Redoc 这一层的入口：本包交出**一份组件与一条规则**（`redoc:` 那一把键、框内渲染
`@theme/RedocView`），外层那一格框、那条握手循环与框内那份文档都在
`@show-docs/docusaurus-theme-component-page` 里 —— 本包因此不依赖 `theme-iframe`，
卸载它这一层照常可用。

命中的页由 component-page 那份 `DocItem` 判表后换成一个同源框，框里按登记名 `redoc` 取
`@theme/RedocView`；`oas3:` / `aas3:` 那两把键怎么挑、亮暗怎么落到 `<html data-redoc-mode>` 上，
都归 `theme/RedocView` 与 `components/` 里那两份，机制层不认识这些业务键。
*/
export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 交出的那一页要由 component-page 判表才挂得上来；解析器插件缺了则是本包那几份
      // 未编译的 `.tsx` / `.ts` 没人认领。两样都在这里点名，而不是让 webpack 在某个页面文件
      // 上抛、或让那一页安静地不出现。
      assertThemePrerequisites(context, {
        namespace: NAMESPACE,
        componentPage: true,
      });

      return {
        componentPage: {
          components: [{ id: 'redoc', component: '@theme/RedocView' }],
          rules: [
            {
              key: 'redoc',
              match: 'boolean',
              component: 'redoc',
              render: 'iframe',
            },
          ],
        },
      } satisfies ComponentPageContent;
    },
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus 项目
    // 会用自己的 babel 编译它们。这里只编译 `src/` 那一份（入口）。
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
      // 照 `plugin-prev-layer-resolver` 的口径**只返回自己新增的那一格**（返回整个 config 会被
      // webpack-merge 把数组 concat 翻倍，理由记在它的维护者文档
      // `packages/plugin-prev-layer-resolver/docs/internals.md`）。
      return isServer
        ? {}
        : { resolve: { fallback: { worker_threads: false } } };
    },
  };
}
