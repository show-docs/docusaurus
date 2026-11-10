/**
**读的是清单，不是目录**：各 docs 实例在 `loadContent()` 里已经把它那棵内容根扫完（`include` /
`exclude`、草稿、版本化目录都算过了），本包只把那份清单里的每一条地址解回磁盘上那一份文件。
于是「统计覆盖了哪些页」与「站点渲染了哪些页」天然是同一份口径 —— 站点里多一棵内容根、
换一条 include、开一个版本，这里都不必跟着改，也不必由站点再转述一遍那三格。

草稿不在清单里：官方在 `loadVersion` 里就把 `draft` 的那几份分出去了，剩下的 `docs` 才是清单。
未列出（`unlisted: true`）的那几份仍在清单里，照数 —— 它们也是会被渲染的页面。

分组按「实例 id + 版本」：本站两份实例因此各占一格（`default` 与 `themes`），
不必读站点配置里那三格转述。
*/

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  AllContent,
  LoadContext,
  ParseFrontMatter,
} from '@docusaurus/types';
import {
  aliasedSitePathToRelativePath,
  parseMarkdownFile,
} from '@docusaurus/utils';

import type {
  WordCount,
  WordCountGroup,
  WordCountStats,
} from '../types/word-count.ts';

import { countWords } from './count.mts';

/** 一份文档在清单里被认出来的那几格（其余各格本包一眼都不看）。 */
interface DocLike {
  id: string;
  /** 那一份文件在站点里的地址：`aliasedSitePath()` 写出来的那一种，`@site/` 打头。 */
  source: string;
}

/** 一个版本交回来的那一格。 */
interface VersionLike {
  /** 显示名；没写时官方用版本名顶上（下面 `label` 那一句就是这一跳）。 */
  label?: string;
  versionName: string;
  docs: readonly DocLike[];
}

/** 一份 docs 实例的 content 里，本包只看的那一格。 */
interface DocsContentLike {
  loadedVersions?: readonly VersionLike[];
}

/** 每一格攒着的那些页的计数，最后合一次（`./count.mts` 交回的三份数字）。 */
function sumOf(counts: readonly WordCount[]): WordCount {
  return counts.reduce(
    (total, count) => ({
      cjk: total.cjk + count.cjk,
      latin: total.latin + count.latin,
      words: total.words + count.words,
    }),
    { cjk: 0, latin: 0, words: 0 },
  );
}

/** 清单里那一个 `@site/` 地址解回磁盘上的那一份文件。 */
function fileOf(source: string, siteDir: string): string {
  // 反解而不是自己截那一段：形状不是 `@site/` 打头时官方那一位当场抛，
  // 比安静拼出一条不存在的路径好查。
  return path.resolve(siteDir, aliasedSitePathToRelativePath(source));
}

/**
一份文件里那些「词」：只剥头部那一段 YAML，正文一个字都不动。

frontmatter 用的就是站点渲染这一页时那一份解析器（`siteConfig.markdown.parseFrontMatter`，
别的层可以包住它），所以「剥掉的那一段」与「页面开头看不见的那一段」是同一件事；
正文里的标题行照数，那是看得见的文字。
*/
async function countFile(
  file: string,
  parseFrontMatter: ParseFrontMatter,
): Promise<WordCount> {
  const { content } = await parseMarkdownFile({
    filePath: file,
    fileContent: readFileSync(file, 'utf8'),
    parseFrontMatter,
  });

  return countWords(content);
}

/**
全站那一份统计：把清单里每一条解成文件、逐页数完，再按「实例 + 版本」各合一格。

格子的顺序跟着清单走（实例、版本），同一份内容根每次都是同一份产物；
`pages` 就是那一格里数到的页数，不另数一遍。
*/
export async function collectStats(
  allContent: AllContent,
  context: LoadContext,
): Promise<WordCountStats> {
  const { siteDir, siteConfig } = context;
  const { parseFrontMatter } = siteConfig.markdown;
  /** 「实例 + 版本」→ 那一格已经数到的那些页。 */
  const groups = new Map<
    string,
    { instance: string; version: string; counts: WordCount[] }
  >();

  for (const byId of Object.values(allContent)) {
    for (const [instance, content] of Object.entries(byId)) {
      // 不是 docs 实例的那些 content 走到这里就是空的一列：本包不看它们的其余各格。
      const versions =
        (content as DocsContentLike | null | undefined)?.loadedVersions ?? [];

      for (const version of versions) {
        const label = version.label ?? version.versionName;
        const key = `${instance}\0${label}`;
        const group = groups.get(key) ?? {
          instance,
          version: label,
          counts: [],
        };

        groups.set(key, group);

        for (const doc of version.docs) {
          const count = await countFile(
            fileOf(doc.source, siteDir),
            parseFrontMatter,
          );

          group.counts.push(count);
        }
      }
    }
  }

  const entries = groups.values().toArray();
  const statsGroups: WordCountGroup[] = entries.map(({ counts, ...one }) => ({
    ...one,
    ...sumOf(counts),
    pages: counts.length,
  }));

  return {
    ...sumOf(entries.flatMap(({ counts }) => counts)),
    pages: statsGroups.reduce((total, group) => total + group.pages, 0),
    groups: statsGroups,
  };
}
