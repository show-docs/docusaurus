import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from '@docusaurus/types';

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

    // 新建一个正则再试：带 `g` 标志的正则 `test` 会推进 `lastIndex`
    if (new RegExp(rule.test.source, rule.test.flags).test('.mdx')) {
      rule.test = /(\.mdx?|\.dbml)$/i;
    }
  }
}

export default function theme(): Plugin {
  return {
    name: '@show-docs/docusaurus-theme-erd',
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 剩下的东西（入口、loader、类型）。
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
            },
            {
              // 官方那条 babel 规则排除整个 node_modules、只放行 `docusaurus*.js`，本包从
              // npm 安装后的 `.tsx` 会报 `Module parse failed`。补一条只覆盖本包的规则
              // （理由与代价见 theme-iframe 的 `lib/api-frame-theme.mts` 里同一条）。
              test: /\.tsx?$/,
              include: [resolve(thisDir, '..')],
              use: [utils.getJSLoader({ isServer })],
            },
          ],
        },
      };
    },
  };
}
