import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { AllContent, LoadContext } from '@docusaurus/types';
import { DEFAULT_PARSE_FRONT_MATTER } from '@docusaurus/utils';

import { collectStats } from '../packages/theme-word-count/src/content.mts';
import { countWords } from '../packages/theme-word-count/src/count.mts';
import wordCountTheme from '../packages/theme-word-count/src/index.mts';
import { renderStatsModule } from '../packages/theme-word-count/src/stats-module.mts';

import { mkdtempReal } from './helpers.mts';

/**
## theme-word-count 的构建期判据

这一层的产物是「全站有多少个词」，判据全在配置期：一个词按哪两把码位表数、清单里那一条 `@site/`
地址解回哪一份文件、几格分组怎么合。这一段没有浏览器参与，`pnpm build` 全绿也证明不了数算得对 ——
只有单测能量；页面上那一格长什么样由 `test/e2e/features/word-count.feature` 钉。

夹具走**磁盘上真的 md 文件**（临时目录里现写），因为这一层最容易坏的地方恰恰是「清单里的地址
解不回文件」和「frontmatter 剥掉的那一段到底算不算」，替身把这两处都替掉了就什么都剩不下。
*/

const tempRoot = mkdtempReal(path.join(os.tmpdir(), 'word-count-'));

afterAll(() => {
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

/**
在临时站点根写一份 md，返回 docs 清单里那条 `source`（`aliasedSitePath()` 写出来的那一种形状）。

`name` 带子目录也行，`@site/` 那一头与磁盘上那一头由同一个 `name` 算出来，不会分叉。
*/
function docFile(name: string, text: string): string {
  const file = path.join(tempRoot, 'docs', name);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);

  return `@site/docs/${name}`;
}

/** 一份够用的站点上下文：本包只读 `siteDir` 与 `siteConfig.markdown.parseFrontMatter`。 */
function contextOf(): LoadContext {
  const generatedFilesDir = path.join(tempRoot, '.docusaurus');

  return {
    generatedFilesDir,
    siteDir: tempRoot,
    siteConfig: { markdown: { parseFrontMatter: DEFAULT_PARSE_FRONT_MATTER } },
  } as unknown as LoadContext;
}

/** 一份 docs 清单里的一条（其余各格本包一眼都不看，这里也就不必造）。 */
const docOf = (id: string, source: string) => ({ id, source });

describe('countWords：两把码位表就是全部规则', () => {
  it('中日韩文字按字：汉字、假名、谚文各算一个', () => {
    expect(countWords('汉字')).toEqual({ cjk: 2, latin: 0, words: 2 });
    expect(countWords('カタカナ')).toEqual({ cjk: 4, latin: 0, words: 4 });
    expect(countWords('한국어')).toEqual({ cjk: 3, latin: 0, words: 3 });
  });

  it('汉字扩展 A 与兼容表意也在 CJK 那一族里', () => {
    // `\u{3400}-\u{4DBF}` 扩展 A、`\u{F900}-\u{FAFF}` 兼容表意
    expect(countWords('\u{3400}\u{F900}')).toEqual({
      cjk: 2,
      latin: 0,
      words: 2,
    });
  });

  it('其余文字按词：连续字母数字算一个，带撇号与连字符的仍算一个', () => {
    expect(countWords('Hello world')).toEqual({ cjk: 0, latin: 2, words: 2 });
    expect(countWords("don't web-page")).toEqual({
      cjk: 0,
      latin: 2,
      words: 2,
    });
    expect(countWords('2026')).toEqual({ cjk: 0, latin: 1, words: 1 });
  });

  it('混排两边各数一次，同一个字不被数两遍', () => {
    // 拉丁那一路先把 CJK 换成空格再数：`\p{L}` 也认汉字，不隔开就是同一个字两遍
    expect(countWords('汉字 hello 词')).toEqual({
      cjk: 3,
      latin: 1,
      words: 4,
    });
  });

  it('中日韩标点与 markdown 语法符号都不是词', () => {
    // 那一个 `\u{3000}` 是全角空格（表意文字空格），与三个标点一样不属于任何一族
    expect(countWords('。！，\u{3000}')).toEqual({
      cjk: 0,
      latin: 0,
      words: 0,
    });
    // `#`、`|`、反引号、方括号与圆括号都不是字母数字：这一行只剩 Title / code / link / url
    expect(countWords('# Title | `code` [link](url)')).toEqual({
      cjk: 0,
      latin: 4,
      words: 4,
    });
  });

  it('空串三个数都是 0', () => {
    expect(countWords('')).toEqual({ cjk: 0, latin: 0, words: 0 });
  });

  it('表外的字（汉字扩展 B）按拉丁那一路数，还是一个', () => {
    // 码位表只列常用那几段；带 `u` 标记的拉丁那一路认码位平面 2 上的字母，所以不会漏成 0
    expect(countWords('\u{20000}')).toEqual({ cjk: 0, latin: 1, words: 1 });
  });
});

describe('collectStats：读的是清单，分组按「实例 + 版本」', () => {
  const context = contextOf();

  /** 本站的形状：两份 docs 实例，各一份版本。 */
  it('两份实例各占一格，总数与页数把两格加起来', async () => {
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [
                docOf('a', docFile('a.md', '# A\n\n两个 词\n')),
                docOf('b', docFile('b.md', 'hello world\n')),
              ],
            },
          ],
        },
        themes: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [docOf('c', docFile('c.md', '第三页 一句话\n'))],
            },
          ],
        },
      },
    } as unknown as AllContent;

    const stats = await collectStats(allContent, context);

    expect(stats.groups).toEqual([
      // 「两个 词」3 个字 + 标题里的 A 一个词；「hello world」两个词
      {
        cjk: 3,
        instance: 'default',
        latin: 3,
        pages: 2,
        version: 'current',
        words: 6,
      },
      // 「第三页 一句话」6 个字
      {
        cjk: 6,
        instance: 'themes',
        latin: 0,
        pages: 1,
        version: 'current',
        words: 6,
      },
    ]);
    expect(stats).toMatchObject({ cjk: 9, latin: 3, words: 12, pages: 3 });
  });

  it('头部那段 YAML 不数，正文里的标题行照数', async () => {
    const source = docFile(
      'frontmatter.md',
      '---\ntitle: 标题\nwordCount: true\n---\n\n# 看得见 的 标题\n\n正文 一句\n',
    );
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [docOf('d', source)] },
          ],
        },
      },
    } as unknown as AllContent;

    const stats = await collectStats(allContent, context);

    // 正文里 10 个字（看得见 的 标题 / 正文 一句）；frontmatter 那 6 个词一个字都不进
    expect(stats.groups[0]).toMatchObject({
      cjk: 10,
      latin: 0,
      pages: 1,
      words: 10,
    });
  });

  it('没有 label 时用 versionName 顶上，有 label 时显示名就是那一格的名字', async () => {
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [] },
            { label: 'v1.0（旧）', versionName: 'v1.0', docs: [] },
          ],
        },
      },
    } as unknown as AllContent;

    const stats = await collectStats(allContent, context);

    expect(stats.groups.map((group) => group.version)).toEqual([
      'current',
      'v1.0（旧）',
    ]);
  });

  it('两份实例里的空版本也占一格：那一格页数 0、三个数都是 0', async () => {
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: { loadedVersions: [{ versionName: 'current', docs: [] }] },
      },
    } as unknown as AllContent;

    const stats = await collectStats(allContent, context);

    expect(stats.groups).toEqual([
      {
        instance: 'default',
        version: 'current',
        cjk: 0,
        latin: 0,
        words: 0,
        pages: 0,
      },
    ]);
    expect(stats).toMatchObject({ words: 0, pages: 0 });
  });

  it('同一格重复出现时合进去，不多开一格', async () => {
    // 两个版本显示名相同（一份实例里 `label` 撞上、或一条没写 label 而版本名与另一条的 label 相同）
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              label: 'x',
              docs: [docOf('e', docFile('e.md', '一个字 词'))],
            },
            {
              versionName: 'v1',
              label: 'x',
              docs: [docOf('f', docFile('f.md', '第二格'))],
            },
          ],
        },
      },
    } as unknown as AllContent;

    const stats = await collectStats(allContent, context);

    expect(stats.groups).toHaveLength(1);
    expect(stats.groups[0]).toMatchObject({ cjk: 7, pages: 2, words: 7 });
  });

  it('不是 docs 清单的那几格（没有 loadedVersions、或整格为空）都不报错', async () => {
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        // 机制层那份：一个数组，没有 `loadedVersions` 这一格
        componentPage: [],
        // 没有配置的那一份实例：官方交回 undefined
        themes: undefined,
      },
    } as unknown as AllContent;

    const stats = await collectStats(allContent, context);

    expect(stats).toMatchObject({
      cjk: 0,
      groups: [],
      latin: 0,
      pages: 0,
      words: 0,
    });
  });

  it('清单里那一份文件在磁盘上读不到时构建抛错，不安静少数', async () => {
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [docOf('g', '@site/docs/gone.md')],
            },
          ],
        },
      },
    } as unknown as AllContent;

    await expect(collectStats(allContent, context)).rejects.toThrow();
  });

  it('地址不是 `@site/` 打头时官方那一位当场抛，不自己截字符串', async () => {
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [docOf('h', './docs/h.md')] },
          ],
        },
      },
    } as unknown as AllContent;

    await expect(collectStats(allContent, context)).rejects.toThrow(
      // 官方那一位的原话：`Unexpected, filePath is not site-aliased: <那一条>`
      /not site-aliased/,
    );
  });
});

