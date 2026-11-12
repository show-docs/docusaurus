import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoadContext, Plugin } from '@docusaurus/types';

import type { WordCountLogger } from './content.mts';
import { collectStats } from './content.mts';
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
本层的入口：`allContentLoaded()` 算出全站那份统计并铺成浏览器读得到的生成模块，
`getThemePath()` 挂本包那一层（里面只有 `WordCount` 那一块）。

**触发条件是正文里那一行 `::word-count`**（标准 remark-directive 叶指令），不是 frontmatter 里的
一把键：指令写在哪儿，那一块就出现在哪儿，正文其余部分一个字都不动。它由 `./remark/word-count.mts`
那个 remark 插件在**语法树**上换成 `<__WordCount scope="…" />` 并补一句 import —— 所以 `md` 与
`mdx` 两种格式都渲染，不再像旧的文本注入那样在 CommonMark 页面上把源码裸露出来。本层因此不向
`@show-docs/docusaurus-theme-component-page` 交规则。

**怎么让那个 remark 插件跑起来**：Docusaurus 的 `markdown` 配置没有给主题层留 `remarkPlugins`
（那几格按内容插件各配各的），主题拿不到全局注入点，所以本包把插件**导出**成
`@show-docs/docusaurus-theme-word-count/remark`，由站点在自己的 docs/blog/pages 那几份内容插件的
`remarkPlugins` 里登记。不登记时写了 `::word-count` 的页面只会留一个空容器（指令被 remark-directive
认下但没人换成组件），不报错、也不泄漏源码。语法与「认哪些范围」的唯一来源是 `./directive.mts`。
*/
export default function theme(
  context: LoadContext,
  options: WordCountThemeOptions = {},
): Plugin {
  const logger = options.logger ?? console;

  return {
    name: NAMESPACE,
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
