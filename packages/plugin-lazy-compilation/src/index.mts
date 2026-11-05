import type { Plugin } from '@docusaurus/types';

// 开发期插件，只做一件事：开发服务器下给**客户端**编译开 `lazyCompilation`，
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
// 两个 bundler 不止这一格住的地方不同，连挂载方式也不同：webpack 只要那一格，rspack 还要额外
// 挂一份接请求的中间件（各自的落点与原因见下面 `configureWebpack` 与 `rspackMount` 的文档）。
// 当前是哪一个 bundler，读 `configureWebpack` 第三份参数里官方算好的那一格
//（`utils.currentBundler.name`，来自 `@docusaurus/bundler` 的 `getCurrentBundler()`），
// 本包不另判一套。
//
// 形态：本包是**构建包** —— 源码在 `src/`，`tsc -p tsconfig.build.json` 编译出 `dist/`，
// 包出口是 `dist/index.mjs`（Docusaurus 按包名解析到它，jiti 加载那份 ESM 产物）。
// 它也没有主题目录，所以层栈推不出它那一格（判据见
// `packages/plugin-prev-layer-resolver/src/layers.mts` 的「没有主题目录的插件不产生层」）。

/** 按需编译的两格：入口和动态 import 都按需 —— webpack 与 rspack 收的是同一份形状。 */
function lazyCompilationOptions(): { entries: boolean; imports: boolean } {
  return { entries: true, imports: true };
}

/**
rspack 的 `lazyCompilationMiddleware`：接住浏览器「这一模块现在才要编」的那些请求，
同时把按需编译的插件装到 compiler 上。签名按本包用到的这一格写，不收 rspack 的类型
（免得产物的类型声明引用包外类型）。
*/
type RspackLazyCompilationMiddleware = (
  compiler: unknown,
) => (req: unknown, res: unknown, next: () => void) => void;

/**
rspack 那一支要写的 `devServer.setupMiddlewares`：接住中间件表、在最前面插一项，再把表交回去。
形状按本包用到的这一格写，不收 webpack-dev-server 的类型（免得产物的类型声明引用包外类型）。
*/
type SetupMiddlewares = (
  middlewares: unknown[],
  devServer: { compiler: unknown },
) => unknown[];

/**
本包交回来的那几格。官方给 `configureWebpack` 的那一格定的是 webpack 的 `Configuration`
（rspack 也收这一份），里面既有 `experiments` 也有 `devServer`，唯独没有顶层
`lazyCompilation`（那是 rspack ≥1.x 的位置），所以由本包点名。
*/
type LazyCompilationPatch = {
  experiments?: { lazyCompilation?: ReturnType<typeof lazyCompilationOptions> };
  lazyCompilation?: ReturnType<typeof lazyCompilationOptions>;
  devServer?: { setupMiddlewares: SetupMiddlewares };
};

/** 官方那一步收的形状（`ConfigureWebpackResult`），去掉「什么都不改」那一臂。 */
type WebpackResult = Exclude<
  ReturnType<NonNullable<Plugin['configureWebpack']>>,
  void
>;

export default function lazyCompilationPlugin(): Plugin {
  return {
    // Docusaurus v3 的插件契约：default 导出是工厂函数，返回的 Plugin 必须有 name。
    // 这一格按 `packages/` 那份约定写成**包名**（与 `packages/*/src/index.mts` 同形）。
    name: '@show-docs/docusaurus-plugin-lazy-compilation',
    configureWebpack(_webpackConfig, isServer, utils) {
      // 服务端编译（SSR）与 build 一律保持官方默认，不动按需编译
      if (isServer || process.env.NODE_ENV === 'production') {
        return;
      }
      // webpack 自己起那份接请求的后端，所以这一支只有 `experiments` 那一格
      if (utils.currentBundler.name !== 'rspack') {
        return asWebpackResult({
          experiments: { lazyCompilation: lazyCompilationOptions() },
        });
      }
      return asWebpackResult(rspackMount(utils.currentBundler.instance));
    },
  };
}

/** 本包点名的顶层那一格不在 webpack 那张类型表里，所以只在出口处按官方收的形状改一次形状。 */
function asWebpackResult(patch: LazyCompilationPatch): WebpackResult {
  return patch as WebpackResult;
}

/**
rspack 那一支：这一格在顶层，另外还要把按需编译的中间件挂进开发服务器 —— 官方那份是
webpack-dev-server，不会替我们挂。

`setupMiddlewares` 是它交给站点改中间件表的唯一一格，官方那份默认值（读编译期源码给错误
遮罩用）住在合并前的默认配置里，而 Docusaurus 用 webpack-merge 合并这两份 —— 同名的函数格不会被
顶掉，而是两个各跑一次、中间件因此各注册两遍。代价与实测见本包 README 的「已知限制」。
*/
function rspackMount(bundler: unknown): LazyCompilationPatch {
  const { lazyCompilationMiddleware } = bundler as {
    lazyCompilationMiddleware: RspackLazyCompilationMiddleware;
  };

  return {
    lazyCompilation: lazyCompilationOptions(),
    devServer: {
      setupMiddlewares: (middlewares, devServer) => {
        middlewares.unshift({
          name: 'rspack-lazy-compilation',
          middleware: lazyCompilationMiddleware(devServer.compiler),
        });
        return middlewares;
      },
    },
  };
}
