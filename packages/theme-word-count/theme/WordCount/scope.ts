import type { WordCount, WordCountStats } from '../../types/word-count.ts';

/**
三种范围各从生成模块的哪一格取数。

配置期已经把「按实例」「按目录」合好了（见 `../../src/aggregate.mts` 与 `content.mts`），
这里只查表：页面里不做加法，也就不会出现「两处求和口径各写一遍」。
*/

/** 本页：明细里那一格；键就是清单里的 `@site/…`，与 `useDoc().metadata.source` 同源。 */
export function ofPage(
  stats: WordCountStats,
  source: string,
): WordCount | undefined {
  return stats.docs[source];
}

/**
本文件夹（含子目录）：`source` 砍掉最后一段去查配置期合好的那一张表。

表里的每一格含所有子目录；键不带结尾 `/`，所以 `docs/guide` 收不到 `docs/guides/…`。
地址里没有 `/` 时挑不出目录，交回 `undefined`。
*/
export function ofFolder(
  stats: WordCountStats,
  source: string,
): WordCount | undefined {
  const cut = source.lastIndexOf('/');

  return cut === -1 ? undefined : stats.folders[source.slice(0, cut)];
}

/** 所在内容根：`instances` 里已经按实例合好的那一格。 */
export function ofInstance(
  stats: WordCountStats,
  instance: string,
): WordCount | undefined {
  return stats.instances[instance];
}
