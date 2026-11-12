import type { Plugin } from '@docusaurus/types';

// 开发期插件，只做一件事：开发服务器下给**客户端**编译开 `lazyCompilation`，
// 页面与依赖按需编译，首屏更快。
//
// 为什么是插件而不是 `docusaurus.config.mjs` 顶层字段：`configureWebpack` 不在 Docusaurus
// 的配置 schema 里，写在顶层会被 `Error: These field(s) ("configureWebpack",) are not
// recognized` 直接拒收；它只能是插件生命周期方法。入口按契约只读 default 导出。
//
// 「非 build」靠两格一起判，不用额外设环境变量：① NODE_ENV —— CLI 入口默认置 development
//（`@docusaurus/core/bin/docusaurus.mjs`），`docusaurus build` 改成 production
//（`@docusaurus/core/lib/commands/build/build.js`）；② 命令本身 `process.argv[2] === 'build'`
// —— 因为 `build --dev` 会把 NODE_ENV 又置回 development，光看 NODE_ENV 会把那一档误当成 start。
// 命令读 argv[2] 与官方同一个口径（`cli.js` 的 `command = cliArgs[2]`，bin 传的就是 process.argv）。
// 于是 `start` 命中、`build`（含 `--dev`）不命中；`serve` 只伺服构建产物、不跑编译，压根到不了这里。
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
      // 服务端编译（SSR）与 build 一律保持官方默认，不动按需编译。build 不能只看 NODE_ENV：
      // `docusaurus build --dev` 会把它置回 development（build.js），那一档仍是 build。命令本身
      // 按官方同一个口径读 `process.argv[2]`（cli.js 的 `command = cliArgs[2]`，bin 传的就是
      // process.argv）—— 精确匹配 argv[2] 而不是 includes，免得把名叫 build 的 siteDir 误认成命令。
      if (
        isServer ||
        process.env.NODE_ENV === 'production' ||
        process.argv[2] === 'build'
      ) {
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
遮罩用）住在合并前的默认配置里，而 Docusaurus 用 webpack-merge 合并这两份。同名的函数格不会被
顶掉：合并后那一份拿**同一份**入参把两个函数各跑一次，再把各自的数组返回值拼起来
（`webpack-merge` 的 `join-arrays.js`）。官方那一份是「往传进来的数组里 unshift、再把同一份
交回」，所以本包这一份**只交回自己那一项的新数组，不碰传进来那份** —— 拼接后官方那项与本包
那项各出现一次。若本包也照官方那样改同一份数组再交回，两份返回值就是同一个引用，拼接后整张表
每一项都翻倍（实测见 `test/package-entries.test.mts` 用真实 webpack-merge 跑的那一条）。
*/
function rspackMount(bundler: unknown): LazyCompilationPatch {
  const { lazyCompilationMiddleware } = bundler as {
    lazyCompilationMiddleware: RspackLazyCompilationMiddleware;
  };

  return {
    lazyCompilation: lazyCompilationOptions(),
    devServer: {
      // 不改传进来的 middlewares：合并那一步会把它与官方那份的返回值拼接，
      // 改同一份再交回会让整张表翻倍。这里只交自己那一项。
      setupMiddlewares: (_middlewares, devServer) => [
        {
          name: 'rspack-lazy-compilation',
          middleware: lazyCompilationMiddleware(devServer.compiler),
        },
      ],
    },
  };
}
