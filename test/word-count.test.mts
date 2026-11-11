import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type {
  AllContent,
  LoadContext,
  MarkdownConfig,
} from '@docusaurus/types';
import { DEFAULT_PARSE_FRONT_MATTER } from '@docusaurus/utils';

import { collectStats } from '../packages/theme-word-count/src/content.mts';
import { countWords } from '../packages/theme-word-count/src/count.mts';
import {
  installPreprocessor,
  rewriteWordCountDirectives,
  withoutWordCountDirectives,
  WRAPPED,
  wrapPreprocessor,
} from '../packages/theme-word-count/src/directive.mts';
import wordCountTheme from '../packages/theme-word-count/src/index.mts';
import { renderStatsModule } from '../packages/theme-word-count/src/stats-module.mts';
import {
  ofFolder,
  ofPage,
} from '../packages/theme-word-count/theme/WordCount/scope.ts';

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

/** 预处理器补在文首那一句 import 的原文。 */
const IMPORT_LINE = "import __WordCount from '@theme/WordCount';";

describe('rewriteWordCountDirectives：指令换成正文里的一个组件', () => {
  it('指令写在哪儿，那一处就换成组件，import 补在文首', () => {
    expect(rewriteWordCountDirectives('前\n\n:::word-count\n\n后\n')).toBe(
      `${IMPORT_LINE}\n前\n\n<__WordCount scope="instance" />\n\n后\n`,
    );
  });

  it('有 frontmatter 时 import 补在收尾那条 `---` 之后', () => {
    expect(
      rewriteWordCountDirectives('---\ntitle: 示例\n---\n\n:::word-count\n'),
    ).toBe(
      `---\ntitle: 示例\n---\n${IMPORT_LINE}\n\n<__WordCount scope="instance" />\n`,
    );
  });

  it('frontmatter 没收尾时不认它（MDX 也不认），import 仍在第 0 行', () => {
    expect(
      rewriteWordCountDirectives('---\ntitle: 示例\n\n:::word-count\n'),
    ).toBe(
      `${IMPORT_LINE}\n---\ntitle: 示例\n\n<__WordCount scope="instance" />\n`,
    );
  });

  it('容器式收尾 `:::` 跟在指令后面时一并吃掉', () => {
    expect(rewriteWordCountDirectives(':::word-count\n:::\n')).toBe(
      `${IMPORT_LINE}\n<__WordCount scope="instance" />\n`,
    );
  });

  it('指令是文件最后一行时没有下一行可看，照样换成组件', () => {
    expect(rewriteWordCountDirectives('前\n:::word-count')).toBe(
      `${IMPORT_LINE}\n前\n<__WordCount scope="instance" />`,
    );
  });

  it('多处指令各换各的，import 只补一句', () => {
    expect(
      rewriteWordCountDirectives(
        ':::word-count\n\n中间\n\n:::word-count\n:::\n\n尾\n',
      ),
    ).toBe(
      `${IMPORT_LINE}\n<__WordCount scope="instance" />\n\n中间\n\n<__WordCount scope="instance" />\n\n尾\n`,
    );
  });

  it('指令后面写范围时那一格写进组件，容器式收尾照吃', () => {
    expect(rewriteWordCountDirectives(':::word-count page\n')).toBe(
      `${IMPORT_LINE}\n<__WordCount scope="page" />\n`,
    );
    expect(rewriteWordCountDirectives(':::word-count folder\n:::\n')).toBe(
      `${IMPORT_LINE}\n<__WordCount scope="folder" />\n`,
    );
    expect(rewriteWordCountDirectives(':::word-count site\n')).toBe(
      `${IMPORT_LINE}\n<__WordCount scope="site" />\n`,
    );
  });

  it('不认的范围不算指令，原样留下', () => {
    for (const text of [
      ':::word-count pages\n',
      ':::word-count page extra\n',
      ':::word-count PAGE\n',
    ]) {
      expect(rewriteWordCountDirectives(text)).toBe(text);
    }
  });

  it('CRLF 文件按自己的行尾走：补上去那一行也是 CRLF', () => {
    expect(
      rewriteWordCountDirectives(
        '---\r\ntitle: 示例\r\n---\r\n\r\n:::word-count\r\n\r\n后\r\n',
      ),
    ).toBe(
      `---\r\ntitle: 示例\r\n---\r\n${IMPORT_LINE}\r\n\r\n<__WordCount scope="instance" />\r\n\r\n后\r\n`,
    );
  });

  it('代码围栏里的示例不是指令：反引号与波浪号两种围栏都原样交回', () => {
    for (const text of [
      '```\n:::word-count\n```\n',
      '~~~\n:::word-count\n~~~\n',
    ]) {
      expect(rewriteWordCountDirectives(text)).toBe(text);
    }
  });

  it('围栏只认同一种字符、且长度不短于开头那一串', () => {
    for (const text of [
      // 反引号围栏里的波浪号不关它
      '```\n~~~\n:::word-count\n```\n',
      // 四格的围栏，三格那行关不上
      '````\n```\n:::word-count\n````\n',
    ]) {
      expect(rewriteWordCountDirectives(text)).toBe(text);
    }
  });

  it('围栏收掉之后，后面的指令照常认', () => {
    expect(
      rewriteWordCountDirectives('```\ncode\n```\n\n:::word-count\n'),
    ).toBe(
      `${IMPORT_LINE}\n\`\`\`\ncode\n\`\`\`\n\n<__WordCount scope="instance" />\n`,
    );
  });

  it('四格缩进是代码块，不是指令', () => {
    const text = '    :::word-count\n';
    expect(rewriteWordCountDirectives(text)).toBe(text);
  });

  it('不是本指令的行原样交回：`:::note`、多写了尾巴、行内提到', () => {
    for (const text of [
      ':::note\n提醒\n:::\n',
      ':::word-count extra\n',
      '正文里提到 :::word-count 这一串\n',
    ]) {
      expect(rewriteWordCountDirectives(text)).toBe(text);
    }
  });

  it('没有这个词的文件原样交回同一个字符串', () => {
    const text = '两个 词\n';
    expect(rewriteWordCountDirectives(text)).toBe(text);
  });
});