describe('renderStatsModule：生成模块只有那一句导出', () => {
  it('写出来的文本读回来就是同一份统计', () => {
    const stats = {
      cjk: 1,
      latin: 2,
      words: 3,
      pages: 4,
      groups: [
        {
          cjk: 1,
          latin: 2,
          words: 3,
          instance: 'default',
          pages: 4,
          version: 'current',
        },
      ],
    };

    const text = renderStatsModule(stats);

    expect(text).toContain('export const stats = ');
    // 没有日期、没有 git 状态：同一份统计两次渲染是同一个字符串
    expect(text).toBe(renderStatsModule(stats));

    const json = text.slice(text.indexOf('{')).replace(/;\s*$/, '');
    expect(JSON.parse(json)).toEqual(stats);
  });
});

/**
本包那一格生成文件的地址：`<generatedFilesDir>/theme-word-count/stats.ts`。
入口与 `theme/WordCountPage` 那句 `@generated/theme-word-count/stats` 用的是同一个字符串，
这里钉一次：改一头忘了另一头，浏览器侧的 `import` 当场解析不到。
*/
const STATS_TARGET = path.join('theme-word-count', 'stats.ts');

describe('theme-word-count 入口：把统计铺进生成目录', () => {
  it('allContentLoaded 建出自己那一格，并写进那份统计', async () => {
    const context = contextOf();
    const plugin = wordCountTheme(context);
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [docOf('run', docFile('run.md', '跑一遍 就好\n'))],
            },
          ],
        },
      },
    } as unknown as AllContent;
    const target = path.join(context.generatedFilesDir, STATS_TARGET);

    // 这一步之前那一格还不存在：生成目录下面那一层由本包自己建
    expect(fs.existsSync(target)).toBe(false);

    await plugin.allContentLoaded!({
      allContent,
      contentByLoadName: {},
    } as never);

    const text = fs.readFileSync(target, 'utf8');
    expect(text).toContain('export const stats = ');
    expect(text).toContain('"instance": "default"');
    // 「跑一遍 就好」5 个字，一份文件
    expect(text).toContain('"words": 5');
    expect(text).toContain('"pages": 1');
  });
});
