/**
用 theme-iframe 承接外层套壳的**入口工厂**：三条 API 层的 `src/index.mts` 只需要带着自己的
包名、产物目录与 webpack 差异来调它。

它做三件事：`getThemePath()` 挂各包自己的层目录（里面只剩框内那条页面）、
`contentLoaded` 按注册表把 `<route>` 页面注册上、其余一概不揽 —— webpack 的差异
（Redoc 的 `worker_threads` 空模块、Elements 的样式表隔离与 polyfill）由调用方经
`configureWebpack` 自己传，本工厂只负责把它接进 Plugin 形状。

**配置期代码**：跑在 Node 里（jiti 直接吃这份 `.mts` 源码，扩展名按上游 lint preset 的口径
标 Node 环境），不引 React、不引 DOM，
类型引 `@docusaurus/types` 用 `import type`，浏览器那一份（`api-frame-registry.ts`）不会经过这里。
*/

import { resolve } from 'node:path';

import type { LoadContext, Plugin } from '@docusaurus/types';

import {
  apiFrameByNamespace,
  type ApiFrameEntryInternal,
} from './api-frame-registry.ts';

export type ApiFrameThemeOptions = {
  /** 包名，同时是注册表的键；表里没有这一族就直接失败。 */
  namespace: string;
  /**
  入口**产物**所在目录（`dist/`）：`getThemePath()` 要按它算 `../theme`，
  各包传自己那份 `dirname(fileURLToPath(import.meta.url))`。
  */
  selfDir: string;
  /** 本包独有的 webpack 差异；没有就不传（Scalar 就是没有）。 */
  configureWebpack?: Plugin['configureWebpack'];
};

export function createApiFrameTheme(
  context: LoadContext,
  options: ApiFrameThemeOptions,
): Plugin {
  const { namespace, selfDir, configureWebpack } = options;

  const entry = apiFrameByNamespace(namespace);
  if (entry === undefined || entry.kind !== 'internal') {
    throw new Error(
      `@show-docs/docusaurus-theme-iframe 的注册表里没有 internal 层 ${namespace}：` +
        '外层套壳由该注册表承接，新增层要先在那里登记一条。',
    );
  }
  const view = entry satisfies ApiFrameEntryInternal;

  return {
    name: namespace,
    // 主题层与 `components/` 是源码，站在包根上，不经 tsc：用本包的站点编译它们。
    getThemePath() {
      return resolve(selfDir, '../theme');
    },
    ...(configureWebpack !== undefined && { configureWebpack }),
    contentLoaded({ actions }) {
      // 框内那条独立页面：不是文档页、没有 frontmatter 可判，走官方插件路由 API。
      // `component` 写 `@theme/` 别名 —— 打包器按别名找得到各包挂进层栈的那份页面，
      // 站点那边的 swizzle 也还能覆写它。
      actions.addRoute({
        path: `${context.siteConfig.baseUrl.replace(/\/$/, '')}/${view.route}`,
        component: view.pageComponent,
        exact: true,
      });
    },
  };
}