describe('withoutWordCountDirectives：指令是看不见的语法，不数', () => {
  it('指令与它的收尾整行去掉', () => {
    expect(withoutWordCountDirectives(':::word-count\n:::\n\n正文\n')).toBe(
      '\n正文\n',
    );
  });

  it('多处指令与收尾都去掉，其余行顺序不变', () => {
    expect(
      withoutWordCountDirectives(
        '前\n\n:::word-count\n\n中\n\n:::word-count\n:::\n\n后\n',
      ),
    ).toBe('前\n\n\n中\n\n\n后\n');
  });

  it('带范围的指令与它的收尾一样整行去掉', () => {
    expect(
      withoutWordCountDirectives(':::word-count site\n:::\n\n正文\n'),
    ).toBe('\n正文\n');
  });

  it('围栏里的那一行是示例，留在正文里', () => {
    expect(withoutWordCountDirectives('```\n:::word-count\n```\n')).toBe(
      '```\n:::word-count\n```\n',
    );
  });

  it('没有词的快路与「有词但没有真指令」都原样交回', () => {
    expect(withoutWordCountDirectives('两个 词\n')).toBe('两个 词\n');
    expect(withoutWordCountDirectives('    :::word-count\n')).toBe(
      '    :::word-count\n',
    );
  });
});

/** 官方 `markdown.preprocessor` 那一格的形状（`@docusaurus/types` 没把那个别名再导出）。 */
type Preprocessor = NonNullable<MarkdownConfig['preprocessor']>;

