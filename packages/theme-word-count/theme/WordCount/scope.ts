import type { WordCount } from '../../types/word-count.ts';

/** 块上摆出来的那一份数：三类词的和，加上这些数来自几页。 */
export type Totals = WordCount & { pages: number };

export const ZERO: Totals = { cjk: 0, latin: 0, words: 0, pages: 0 };

export function add(left: Totals, right: Totals): Totals {
  return {
    cjk: left.cjk + right.cjk,
    latin: left.latin + right.latin,
    words: left.words + right.words,
    pages: left.pages + right.pages,
  };
}

/** 一页在生成模块 `docs` 里那一格：源地址同一个 `@site/…`，页数记作 1。 */
export function ofPage(
  docs: Readonly<Record<string, WordCount>>,
  source: string,
): Totals | undefined {
  const page = docs[source];

  return page === undefined ? undefined : { ...page, pages: 1 };
}

/**
当前页所在文件夹（含子目录）的合计：按源地址前缀挑，不另存一张目录表。

`source` 是 `@site/<相对路径>`，同一目录下的页共享 `@site/<目录>/` 这个前缀；子目录里的页
也以它打头，所以一次前缀求和就含子目录。右侧补的那个 `/` 是分隔：`docs/guide` 那一格收不到
`docs/guides/…`。各内容根的路径不同，天然分开；两个实例挂同一个目录时按目录合计。
*/
export function ofFolder(
  docs: Readonly<Record<string, WordCount>>,
  source: string,
): Totals | undefined {
  const cut = source.lastIndexOf('/');

  if (cut === -1) {
    return undefined;
  }

  const prefix = source.slice(0, cut + 1);
  let totals = ZERO;

  for (const [path, count] of Object.entries(docs)) {
    if (path.startsWith(prefix)) {
      totals = add(totals, { ...count, pages: 1 });
    }
  }

  return totals;
}
