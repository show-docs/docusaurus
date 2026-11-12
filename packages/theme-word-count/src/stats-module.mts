import type { WordCountStats } from '../types/word-count.ts';

import type { StatsUsage } from './content.mts';

/**
`@generated/theme-word-count/stats` 那份文件的内容。

这份东西本来就在 Node 侧算好，只差一步交给浏览器侧：打包器只认模块，不认「配置期一个变量」，
所以走生成模块那一条老路（与 `theme-component-page` 那两份生成表同一个办法）—— 写进 Docusaurus
的生成目录，由 `@generated` 那条别名读回来。

**里面只有数，没有日期也没有 git 状态**：那两样每次构建都不同，会把「同一份内容根两次构建出
同一份产物」这条本该看得见的性质变成永远看不见，而它对本包的用处只是「数是多少」。

**只铺浏览器会查的那几格**：合计、分组、实例合计照旧全铺（`site` / `instance` 范围读它们）；
每页明细（`docs`）与每目录明细（`folders`）只铺正文里真写了 `page` / `folder` 指令的那几格 ——
`usage` 就是配置期扫出来的那份「哪页写了哪种范围」。本站五十多页里只有一页写 `page` / `folder`，
裁掉用不到的明细，这份模块从约 28 KB 降到约 2 KB。不传 `usage` 时不裁（整份铺出去）。
裁的判据与数词、改写指令共用同一个扫描器、看同一份原文，所以「铺了哪几格」与「正文里会出现
哪种范围」天然一致。

`JSON.stringify` 的写法（两格缩进）：写得出去的就是纯数据（串 / 数 / 布尔 / 普通对象 / 数组），
本包交出去的这几格全是数与串，所以这一格不必像机制层那样先在配置期校验一遍形状。
*/
export function renderStatsModule(
  stats: WordCountStats,
  usage?: StatsUsage,
): string {
  const shipped = usage === undefined ? stats : prune(stats, usage);

  return `// 这份文件由 @show-docs/docusaurus-theme-word-count 在配置期生成，别手改。
// 要改的是各 docs 实例加载到的那批文件；改完重启站点（\`docusaurus start\` 会重跑那一步）。
// 形状在本包 types/word-count.d.ts，读它的是本包 theme/WordCount。
export const stats = ${JSON.stringify(shipped, undefined, 2)};
`;
}

/** 每页 / 每目录明细只留指令用到的那几格；合计与分组不动。 */
function prune(stats: WordCountStats, usage: StatsUsage): WordCountStats {
  const pages = new Set<string>();
  const folders = new Set<string>();

  for (const [source, scopes] of Object.entries(usage)) {
    if (scopes.includes('page')) {
      pages.add(source);
    }

    if (scopes.includes('folder')) {
      // 与浏览器侧 ofFolder 同一种砍法：砍掉最后一段就是它要查的那一格
      const cut = source.lastIndexOf('/');

      if (cut !== -1) {
        folders.add(source.slice(0, cut));
      }
    }
  }

  return {
    ...stats,
    docs: Object.fromEntries(
      Object.entries(stats.docs).filter(([source]) => pages.has(source)),
    ),
    folders: Object.fromEntries(
      Object.entries(stats.folders).filter(([folder]) => folders.has(folder)),
    ),
  };
}
