/**
把某一份第三方静态样式表从「并进全站那一份 css」改成「单独一个产物」。

## 为什么要在构建期动手

Docusaurus 把每一个 css 导入都并进同一个 `styles` chunk（`splitChunks.styles` 那条
`type: 'css/mini-extract'` 加 `enforce: true`，为的就是不让多份 css 的加载顺序变成不确定的）。
于是 `import '@scalar/api-reference/style.css'` 这类写法**一定**落进全站那一份，产物里每条页面都
`<link>` 同一个文件 —— iframe 隔得住 DOM、脚本、localStorage 与路由，隔不住这种构建期就写进 html
的静态样式。

本仓要摘出打包的是**两份**样式表（Scalar 与 Elements 那两份出厂静态表；Redoc 的样式由它自己在运行时
注入，不走 webpack，所以没有这一格）：改成一个 `asset/resource` 资源，`import` 拿到的是它的**地址**
（一个字符串），由框内那份文档自己挂一条 `<link>`。

## 两条规则同时命中的麻烦

加了资源规则还不够：原来那条 `css-loader` 规则仍会命中同一份文件，会把 loaders 与资源类型叠在
一起。所以除了插规则，还要把它从**带 loader 的规则**里摘出去。

判据不是抄官方那条 `.css` 规则的正则（版本一变就对不上），而是拿 `probe` 那个假路径去试每一条带
`use` 的规则 —— 官方哪天改了规则的形状，这一条会失配。失配**不静默**：一条都没命中就当场抛，
症状不再是「产物里少了那个独立 css 文件、样式漏回全站那一份、等 e2e 红」。这条路口和本仓其余
配置期那几条判据同一口径：报错点本来隔着一整个构建，所以在配置期就点名。

`?url` 那种行内查询是 Vite / Rspack 的写法，webpack 5 没有这一条（实测：请求连规则匹配都没走到，
先在包的 `exports` 那一步就报 `./styles.min.css?url is not exported`）；这里靠规则匹配，不靠查询串。

**配置期代码**：跑在 Node 里（各包的入口经 jiti 直接吃这份 `.ts`），不引 React、不引 DOM；
所以它和浏览器那几份分开放：这一份的判据是 webpack 的 `Configuration`，不是 DOM。
*/

import type { Configuration, RuleSetRule } from 'webpack';

export type IsolateCssOptions = {
  /** 要摘出来的那份样式表，相对包的安装路径（例如 `styles.min.css`）。 */
  file: RegExp;
  /** 探测用的假路径：拿它去试每条带 `use` 的规则，命中就把 `file` 加进那条规则的 `exclude`。 */
  probe: string;
  /** 产物目录（相对站点根），默认 `assets/css`。 */
  filename?: string;
};

/**
把这份样式表从「交给 css-loader 处理」改成「当一个资源发出去」。

改的是传进来的 `config` **本身**，不返回值：官方 `applyConfigureWebpack` 用 webpack-merge 拼接，
数组策略是 concat，返回整体等于把 `rules` 翻倍（症状是每个 `.module.css` 被 css-loader 处理两遍、
第二遍拿到的是上一遍的 JS 产物）。这条与 `packages/plugin-prev-layer-resolver` 里「只返回自己那一个
resolver」是同一件事。

**没有任何带 loader 的规则命中 `probe` 时抛**（连 `module` 都没有也算）：那份样式表摘不出去，
放着不抛就是让样式漏回全站那一份，要等构建跑完、e2e 才红 —— 红的还是「样式不该在这里」这种间接症状。
*/
export function isolateRendererCss(
  config: Configuration,
  options: IsolateCssOptions,
): void {
  const { module } = config;
  if (!module) {
    throw new Error(
      nothingToIsolateMessage(options, '这份 webpack 配置里没有 `module`'),
    );
  }

  module.rules ??= [];

  // 注意：webpack 5 里 `rules[0]` 那条 `...`（项目内所有规则都排在这个占位符**之后**）本身不会去
  // 匹配文件，所以插到 `unshift` 的位置上，资源规则根本不会命中 —— 第一次就是这么栽的：`styles.css`
  // 里 1510 处 `.scalar-app` 一处没少。`push` 才是「排在项目规则之后、url 资源规则之前」的位置。
  const matched: (RuleSetRule & { test: RegExp })[] = [];
  for (const rule of module.rules) {
    // 新建一个正则再试：带 `g` 标志的正则 `test` 会推进 `lastIndex`，同一条规则试两次结果就变了。
    if (
      isPlainLoaderRule(rule) &&
      new RegExp(rule.test.source, rule.test.flags).test(options.probe)
    ) {
      matched.push(rule);
    }
  }

  if (matched.length === 0) {
    throw new Error(
      nothingToIsolateMessage(
        options,
        '没有任何带 loader 的规则命中那个探测路径',
      ),
    );
  }

  module.rules.push({
    test: options.file,
    type: 'asset/resource',
    generator: {
      filename: `${options.filename ?? 'assets/css'}/[name].[contenthash:8][ext]`,
    },
  });

  for (const rule of matched) {
    rule.exclude = rule.exclude ? [rule.exclude, options.file] : options.file;
  }
}

/**
零命中那一条路的报错文本：点名是哪一份样式表、后果是什么、判据住在哪。

`probe` 里带着那份表在 `node_modules` 里的真实路径，所以不用另传包名也知道是哪一层出的问题。
*/
function nothingToIsolateMessage(
  options: IsolateCssOptions,
  reason: string,
): string {
  return (
    `isolateRendererCss：${reason}（探测路径 ${options.probe}），` +
    `所以 ${options.file.source} 这一份样式表摘不出打包 —— 它照旧被 css-loader 并进全站那一份，` +
    `每一页都会下载它。多半是官方那条带 css-loader 的规则换了形状（不再是能就地加 \`exclude\` 的` +
    `规则对象，或 \`test\` 不再是正则）；判据与升级检查见本文件与 ` +
    `packages/theme-stoplight/docs/internals.md 的「样式」一节。`
  );
}

/**
只看**带 loader** 的规则：上面那条资源规则没有 `use`，不该被摘出去。
其余形状（字符串 `test`、`oneOf` 之类）不进这一格 —— 本仓那两份样式表命中的都是官方那条
`test: /\.css$/i` 的规则对象。
*/
function isPlainLoaderRule(
  rule: unknown,
): rule is RuleSetRule & { test: RegExp } {
  return (
    typeof rule === 'object' &&
    rule !== null &&
    'use' in rule &&
    rule.use !== undefined &&
    'test' in rule &&
    rule.test instanceof RegExp
  );
}