describe('wrapPreprocessor / installPreprocessor：包一层，只包一次', () => {
  it('站点自己那份先跑，本包在它的结果上认指令', () => {
    const base: Preprocessor = ({ fileContent }) =>
      fileContent.replace('占位', ':::word-count');
    const wrapped = wrapPreprocessor(base);

    expect(wrapped({ fileContent: '前\n占位\n后\n', filePath: 'a.md' })).toBe(
      `${IMPORT_LINE}\n前\n<__WordCount scope="instance" />\n后\n`,
    );
  });

  it('站点没配预处理器时直接读文件原文', () => {
    const wrapped = wrapPreprocessor(undefined);

    expect(wrapped({ fileContent: ':::word-count\n', filePath: 'a.md' })).toBe(
      `${IMPORT_LINE}\n<__WordCount scope="instance" />\n`,
    );
  });

  it('重复安装还是同一份包装：带记号，`reloadSite()` 不套第二层', () => {
    const wrapped = wrapPreprocessor(undefined);

    expect((wrapped as { [WRAPPED]?: true })[WRAPPED]).toBe(true);
    expect(wrapPreprocessor(wrapped)).toBe(wrapped);

    const markdown = {} as MarkdownConfig;
    installPreprocessor(markdown);
    const installed = markdown.preprocessor;
    installPreprocessor(markdown);
    expect(markdown.preprocessor).toBe(installed);
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
      '---\ntitle: 标题\ntags: [示例]\n---\n\n# 看得见 的 标题\n\n正文 一句\n',
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

  it('指令与它的收尾不数，围栏里那行示例照数', async () => {
    const source = docFile(
      'directive.md',
      ':::word-count\n:::\n\n正文 一句\n\n```\n:::word-count\n```\n',
    );
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [docOf('i', source)] },
          ],
        },
      },
    } as unknown as AllContent;

    const stats = await collectStats(allContent, context);

    // 指令两行是看不见的语法；正文 4 个字；围栏里那行示例留在正文里（`word-count` 一个词）
    expect(stats.groups[0]).toMatchObject({
      cjk: 4,
      latin: 1,
      pages: 1,
      words: 5,
    });
  });

  it('每页那一格留在 docs 里，键就是清单里的 source', async () => {
    const source = docFile('folder/deep/x.md', '这一页 两个词 hello\n');
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [docOf('x', source)] },
          ],
        },
      },
    } as unknown as AllContent;

    const stats = await collectStats(allContent, context);

    // 「这一页 两个词」6 个字 + hello 一个词；键与清单里的 `source` 同一个形状
    expect(stats.docs).toEqual({
      [source]: { cjk: 6, latin: 1, words: 7 },
    });
    expect(stats.groups[0]).toMatchObject({ cjk: 6, latin: 1, words: 7 });
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

describe('scope：本页与本文件夹从生成的每页明细里挑', () => {
  const docs = {
    '@site/docs/a.md': { cjk: 1, latin: 1, words: 2 },
    '@site/docs/guide/b.md': { cjk: 2, latin: 0, words: 2 },
    '@site/docs/guide/deep/c.md': { cjk: 3, latin: 0, words: 3 },
    '@site/docs/guides/d.md': { cjk: 4, latin: 0, words: 4 },
    '@site/themes/a.md': { cjk: 5, latin: 0, words: 5 },
  };

  it('本页就是明细里那一格，页数记 1；键不在明细里时不猜', () => {
    expect(ofPage(docs, '@site/docs/guide/deep/c.md')).toEqual({
      cjk: 3,
      latin: 0,
      pages: 1,
      words: 3,
    });
    expect(ofPage(docs, '@site/docs/gone.md')).toBeUndefined();
  });

  it('本文件夹含子目录，右侧那个分隔挡住名字相近的邻居', () => {
    // `docs/guide/` 收 b 与 deep/c；`docs/guides/d.md` 是另一个目录，不进这一格
    expect(ofFolder(docs, '@site/docs/guide/b.md')).toEqual({
      cjk: 5,
      latin: 0,
      pages: 2,
      words: 5,
    });
  });

  it('内容根根目录那一页按整个根合计；地址里没有目录那一段时挑不出', () => {
    expect(ofFolder(docs, '@site/docs/a.md')).toEqual({
      cjk: 10,
      latin: 1,
      pages: 4,
      words: 11,
    });
    expect(ofFolder(docs, 'README.md')).toBeUndefined();
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
      docs: { '@site/docs/a.md': { cjk: 1, latin: 2, words: 3 } },
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
入口与 `theme/WordCount` 那句 `@generated/theme-word-count/stats` 用的是同一个字符串，
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
    // 每页那一格也铺进去了：浏览器侧按这一页的 source 挑
    expect(text).toContain('"@site/docs/run.md"');
  });
});
