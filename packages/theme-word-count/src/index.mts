import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { collectStats } from './content.mts';
import { renderStatsModule } from './stats-module.mts';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本包的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-word-count';

/**
生成文件相对 `generatedFilesDir` 的位置。浏览器侧那句 `@generated/<这一串>` 与它必须一字不差，
形状与那份声明在哪一格见本包 `docs/internals.md`。
*/
const STATS_FILE = join('theme-word-count', 'stats.ts');

/**
本层的入口：`getThemePath()` 挂本包那一层（里面只有 `WordCountPage`），`loadContent()` 交出
**一份组件与一条规则**（`wordCount` 那一把键、`@theme/WordCountPage`），判表与挂载都在
`@show-docs/docusaurus-theme-component-page` 里；`allContentLoaded()` 算出全站那份统计并铺成
浏览器读得到的生成模块。于是本层有两个前提：那一层要装进站点、并注册成插件，以及**至少有一份
docs 实例**（没有内容根时全站数字全是 0，这一格由数字自己说，配置期不查）。

`wordCount` 那把键的判法是 `boolean`：只有认真布尔 `true`，写串文本或选项对象都不算命中
（判法与落空告警都在机制层）。命中后整页交给 `@theme/WordCountPage`（`render` 缺省即 `page`：
统计摆在正文上方，正文仍由官方 `DocItem` 渲染）；那一页只显示**自己所在实例**的那一份，
挑格的口径见该组件的注释与 `docs/internals.md`。

**为什么算在 `allContentLoaded` 而不是 `postBuild`**：产物里的数字要能被静态渲染看见，而
`postBuild` 跑在 HTML 已经写完之后 —— 那时算出来的数只赶得上下一轮构建。这一步是配置期唯一
「所有插件的 content 都已到齐」的点（机制层铺那张规则表用的也是它），客户端打包在它之后，
所以生成模块赶得上第一次打包。每轮都从完整的 `allContent` 全量重算并整份覆写：
没有「这一轮只看到一部分内容根就先把数铺出去」的中间状态。

组件写的是 `@theme/WordCountPage` 而不是硬路径：站点在 `src/theme/WordCountPage` 放一份就覆写掉它，
与站点自己那一列同一条口径。

`theme/` 是本层静态的那一半，不经 `tsc`：用本包的 Docusaurus 项目会用自己的 babel 编译它。
「谁来编」归 `@show-docs/docusaurus-plugin-compile-source`，本包不自己补 babel 规则。
*/
export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      return {
        componentPage: {
          components: [{ id: 'word-count', component: '@theme/WordCountPage' }],
          rules: [
            { key: 'wordCount', match: 'boolean', component: 'word-count' },
          ],
        },
      } satisfies ComponentPageContent;
    },
    async allContentLoaded({ allContent }) {
      const stats = await collectStats(allContent, context);
      const target = join(context.generatedFilesDir, STATS_FILE);

      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, renderStatsModule(stats));
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
