import type { LoggerLike } from '@show-docs/docusaurus-plugin-prev-layer-resolver';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { showDocsSourceRule, siteBabelConfigPath } from './source-js-rule.mts';

export interface CompileSourceOptions {
  /** 注入 logger（测试用） */
  logger?: LoggerLike;
}

/**
补上官方那条 babel 规则漏掉的一格：编译 `@show-docs` 家族**随包发布、尚未编译**的 TS 源码。

Docusaurus 官方那条规则把整个 `node_modules` 排除在外，所以这一族的 `.ts` / `.tsx`（主题层与
组件）从 npm 装进真项目时报 `Module parse failed`。本包只交这一条规则，认领范围、`babelOptions`
为什么必须和官方同源、以及为什么不认领 `.jsx` / `.mts` / `.d.ts`，全文在 `./README.md`
与 `./docs/internals.md`，这里只留接线所需的事实。

它和 `@show-docs/docusaurus-plugin-prev-layer-resolver` 是两件事：那个包管「多个主题层链式包裹
同一个组件」（往 `resolve.plugins` 里放一把 resolver），本包管「谁编译这一族的源码」（往
`module.rules` 里放一条规则）。两格互不依赖 —— 层栈空了这条规则照样在，摘掉这条规则
`@theme-prev/*` 照旧解析得动，只是那些 `.tsx` 没人编。
*/
export default async function compileSourcePlugin(
  context: LoadContext,
  options: CompileSourceOptions = {},
): Promise<Plugin> {
  const logger = options.logger ?? console;

  // `configureWebpack` 是同步的，而官方那格 `babelOptions` 只能 await 取；取一次，
  // client / server 两轮共用。
  const babelOptions = await siteBabelConfigPath(context.siteDir, logger);

  return {
    name: '@show-docs/docusaurus-plugin-compile-source',

    configureWebpack(_config, isServer, utils) {
      // 只返回自己新增的那一条规则（webpack-merge 对数组是 concat，官方那条 JS 规则不受影响）
      return {
        module: {
          rules: [showDocsSourceRule(utils, isServer, babelOptions)],
        },
      };
    },
  };
}
