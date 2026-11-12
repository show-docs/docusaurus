import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoadContext, Plugin } from '@docusaurus/types';

import type { WordCountLogger } from './content.mts';
import { collectStats } from './content.mts';
import { installPreprocessor } from './directive.mts';
import { renderStatsModule } from './stats-module.mts';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本包的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-word-count';

/** 本包的插件选项。 */
export interface WordCountThemeOptions {
  /**
  注入 logger（测试用）；缺省用 `console`。官方 `LoadContext` 里没有 logger 这一格，
  本包只用它报「哪一份文件解析不动、按 0 计」那种告警。
  */
  logger?: WordCountLogger;
}

/**
生成文件相对 `generatedFilesDir` 的位置。浏览器侧那句 `@generated/<这一串>` 与它必须一字不差，
形状与那份声明在哪一格见本包 `docs/internals.md`。
*/
const STATS_FILE = join('theme-word-count', 'stats.ts');

/**
本层的入口：`loadContent()` 把 `:::word-count` 的预处理器包到站点那份
`markdown.preprocessor` 上，`allContentLoaded()` 算出全站那份统计并铺成浏览器读得到的
生成模块，`getThemePath()` 挂本包那一层（里面只有 `WordCount` 那一块）。

**触发条件是正文里那一行 `:::word-count`**，不是 frontmatter 里的一把键：指令写在哪儿，
那一块就出现在哪儿，正文其余部分一个字都不动。它由预处理器换成 `<__WordCount />`
（`./directive.mts`），换出来的是 MDX 正文里的一个普通组件 —— 本层因此不再向
`@show-docs/docusaurus-theme-component-page` 交规则，也不要求站点再注册任何一层。

**为什么挂在 `markdown.preprocessor`**：Docusaurus 的 `markdown` 配置没有给主题层留
`remarkPlugins`（那几格按内容插件各配各的），主题包零配置能改的就只有这一格。它在 MDX
编译前拿到文件原文，指令那一行换成组件、文首补一句 import；限制（这一份文件必须按 MDX
解析）记在 README 的「已知限制」。

**为什么算在 `allContentLoaded` 而不是 `postBuild`**：产物里的数字要能被静态渲染看见，而
`postBuild` 跑在 HTML 已经写完之后 —— 那时算出来的数只赶得上下一轮构建。这一步是配置期唯一
「所有插件的 content 都已到齐」的点，客户端打包在它之后，所以生成模块赶得上第一次打包。
每轮都从完整的 `allContent` 重算：没有「这一轮只看到一部分内容根就先把数铺出去」的中间状态。
逐文件的明细按原文 memo（`./content.mts`），dev 下改一份文档只重数那一份；渲染出来的模块
与上一轮一字不差时不写盘 —— 写一遍会让打包器重编这份模块、浏览器跟着白刷一次。

`theme/` 是本层静态的那一半，不经 `tsc`：用本包的 Docusaurus 项目会用自己的 babel 编译它。
「谁来编」归 `@show-docs/docusaurus-plugin-compile-source`，本包不自己补 babel 规则。
*/
export default function theme(
  context: LoadContext,
  options: WordCountThemeOptions = {},
): Plugin {
  const { markdown } = context.siteConfig;
  const logger = options.logger ?? console;

  /**
  把预处理器包上去，只包一次。

  时机必须在第一次 MDX 编译之前：所有插件的 `loadContent()` 都早于 webpack 配置，而
  mdx-loader 在 `configureWebpack()` 里读的是同一个 `siteConfig.markdown` 对象。
  */
  const install = () => {
    installPreprocessor(markdown);
  };

  return {
    name: NAMESPACE,
    loadContent() {
      install();
    },
    // 插件被单独 reload（`reloadSite()`）时会重跑这一阶段
    contentLoaded: install,
    async allContentLoaded({ allContent }) {
      const { stats, usage } = await collectStats(allContent, context, logger);
      const target = join(context.generatedFilesDir, STATS_FILE);
      const rendered = renderStatsModule(stats, usage);
      const previous = existsSync(target)
        ? readFileSync(target, 'utf8')
        : undefined;

      // 数没变就不写：dev 下改一份与统计无关的文件也会重跑这一步，写一遍等于让浏览器白刷一次
      if (previous === rendered) {
        return;
      }

      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, rendered);
    },
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
  };
}
