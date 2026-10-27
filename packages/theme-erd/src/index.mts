// 这一行是**给产物声明文件**用的：`erdiagram` 自家没带类型声明，本包替它写了一份
// （包根的 `erdiagram.d.ts`）。TypeScript 只在源码本身是声明文件时才把 reference 指令
// 写进产物，所以构建那一步（`scripts/emit-type-references.mjs`）把它搬进
// `dist/index.d.mts` —— 消费方拿到的类型入口正是那一份。
// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- 这一条指向的是**环境声明**（没有导出的模块），换不成 import
/// <reference path="../erdiagram.d.ts" />
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-iframe/lib/prerequisites.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { normalizeExports, planExports } from './options.mts';
import type { ErdThemeOptions } from './types.mts';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** `configureWebpack` 第一个参数的类型：从官方那份签名推出来，本包不直接引 `webpack`。 */
type WebpackConfig = Parameters<NonNullable<Plugin['configureWebpack']>>[0];

const DBML = /\.dbml$/;

/** 让官方的 MDX 规则也收 `.dbml`：loader 链的第一段由本包的 dbml-loader 产出。 */
function includeDbmlInMdxRules(config: WebpackConfig): void {
  const rules = config.module?.rules ?? [];

  for (const rule of rules) {
    if (
      typeof rule !== 'object' ||
      rule === null ||
      !('test' in rule) ||
      !(rule.test instanceof RegExp)
    ) {
      continue;
    }

    // 两道都要：①那条规则的**正则文本**本身就写着 mdx（官方那条是 `/\.mdx?$/`）——
    // 只按「能否匹配 `.mdx`」判会连 `/./`、`/^.*$/` 这类兜底规则一起改掉，
    // 把 `.dbml` 塞进不相干的 loader 链；②确实匹配 `.mdx`。
    // 新建一个正则再试：带 `g` 标志的正则 `test` 会推进 `lastIndex`
    if (
      /mdx/i.test(rule.test.source) &&
      new RegExp(rule.test.source, rule.test.flags).test('.mdx')
    ) {
      rule.test = /(\.mdx?|\.dbml)$/i;
    }
  }
}

/**
官方给插件 options 留的校验格。

本包不引 Joi（家族里没有一个包引它），判据写在 `src/options.mts` 的纯函数里，这里是
那格的一个薄壳；构造期 {@link theme} 还会再走一遍同样的判据 —— 站点按包名声明主题时，
两条路径都可能拿到声明原值。返回值里的 `exports` 各项已归一化，路径仍留给构造期按站点根解析。
*/
export function validateOptions({
  options,
}: {
  options: unknown;
}): ErdThemeOptions {
  const declared = (options ?? {}) as ErdThemeOptions;

  return declared.exports === undefined
    ? {}
    : { exports: normalizeExports(declared.exports) };
}

export default function theme(
  context: LoadContext,
  options: ErdThemeOptions = {},
): Plugin {
  // 模板页那几格要装载哪些生成器，在这里一次算完（站点没写就是空清单，本包不随带模板），
  // 往下只递纯数据：webpack 会把 loader 的 options 序列化进配置，函数过不去。
  const exports = planExports(options, { siteDir: context.siteDir });

  return {
    name: '@show-docs/docusaurus-theme-erd',
    loadContent() {
      // 本层的 `ViewLayerDocItem` 住在 theme-iframe 未编译的 `lib/` 里：那个包没装，
      // 站点就会在 `view-layer-shell.tsx` 上撞 `Module not found`。
      assertThemePrerequisites(context, {
        namespace: '@show-docs/docusaurus-theme-erd',
        iframe: true,
      });
    },
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 剩下的东西（入口、loader、类型）。
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
    configureWebpack(config, isServer, utils) {
      // webpack 的 loader 链按**规则顺序从右往左**执行：排在最后的 `dbml-loader` 先把
      // DBML 转成 MDX，官方 mdx-loader 接着编译，这条 babel 规则再收口。所以它必须排在
      // MDX 规则**前面**；返回值里的规则只会追加到末尾，这个位置只能改传进来的 config。
      config.module?.rules?.unshift({
        test: DBML,
        use: [utils.getJSLoader({ isServer })],
      });

      includeDbmlInMdxRules(config);

      return {
        module: {
          rules: [
            {
              // `erdiagram` 的 ESM 入口里有 `css-bit/dist/antd-color` 这种不带扩展名的
              // 请求；webpack 对 `.mjs` 默认按 fullySpecified 解析，会在浏览器 bundle 里
              // 报 `Can't resolve`。放行整类 `.m?js` 是本包依赖链能进 bundle 的条件。
              test: /\.m?js$/,
              resolve: { fullySpecified: false },
            },
            {
              // 官方 MDX 规则之后跑：收到 `.dbml` 原文，产出交给 mdx-loader
              // Webpack 按**文件路径**取 loader，不走模块解析，所以这里写的必须是产物名
              // （`.mjs`），不是源码名 —— 上面的 `thisDir` 就是 `dist/`。
              test: DBML,
              loader: resolve(thisDir, './loader/dbml-loader.mjs'),
              // 纯数据：`exports` 里每一项的 `module` 已是绝对路径，loader 只管装载
              options: { exports },
            },
          ],
        },
      };
    },
  };
}
