/**
本包那条 `.tsx?` babel 规则：让站点编译 `node_modules/@show-docs/` 下**未编译**的 TS 源码。

## 为什么要有这条规则

官方那条 babel 规则（`@docusaurus/core/lib/webpack/base.js` 里的 `excludeJS`）把整个
`node_modules` 排除在外，只给 `docusaurus*.js[x]` 开例外 —— 从 npm 装进真项目的包，那些随包
发布的 `.ts` / `.tsx`（主题层与组件）于是报 `Module parse failed`。

这一格原先由**每个主题包自己**补一条规则（各自认领自己的包根），同一个判据抄了七处。收在
这里一份之后，判据从「某个包根」放宽成「`@show-docs` 这个 scope」：谁家的包不重要，重要的是
**这一族的东西只编一遍**。

## 认领范围

只认 `node_modules/@show-docs/` 底下、扩展名是 `.ts` / `.tsx` 的文件：

- **工作区里不认领**：pnpm 的软链把源码解析到 `node_modules` 之外（`packages/<包>/…`），
  官方那条规则本来就在编它们；再命中一次就是同一份文件跑两遍 babel（产物一样，白花编译时间）。
- **别的 scope 不认领**：这一族只发在 `@show-docs` 下；别家的 `.ts` 由别家负责。
- **`.d.ts` 不认领**：声明文件没有运行期内容，编它只是白跑一遍。
- **`.jsx` 不认领**：这一族随包发布的是 `.tsx`；官方那条规则的 `test` 含 `.jsx`，但它同样把
  `node_modules` 排除在外 —— 哪天真要发 `.jsx`，把这一格放宽即可（判据只有这一处）。
- **`.mts` / `.cts` 不认领**：官方那条规则的 `test` 是 `/\.[jt]sx?$/i`，同样不含这两类 ——
  它们由 Node 自己带类型擦除加载（配置期那几份），不进浏览器 bundle。
*/

import type { Plugin } from '@docusaurus/types';

import { resolveFromCore } from './layers.mts';
import type { LoggerLike } from './types.mts';

/** `.ts` / `.tsx` */
const DOT_TS = /\.tsx?$/;

/** 声明文件：`.d.ts` 也以 `.ts` 结尾，先排掉 */
const DECLARATION = /\.d\.ts$/;

/**
`node_modules/@show-docs/` 这一段。分隔符两种都认：Windows 上是 `\`、posix 上是 `/`，
而 webpack 交给 `include` 的是**资源路径**（跟着站点根走，两种都可能）。

pnpm 的隔离布局也认：`node_modules/.pnpm/@show-docs+<包>@<版本>/node_modules/@show-docs/<包>/…`
—— 那一段 `node_modules/@show-docs/` 照样在。
*/
const SCOPE_DIR = /[\\/]node_modules[\\/]@show-docs[\\/]/;

/**
这个文件要不要由本包那条规则接管。

判据与官方 `excludeJS` 对齐：**官方那条不编的（`node_modules` 里的），本包才编**。
官方那条还额外放行 `docusaurus*.js[x]`，但本包只碰 `.ts` / `.tsx`，那一格与它无关。
*/
export function needsShowDocsSourceRule(modulePath: string): boolean {
  return (
    DOT_TS.test(modulePath) &&
    !DECLARATION.test(modulePath) &&
    SCOPE_DIR.test(modulePath)
  );
}

/** `configureWebpack` 第三个参数（`utils`）的类型，从官方那份签名推出来。 */
type ConfigureWebpackUtils = Parameters<
  NonNullable<Plugin['configureWebpack']>
>[2];

/**
官方那条 babel loader 的形状：从 `getJSLoader()` 的返回值推出来，不另引 `webpack` 的类型
（那份 `RuleSetRule` 只是官方签名里借用的一个泛用形状）。
*/
type JsLoader = ReturnType<ConfigureWebpackUtils['getJSLoader']>;

/**
那条规则的形状。本包不引 `webpack`（`@docusaurus/types` 那份签名已经够用），
只描述真正用到的那几格。
*/
export interface SourceJsRule {
  /** 只收 `.ts` / `.tsx`（md、css 归别的规则） */
  test: RegExp;
  /** 认领范围：见 {@link needsShowDocsSourceRule} */
  include: (file: string) => boolean;
  /** 官方给插件作者的 babel loader（客户端与服务端各一份） */
  use: [JsLoader];
}

/**
造出那条规则。`use` 用官方给的 `getJSLoader()`，并把官方那条 JS 规则用的**同一格
`babelOptions`** 一起传进去（见 {@link siteBabelConfigPath}）；差别只在「哪些文件归它」。
*/
export function showDocsSourceRule(
  utils: ConfigureWebpackUtils,
  isServer: boolean,
  babelOptions?: string,
): SourceJsRule {
  return {
    test: /\.tsx?$/,
    include: (file: string) => needsShowDocsSourceRule(file),
    use: [utils.getJSLoader({ isServer, babelOptions })],
  };
}

/** 官方 `@docusaurus/babel` 导出里我们唯一用到的那个函数。 */
type BabelModule = {
  getCustomBabelConfigFilePath?: (
    siteDir: string,
  ) => Promise<string | undefined>;
};

/**
站点那份自定义 babel 配置文件的绝对路径（没有则 `undefined`），**取官方同一个产地**：
`@docusaurus/babel` 的 `getCustomBabelConfigFilePath`。

为什么这一格必须传：官方那条 JS 规则传的就是它（core `lib/webpack/base.js` 里
`createJsLoader({ isServer, babelOptions: await getCustomBabelConfigFilePath(siteDir) })`），
不传时 `getBabelOptions` 会退回 `{ babelrc: false, configFile: false }` + 默认 preset。
于是「站点自己的源码」按站点的 `babel.config.js` 编、「这一族随包发布的源码」按默认配置编
—— 同一份代码两套编译，而差异只体现在产物里。

定位不到 `@docusaurus/babel`（core 结构变了 / 依赖被裁剪）时退回 `undefined` = 今天的行为，
但必须**告警**：静默退回会让「站点配了 babel.config.js 却没生效」看起来像配置写错了。
*/
export async function siteBabelConfigPath(
  siteDir: string,
  logger: LoggerLike,
): Promise<string | undefined> {
  const babel = resolveFromCore<BabelModule>(siteDir, '@docusaurus/babel');
  const getFilePath = babel?.getCustomBabelConfigFilePath;
  if (typeof getFilePath !== 'function') {
    logger.warn?.(
      '[plugin-prev-layer-resolver] 拿不到 @docusaurus/babel 的 getCustomBabelConfigFilePath，' +
        '本包那条 TS 源码规则将用默认 babel 配置编译；若站点有自己的 babel.config.js，' +
        '这一族的源码会和站点源码走两套编译。',
    );
    return undefined;
  }
  return getFilePath(siteDir);
}
