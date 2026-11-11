/**
**读的是清单，不是目录**：各 docs 实例在 `loadContent()` 里已经把它那棵内容根扫完（`include` /
`exclude`、草稿、版本化目录都算过了），本包只把那份清单里的每一条地址解回磁盘上那一份文件。
于是「统计覆盖了哪些页」与「站点渲染了哪些页」天然是同一份口径 —— 站点里多一棵内容根、
换一条 include、开一个版本，这里都不必跟着改，也不必由站点再转述一遍那三格。

草稿也在清单里：生产构建把 `draft` 的那几份分到 `drafts`，开发模式留在 `docs`，两处都读、
只读一次。明细里另记一行「草稿数量」，与参考实现一致 —— 草稿也算进其它各项。

分组按「实例 id + 版本」：本站两份实例因此各占一格（`default` 与 `themes`），
不必读站点配置里那三格转述。实例合计与目录合计也在这里先合好：浏览器侧只查表。
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

import { add, EMPTY, foldersOf, sumOf } from './aggregate.mts';
import { withoutWordCountDirectives } from './directive.mts';
import { measureMarkdown, measureText } from './measure.mts';

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
  /** 生产构建里被分出去的那几份草稿；开发模式这一格是空的（草稿留在 `docs` 里）。 */
  drafts?: readonly DocLike[];
}

/** 一份 docs 实例的 content 里，本包只看的那一格。 */
interface DocsContentLike {
  loadedVersions?: readonly VersionLike[];
}

/** 清单里那一个 `@site/` 地址解回磁盘上的那一份文件。 */
function fileOf(source: string, siteDir: string): string {
  // 反解而不是自己截那一段：形状不是 `@site/` 打头时官方那一位当场抛，
  // 比安静拼出一条不存在的路径好查。
  return path.resolve(siteDir, aliasedSitePathToRelativePath(source));
}

/**
一份文件的全部明细：markdown 走语法树，其余文档按整份正文数。

frontmatter 用的就是站点渲染这一页时那一份解析器（`siteConfig.markdown.parseFrontMatter`，
别的层可以包住它），所以「哪一份算草稿」与页面那一侧的判据是同一个；正文里的标题行照数，
那是看得见的文字。`:::word-count` 那一行是看不见的语法，与预处理器共用同一个扫描器剥掉。

站点清单里不只有 `.md` / `.mdx`：本站还把 `.dbml` 收进 docs（它由自己的 loader 渲染，不按
MDX 编译）。那一份交给 MDX 解析器会当场报 acorn 错，所以按扩展名分两条路 —— 非 markdown
的文档用站点剥好的正文按文字数，结构那几行记 0。
*/
async function countFile(
  file: string,
  parseFrontMatter: ParseFrontMatter,
): Promise<WordCount> {
  const fileContent = readFileSync(file, 'utf8');
  const { content, frontMatter } = await parseMarkdownFile({
    filePath: file,
    fileContent,
    parseFrontMatter,
  });
  const draft = Boolean(frontMatter.draft);

  try {
    return /\.mdx?$/i.test(file)
      ? measureMarkdown(withoutWordCountDirectives(fileContent), draft)
      : measureText(content, draft, Object.keys(frontMatter).length > 0);
  } catch (error) {
    // 解析器报的行号只对这份字符串有效，把文件路径补在前面，构建日志里才找得到是哪一页
    throw new Error(`解析 ${file} 失败`, { cause: error });
  }
}

/**
全站那一份统计：把清单里每一条（含草稿）解成文件、逐页数完，再按「实例 + 版本」各合一格，
同时留下每页、每个实例、每个目录的明细。

格子的顺序跟着清单走（实例、版本），同一份内容根每次都是同一份产物。
`docs` 的键就是清单里的 `source`（`@site/…`），浏览器侧拿 `useDoc().metadata.source` 直接查；
`instances` 与 `folders` 是配置期先合好的，页面里不做加法。
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
  /** 实例 id → 那一份内容根已经数到的那些页（各版本先合在一起）。 */
  const instances: Record<string, WordCount> = {};
  /** 每页的明细：键是清单里的 `source`，值就是这一份文件交回的那一整格。 */
  const docs: Record<string, WordCount> = {};

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

        // 生产构建里草稿在 `drafts`，开发模式里在 `docs`；两处并起来正好各读一次。
        for (const doc of [...version.docs, ...(version.drafts ?? [])]) {
          const count = await countFile(
            fileOf(doc.source, siteDir),
            parseFrontMatter,
          );

          docs[doc.source] = count;
          group.counts.push(count);
          instances[instance] = add(instances[instance] ?? EMPTY, count);
        }
      }
    }
  }

  const entries = groups.values().toArray();
  const statsGroups: WordCountGroup[] = entries.map(({ counts, ...one }) => ({
    ...one,
    ...sumOf(counts),
  }));

  return {
    ...sumOf(entries.flatMap(({ counts }) => counts)),
    groups: statsGroups,
    instances,
    folders: foldersOf(docs),
    docs,
  };
}
