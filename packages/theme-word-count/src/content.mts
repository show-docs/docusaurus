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
  WordCountScope,
  WordCountStats,
} from '../types/word-count.ts';

import { add, EMPTY, foldersOf, sumOf } from './aggregate.mts';
import { directiveScopes, withoutWordCountDirectives } from './directive.mts';
import { measureMarkdown, measureText } from './measure.mts';

/** 告警通道：缺省 `console`，测试注入一份假的收消息。与 theme-component-page 同一形状。 */
export interface WordCountLogger {
  warn?: (...args: unknown[]) => void;
}

/** 一份文件数出来的那两样：明细，以及正文里那几条指令各是什么范围。 */
interface FileCount {
  count: WordCount;
  scopes: WordCountScope[];
}

/**
逐文件 memo：键是磁盘地址，值记下「数它时那份原文与那一份解析器」。

dev 模式下改一份文档会让所有插件的 `allContentLoaded()` 重跑（`reloadPlugin()`），于是这里
每轮都把整份清单重数一遍。原文没变、解析器也没换的那几份直接交回上一轮的结果，只有真改过
的那一份才重新走语法树。按原文 whole-string 比对（不另算哈希）：同一份路径 + 同一份原文 +
同一份解析器，数出来的一定是同一格。`reloadSite()` 重跑工厂会换一份解析器引用，那几份自然
失效重数。
*/
const cache = new Map<
  string,
  { content: string; parser: ParseFrontMatter; result: FileCount }
>();

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
的文档用站点剥好的正文按文字数，结构那几行记 0；它也不经预处理器，正文里写了指令也不会
变成组件，所以范围那一列恒空。

**数不动就告警，不红**：读不到、解析不动的那一份按「1 页、各项 0」计，告警里带上文件路径。
少一排数字不该让整站构建失败 —— 与 git-badge「读不到就不读」同一条取舍。失败的那一份不进
memo（下一轮原文变了或读得到了，照常重数）。
*/
async function countFile(
  file: string,
  parser: ParseFrontMatter,
  logger: WordCountLogger,
): Promise<FileCount> {
  try {
    const fileContent = readFileSync(file, 'utf8');
    const cached = cache.get(file);

    if (
      cached !== undefined &&
      cached.content === fileContent &&
      cached.parser === parser
    ) {
      return cached.result;
    }

    const { content, frontMatter } = await parseMarkdownFile({
      filePath: file,
      fileContent,
      parseFrontMatter: parser,
    });
    const draft = Boolean(frontMatter.draft);
    const markdown = /\.mdx?$/i.test(file);
    const count = markdown
      ? measureMarkdown(withoutWordCountDirectives(fileContent), draft)
      : measureText(content, draft, Object.keys(frontMatter).length > 0);
    const result: FileCount = {
      count,
      scopes: markdown ? directiveScopes(fileContent) : [],
    };

    cache.set(file, { content: fileContent, parser, result });

    return result;
  } catch (error) {
    // 解析器报的行号只对这份字符串有效，把文件路径补在前面，构建日志里才找得到是哪一页
    logger.warn?.(`字数统计：解析 ${file} 失败，这一页按 0 计`, error);

    return { count: { ...EMPTY, pages: 1 }, scopes: [] };
  }
}

/**
浏览器侧真正会查的那几格：键是清单里的 `source`，值是这一页正文里那几条指令的范围。
只有写了 `page` / `folder` 的页需要每页 / 每目录明细；`instance` / `site` 读合好的总数。
`renderStatsModule` 拿它把用不到的明细裁掉（见那一份的注释）。
*/
export type StatsUsage = Record<string, readonly WordCountScope[]>;

/**
全站那一份统计：把清单里每一条（含草稿）解成文件、逐页数完，再按「实例 + 版本」各合一格，
同时留下每页、每个实例、每个目录的明细。

格子的顺序跟着清单走（实例、版本），同一份内容根每次都是同一份产物。
`docs` 的键就是清单里的 `source`（`@site/…`），浏览器侧拿 `useDoc().metadata.source` 直接查；
`instances` 与 `folders` 是配置期先合好的，页面里不做加法。

交回两样：`stats` 是完整的那一份（合计、分组、实例、目录、每页都全），`usage` 记下哪几页
写了哪种范围的指令 —— 铺给浏览器的那一份按 `usage` 裁，统计本身不裁。
*/
export async function collectStats(
  allContent: AllContent,
  context: LoadContext,
  logger: WordCountLogger = console,
): Promise<{ stats: WordCountStats; usage: StatsUsage }> {
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
  const usage: StatsUsage = {};

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
          const { count, scopes } = await countFile(
            fileOf(doc.source, siteDir),
            parseFrontMatter,
            logger,
          );

          docs[doc.source] = count;
          if (scopes.length > 0) {
            usage[doc.source] = scopes;
          }
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
    stats: {
      ...sumOf(entries.flatMap(({ counts }) => counts)),
      groups: statsGroups,
      instances,
      folders: foldersOf(docs),
      docs,
    },
    usage,
  };
}
