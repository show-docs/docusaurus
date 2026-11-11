import type { WordCount } from '../types/word-count.ts';

/**
配置期这一侧的唯一一份「怎么合」：逐字段相加、按目录滚上去、以及一个全 0 的底。

`WordCount` 的每一项都是数，所以相加按字段名走一遍就够 —— 加一项明细时不必回来再抄一行
（漏抄的那一项会让合计少一截，而且不报错）。浏览器期不再做加法：`instances` 与 `folders`
都在这里先合好，页面只查表。
*/

/** 全 0 的那一格：空版本、空目录的底。 */
export const EMPTY: WordCount = {
  blockquotes: 0,
  characters: 0,
  cjk: 0,
  codeBlocks: 0,
  codeLines: 0,
  drafts: 0,
  externalLinks: 0,
  frontmatter: 0,
  graphs: 0,
  h1: 0,
  h2: 0,
  h3: 0,
  h4: 0,
  h5: 0,
  h6: 0,
  headingIds: 0,
  images: 0,
  internalLinks: 0,
  latin: 0,
  pages: 0,
  tables: 0,
  words: 0,
};

/** 两格逐项相加；`left` 不动，交回新的一份。 */
export function add(left: WordCount, right: WordCount): WordCount {
  const total = { ...left };

  for (const key of Object.keys(total) as (keyof WordCount)[]) {
    total[key] += right[key];
  }

  return total;
}

/** 一组页合成一格；空数组就是 `EMPTY` 的那一份数。 */
export function sumOf(counts: readonly WordCount[]): WordCount {
  return counts.reduce((total, count) => add(total, count), EMPTY);
}

/**
按目录合好的那一张表：每页往它自己的目录记一次，再往上一层层记，直到地址的根。

往上那一层层是给「内容根根目录那一页」用的：`@site/docs/a.md` 的目录是 `@site/docs`，
而 `@site/packages/x/README.md` 那两页要看的是 `@site/packages/x` 底下所有子目录 —— 只在
最末一层目录记数的话，目录根那一页就挑不到数。键不带结尾的 `/`（`@site/docs`），页面侧
砍掉 `source` 最后一段后直接查。

同一份目录被两个实例挂上时（两棵内容根指向同一个目录）是两边合计：这一层不按实例切，
和 `folder` 范围的口径一致。
*/
export function foldersOf(
  docs: Readonly<Record<string, WordCount>>,
): Record<string, WordCount> {
  const folders: Record<string, WordCount> = {};

  for (const [source, count] of Object.entries(docs)) {
    let cut = source.lastIndexOf('/');

    while (cut > 0) {
      const folder = source.slice(0, cut);

      folders[folder] = add(folders[folder] ?? EMPTY, count);
      cut = folder.lastIndexOf('/');
    }
  }

  return folders;
}
