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

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoadContext, Plugin } from '@docusaurus/types';

import {
  apiFrameByNamespace,
  type ApiFrameEntryInternal,
} from './api-frame-registry.ts';
import { needsSiteJsRule } from './api-frame-source-js-rule.ts';

export type ApiFrameThemeOptions = {
  /** 包名，同时是注册表的键；表里没有这一族就直接失败。 */
  namespace: string;
  /**
  入口产物所在目录（`dist/`）：`getThemePath()` 要按它算 `../theme`。
  各包传自己那份 `import.meta.url`，`file:` 到路径的这一跳由工厂代做 ——
  「产物在 dist/」这个假设收敛到一处，校验（下面 `existsSync`）也才有唯一的落点。
  */
  selfEntryUrl: string;
  /** 本包独有的 webpack 差异；没有就不传（Scalar 就是没有）。 */
  configureWebpack?: Plugin['configureWebpack'];
};

export function createApiFrameTheme(
  context: LoadContext,
  options: ApiFrameThemeOptions,
): Plugin {
  const { namespace, selfEntryUrl, configureWebpack } = options;

  const entry = apiFrameByNamespace(namespace);
  if (entry === undefined || entry.kind !== 'internal') {
    throw new Error(
      `@show-docs/docusaurus-theme-iframe 的注册表里没有 internal 层 ${namespace}：` +
        '外层套壳由该注册表承接，新增层要先在那里登记一条。',
    );
  }
  const view = entry satisfies ApiFrameEntryInternal;

  // 层目录按「产物在 dist/、theme/ 站在包根」这一格算出来。它要是静默不存在，
  // 症状隔着一层：@theme/XxxPage 解析不到、报错点在建站点那一步。当场验一次，
  // 报**实际解析到的路径**——构建输出目录一改，这里立刻以抛错点名，而不是留个悬空别名。
  const themePath = resolve(dirname(fileURLToPath(selfEntryUrl)), '../theme');
  if (!existsSync(themePath)) {
    throw new Error(
      `${namespace} 的主题层目录不存在：${themePath}` +
        '（由入口产物所在目录算出；若构建输出目录不再是 dist/，上一句 resolve 就是要改的地方）。',
    );
  }
  const packageRoot = resolve(themePath, '..');

  return {
    name: namespace,
    // 主题层与 `components/` 是源码，站在包根上，不经 tsc：用本包的站点编译它们。
    getThemePath() {
      return themePath;
    },
    configureWebpack(config, isServer, utils, content) {
      const callerConfig =
        configureWebpack?.(config, isServer, utils, content) ?? {};
      // 装进 node_modules 后官方那条 babel 规则会按 `excludeJS` 排除整个 node_modules，
      // 只给 `docusaurus*.js` 开例外 —— 本包的 .ts/.tsx 源码于是报 `Module parse failed`。
      // 用官方给插件作者的 `getJSLoader()` 补一条覆盖包根的规则接上这一格。
      //
      // 认领范围由 `needsSiteJsRule()` 判：工作区里链路解析到 node_modules 之外，官方那条本来
      // 就会编译它们，我们再命中一次就是白跑一遍 babel（产物不变，代价是编译时间）。
      return {
        ...callerConfig,
        module: {
          ...callerConfig.module,
          rules: [
            ...(callerConfig.module?.rules ?? []),
            {
              test: /\.tsx?$/,
              include: (file: string) => needsSiteJsRule(packageRoot, file),
              use: [utils.getJSLoader({ isServer })],
            },
          ],
        },
      };
    },
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
