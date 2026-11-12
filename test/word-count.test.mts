import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type {
  AllContent,
  LoadContext,
  MarkdownConfig,
  ParseFrontMatter,
} from '@docusaurus/types';
import { DEFAULT_PARSE_FRONT_MATTER } from '@docusaurus/utils';

import {
  add,
  EMPTY,
  foldersOf,
  sumOf,
} from '../packages/theme-word-count/src/aggregate.mts';
import {
  collectStats,
  type StatsUsage,
} from '../packages/theme-word-count/src/content.mts';
import { countWords } from '../packages/theme-word-count/src/count.mts';
import {
  directiveScopes,
  installPreprocessor,
  rewriteWordCountDirectives,
  withoutWordCountDirectives,
  WRAPPED,
  wrapPreprocessor,
} from '../packages/theme-word-count/src/directive.mts';
import wordCountTheme from '../packages/theme-word-count/src/index.mts';
import {
  measureMarkdown,
  measureText,
} from '../packages/theme-word-count/src/measure.mts';
import { renderStatsModule } from '../packages/theme-word-count/src/stats-module.mts';
import {
  ofFolder,
  ofInstance,
  ofPage,
} from '../packages/theme-word-count/theme/WordCount/scope.ts';
import type {
  WordCount,
  WordCountStats,
} from '../packages/theme-word-count/types/word-count.ts';

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

/** 收告警的假 logger：`warn` 收到的每一组参数都记下来，断言里翻。 */
function warnCollector() {
  const warnings: unknown[][] = [];

  return {
    logger: {
      warn: (...args: unknown[]) => {
        warnings.push(args);
      },
    },
    warnings,
  };
}

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

/** 从全 0 那一格出发造一份明细：只写这一条用例关心的那几个数。 */
const countOf = (overrides: Partial<WordCount> = {}): WordCount => ({
  ...EMPTY,
  ...overrides,
});

describe('measureMarkdown：一页的明细从语法树上数', () => {
  it('文字与行内代码：词数与字符数都加，段落这类容器本身不数', () => {
    expect(measureMarkdown('汉字 hi `code`\n', false)).toMatchObject({
      characters: 10,
      cjk: 2,
      drafts: 0,
      frontmatter: 0,
      latin: 2,
      pages: 1,
      words: 4,
    });
  });

  it('六级标题各记一格；显式写的 id 两种写法各认一次', () => {
    const text = [
      '# 一',
      '## 二',
      '### 三',
      '#### 四',
      '##### 五',
      '###### 六',
      // 经典写法：解析前与站点一样先转义，否则 MDX 当场报 acorn 错
      '## 标题 {#custom-id}',
      // MDX 注释写法：解析成一格 `mdxTextExpression`
      '## 注释 {/* #other-id */}',
      '## 结尾 **粗体**',
      '',
    ].join('\n');

    expect(measureMarkdown(text, false)).toMatchObject({
      h1: 1,
      h2: 4,
      h3: 1,
      h4: 1,
      h5: 1,
      h6: 1,
      headingIds: 2,
    });
  });

  it('空标题是合法 markdown：各记一格，不认 id，也不当场抛', () => {
    // `## ` 与 `###` 都没有子节点：「只认最后一个子节点」那一步先判空
    expect(measureMarkdown('## \n\n###\n\n正文\n', false)).toMatchObject({
      h2: 1,
      h3: 1,
      headingIds: 0,
      words: 2,
    });
  });

  it('代码围栏：段数、行数与字数都进；mermaid / kroki 只算图表，不算代码段', () => {
    const text = [
      '```ts',
      'const a = 1;',
      '```',
      '',
      '```mermaid',
      'graph TD',
      '```',
      '',
      '```kroki',
      'digraph {}',
      '```',
      '',
      // MDX 不认四格缩进的代码块（站点那边也把它当普通文字），所以这一段进词数、不进代码段
      '    indented',
      '',
    ].join('\n');

    expect(measureMarkdown(text, false)).toMatchObject({
      codeBlocks: 1,
      codeLines: 1,
      graphs: 2,
      words: 7,
    });
  });

  it('表格、图片、链接、引用各记一格；链接地址与图片地址不是文字', () => {
    const text = [
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '![alt](img.png)',
      '',
      '[外部](https://example.com) [内部](./a.md) [引用式][ref]',
      '',
      '> 引用',
      '',
      '[ref]: ./ref.md',
      '',
    ].join('\n');

    expect(measureMarkdown(text, false)).toMatchObject({
      blockquotes: 1,
      externalLinks: 1,
      images: 1,
      internalLinks: 2,
      tables: 1,
      // 表格里的四格、三条链接的文字与引用那一段；`alt` 与两个地址都不算
      words: 13,
    });
  });

  it('frontmatter 只记数量，正文里的标题与草稿另算', () => {
    expect(
      measureMarkdown('---\ntitle: 示例\ndraft: true\n---\n\n# 标题\n', true),
    ).toMatchObject({
      drafts: 1,
      frontmatter: 1,
      h1: 1,
      // frontmatter 里的 title / 示例 都不进词数
      words: 2,
    });
  });

  it('不是 markdown 的正文没有语法树：整份按文字数，结构那几行记 0', () => {
    // 站在 DBML 那种内容的角度：`{` 在 MDX 眼里是表达式，走语法树会当场解析失败
    expect(measureText('Table 用户 {}\n', false, true)).toMatchObject({
      blockquotes: 0,
      characters: 12,
      cjk: 2,
      codeBlocks: 0,
      drafts: 0,
      frontmatter: 1,
      h1: 0,
      latin: 1,
      pages: 1,
      words: 3,
    });
    expect(measureText('纯文字\n', true, false)).toMatchObject({
      drafts: 1,
      frontmatter: 0,
      words: 3,
    });
  });
});

describe('aggregate：逐字段相加与按目录滚上去', () => {
  it('add 交回新的一份，左边那份不动', () => {
    const left = countOf({ cjk: 1, pages: 1, words: 1 });
    const right = countOf({ characters: 5, latin: 2, pages: 1, words: 2 });

    expect(add(left, right)).toMatchObject({
      characters: 5,
      cjk: 1,
      latin: 2,
      pages: 2,
      words: 3,
    });
    expect(left).toMatchObject({ cjk: 1, pages: 1, words: 1 });
  });

  it('空数组就是全 0 那一格', () => {
    expect(sumOf([])).toBe(EMPTY);
    expect(sumOf([countOf({ words: 2 }), countOf({ words: 3 })])).toMatchObject(
      { words: 5 },
    );
  });

  it('目录那一格含所有子目录，往上每一层也留一格', () => {
    const folders = foldersOf({
      '@site/docs/a.md': countOf({ pages: 1, words: 1 }),
      '@site/docs/guide/b.md': countOf({ pages: 1, words: 2 }),
      '@site/docs/guide/deep/c.md': countOf({ pages: 1, words: 3 }),
    });

    expect(folders['@site/docs/guide']).toMatchObject({ pages: 2, words: 5 });
    expect(folders['@site/docs']).toMatchObject({ pages: 3, words: 6 });
    expect(folders['@site']).toMatchObject({ pages: 3, words: 6 });
  });

  it('地址里没有目录时不留格', () => {
    expect(foldersOf({ 'README.md': countOf({ pages: 1 }) })).toEqual({});
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

  it('带信息串的行不是收尾；光秃秃的收尾（可带尾随空白）照常关', () => {
    // CommonMark：收尾围栏不带信息串，```js 这种行是围栏内的正文
    for (const text of [
      '```\n```js\n:::word-count\n```\n',
      '~~~\n~~~js\n:::word-count\n~~~\n',
    ]) {
      expect(rewriteWordCountDirectives(text)).toBe(text);
      expect(withoutWordCountDirectives(text)).toBe(text);
    }
    expect(
      rewriteWordCountDirectives('```\ncode\n```  \n\n:::word-count\n'),
    ).toBe(
      `${IMPORT_LINE}\n\`\`\`\ncode\n\`\`\`  \n\n<__WordCount scope="instance" />\n`,
    );
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

describe('directiveScopes：报出每条指令的范围，供统计侧裁明细', () => {
  it('没写范围是 instance，写了的按写的报；多条按出现顺序', () => {
    expect(
      directiveScopes(
        ':::word-count\n:::word-count page\n:::word-count site\n',
      ),
    ).toEqual(['instance', 'page', 'site']);
  });

  it('没有指令、或只在围栏里提到，都是空数组', () => {
    expect(directiveScopes('正文 一句\n')).toEqual([]);
    expect(directiveScopes('```\n:::word-count page\n```\n')).toEqual([]);
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

    const { stats } = await collectStats(allContent, context);

    expect(stats.groups).toMatchObject([
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
    // 实例合计是配置期先合好的：每个 id 一格，页面侧只查表
    expect(stats.instances).toMatchObject({
      default: { pages: 2, words: 6 },
      themes: { pages: 1, words: 6 },
    });
    // 两个实例的文件都在同一份 `docs/` 底下，目录那一格是两边合计
    expect(stats.folders['@site/docs']).toMatchObject({ pages: 3, words: 12 });
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

    const { stats } = await collectStats(allContent, context);

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

    const { stats } = await collectStats(allContent, context);

    // 指令两行是看不见的语法；正文 4 个字；围栏里那行示例留在正文里（`word-count` 一个词）
    expect(stats.groups[0]).toMatchObject({
      cjk: 4,
      latin: 1,
      pages: 1,
      words: 5,
    });
  });

  it('清单里的非 markdown 文档（.dbml）按整份正文数，构建不红', async () => {
    // 本站把 `.dbml` 也收进 docs：它不按 MDX 编译，硬套解析器会报 acorn 错
    const withHead = docFile(
      'chart.dbml',
      '---\ntitle: 关系图\n---\n\nTable users {\n  id integer\n}\n',
    );
    const withoutHead = docFile('bare.dbml', 'Table orders\n');
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [docOf('chart', withHead), docOf('bare', withoutHead)],
            },
          ],
        },
      },
    } as unknown as AllContent;

    const { stats } = await collectStats(allContent, context);

    expect(stats.docs[withHead]).toMatchObject({
      frontmatter: 1,
      h1: 0,
      pages: 1,
      words: 4,
    });
    expect(stats.docs[withoutHead]).toMatchObject({
      frontmatter: 0,
      pages: 1,
      words: 2,
    });
    expect(stats.groups[0]).toMatchObject({ latin: 6, pages: 2, words: 6 });
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

    const { stats } = await collectStats(allContent, context);

    // 「这一页 两个词」6 个字 + hello 一个词；键与清单里的 `source` 同一个形状
    expect(stats.docs).toMatchObject({
      [source]: { cjk: 6, latin: 1, pages: 1, words: 7 },
    });
    expect(Object.keys(stats.docs)).toEqual([source]);
    expect(stats.groups[0]).toMatchObject({ cjk: 6, latin: 1, words: 7 });
  });

  it('生产构建分出去的草稿也数：docs 与 drafts 两处并起来只读一次', async () => {
    const published = docFile('published.md', '正页 一句\n');
    const draft = docFile(
      'draft.md',
      '---\ntitle: 草稿\ndraft: true\n---\n\n草稿 一句\n',
    );
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [docOf('p', published)],
              drafts: [docOf('d', draft)],
            },
          ],
        },
      },
    } as unknown as AllContent;

    const { stats } = await collectStats(allContent, context);

    // 两页都进：正页 4 个字，草稿正文 4 个字（frontmatter 不进词数）
    expect(stats.docs[draft]).toMatchObject({ drafts: 1, pages: 1, words: 4 });
    expect(stats.groups[0]).toMatchObject({
      drafts: 1,
      frontmatter: 1,
      pages: 2,
      words: 8,
    });
    expect(stats).toMatchObject({ drafts: 1, pages: 2, words: 8 });
  });

  it('草稿留在 docs 里（开发模式）时同样记进「草稿数量」', async () => {
    const draft = docFile(
      'dev-draft.md',
      '---\ntitle: 草稿\ndraft: true\n---\n\n一句\n',
    );
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [docOf('d', draft)] },
          ],
        },
      },
    } as unknown as AllContent;

    const { stats } = await collectStats(allContent, context);

    expect(stats).toMatchObject({ drafts: 1, pages: 1, words: 2 });
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

    const { stats } = await collectStats(allContent, context);

    expect(stats.groups.map((group) => group.version)).toEqual([
      'current',
      'v1.0（旧）',
    ]);
  });

  it('两份实例里的空版本也占一格：那一格页数 0、各项都是 0', async () => {
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: { loadedVersions: [{ versionName: 'current', docs: [] }] },
      },
    } as unknown as AllContent;

    const { stats } = await collectStats(allContent, context);

    expect(stats.groups).toMatchObject([
      {
        instance: 'default',
        version: 'current',
        cjk: 0,
        latin: 0,
        words: 0,
        pages: 0,
        frontmatter: 0,
      },
    ]);
    expect(stats).toMatchObject({
      words: 0,
      pages: 0,
      instances: {},
      folders: {},
      docs: {},
    });
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

    const { stats } = await collectStats(allContent, context);

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

    const { stats } = await collectStats(allContent, context);

    expect(stats).toMatchObject({
      cjk: 0,
      groups: [],
      latin: 0,
      pages: 0,
      words: 0,
    });
  });

  it('清单里那一份文件在磁盘上读不到：告警一声，那一页按 0 计，其余各页照常', async () => {
    const { logger, warnings } = warnCollector();
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [
                docOf('g', '@site/docs/gone.md'),
                docOf('ok', docFile('ok.md', 'hello world\n')),
              ],
            },
          ],
        },
      },
    } as unknown as AllContent;

    const { stats } = await collectStats(allContent, context, logger);

    // 读不到的那一页仍在清单里：算 1 页、各项 0，不安静消失，也不红
    expect(stats.docs['@site/docs/gone.md']).toMatchObject({
      pages: 1,
      words: 0,
    });
    // 其余各页照常数
    expect(stats.docs['@site/docs/ok.md']).toMatchObject({
      pages: 1,
      words: 2,
    });
    expect(stats).toMatchObject({ pages: 2, words: 2 });
    // 告警里带得上是哪一份文件
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]![0])).toContain('gone.md');
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

  it('正文不是合法 MDX：告警里带着文件路径，那一页按 0 计，构建不红', async () => {
    const { logger, warnings } = warnCollector();
    const source = docFile('broken.md', '正文 {1 +}\n');
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [docOf('k', source)] },
          ],
        },
      },
    } as unknown as AllContent;

    const { stats } = await collectStats(allContent, context, logger);

    expect(stats.docs['@site/docs/broken.md']).toMatchObject({
      pages: 1,
      words: 0,
    });
    expect(stats).toMatchObject({ pages: 1, words: 0 });
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]![0])).toMatch(/broken\.md/);
  });

  it('原文没变的那几份不重数：第二遍不再调解析器（dev 增量）', async () => {
    let calls = 0;
    const counting: ParseFrontMatter = async (params) => {
      calls += 1;

      return DEFAULT_PARSE_FRONT_MATTER(params);
    };
    const context = {
      ...contextOf(),
      siteConfig: { markdown: { parseFrontMatter: counting } },
    } as unknown as LoadContext;
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [docOf('memo', docFile('memo.md', 'memo 一页\n'))],
            },
          ],
        },
      },
    } as unknown as AllContent;

    await collectStats(allContent, context);
    const first = calls;

    expect(first).toBeGreaterThan(0);

    // 同一份原文、同一份解析器：第二遍走 memo，一份都不重数
    await collectStats(allContent, context);
    expect(calls).toBe(first);
  });

  it('原文改了：那一份重新数，不交回上一轮的旧结果（dev 改正文）', async () => {
    const context = contextOf();
    const source = docFile('memo-content.md', '一页\n');
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [docOf('mc', source)] },
          ],
        },
      },
    } as unknown as AllContent;

    const before = await collectStats(allContent, context);
    expect(before.stats.docs[source]!.words).toBe(2);

    // 路径不变、原文改了：memo 必须失效，按新原文重数
    docFile('memo-content.md', '一页 二页 三页\n');
    const after = await collectStats(allContent, context);
    expect(after.stats.docs[source]!.words).toBe(6);
  });

  it('解析器换了：memo 失效，用新解析器重数（reloadSite 重跑工厂）', async () => {
    const source = docFile('memo-parser.md', '一页\n');
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            { versionName: 'current', docs: [docOf('mp', source)] },
          ],
        },
      },
    } as unknown as AllContent;
    let firstCalls = 0;
    let secondCalls = 0;
    const first: ParseFrontMatter = async (params) => {
      firstCalls += 1;

      return DEFAULT_PARSE_FRONT_MATTER(params);
    };
    const second: ParseFrontMatter = async (params) => {
      secondCalls += 1;

      return DEFAULT_PARSE_FRONT_MATTER(params);
    };
    const contextWith = (parser: ParseFrontMatter) =>
      ({
        ...contextOf(),
        siteConfig: { markdown: { parseFrontMatter: parser } },
      }) as unknown as LoadContext;

    await collectStats(allContent, contextWith(first));
    expect(firstCalls).toBeGreaterThan(0);

    // 同一份原文、换一份解析器引用：第二遍不能走 memo，必须用新解析器重数
    await collectStats(allContent, contextWith(second));
    expect(secondCalls).toBeGreaterThan(0);
  });
});

describe('scope：四种范围都只查配置期合好的表', () => {
  const docs = {
    '@site/docs/a.md': countOf({ cjk: 1, latin: 1, pages: 1, words: 2 }),
    '@site/docs/guide/b.md': countOf({ cjk: 2, pages: 1, words: 2 }),
    '@site/docs/guide/deep/c.md': countOf({ cjk: 3, pages: 1, words: 3 }),
    '@site/docs/guides/d.md': countOf({ cjk: 4, pages: 1, words: 4 }),
    '@site/themes/a.md': countOf({ cjk: 5, pages: 1, words: 5 }),
  };
  const stats: WordCountStats = {
    ...EMPTY,
    groups: [],
    instances: {
      default: countOf({ cjk: 10, latin: 1, pages: 4, words: 11 }),
      themes: countOf({ cjk: 5, pages: 1, words: 5 }),
    },
    folders: foldersOf(docs),
    docs,
  };

  it('本页就是明细里那一格，页数那一格原样带着；键不在明细里时不猜', () => {
    expect(ofPage(stats, '@site/docs/guide/deep/c.md')).toBe(
      docs['@site/docs/guide/deep/c.md'],
    );
    expect(ofPage(stats, '@site/docs/gone.md')).toBeUndefined();
  });

  it('本文件夹含子目录，右侧那个分隔挡住名字相近的邻居', () => {
    // `docs/guide` 收 b 与 deep/c；`docs/guides/d.md` 是另一个目录，不进这一格
    expect(ofFolder(stats, '@site/docs/guide/b.md')).toMatchObject({
      cjk: 5,
      pages: 2,
      words: 5,
    });
  });

  it('内容根根目录那一页按整个根合计；地址里没有目录那一段时挑不出', () => {
    expect(ofFolder(stats, '@site/docs/a.md')).toMatchObject({
      cjk: 10,
      latin: 1,
      pages: 4,
      words: 11,
    });
    expect(ofFolder(stats, 'README.md')).toBeUndefined();
  });

  it('内容根取实例那一格；没有这一格时不猜', () => {
    expect(ofInstance(stats, 'themes')).toMatchObject({
      cjk: 5,
      pages: 1,
      words: 5,
    });
    expect(ofInstance(stats, 'blog')).toBeUndefined();
  });
});

describe('renderStatsModule：生成模块只有那一句导出', () => {
  it('写出来的文本读回来就是同一份统计', () => {
    const page = countOf({ cjk: 1, latin: 2, pages: 1, words: 3 });
    const stats: WordCountStats = {
      ...countOf({ cjk: 1, latin: 2, pages: 4, words: 3 }),
      groups: [{ ...page, instance: 'default', version: 'current' }],
      instances: { default: page },
      folders: { '@site/docs': page },
      docs: { '@site/docs/a.md': page },
    };

    const text = renderStatsModule(stats);

    expect(text).toContain('export const stats = ');
    // 没有日期、没有 git 状态：同一份统计两次渲染是同一个字符串
    expect(text).toBe(renderStatsModule(stats));

    const json = text.slice(text.indexOf('{')).replace(/;\s*$/, '');
    expect(JSON.parse(json)).toEqual(stats);
  });

  it('按 usage 裁：只留写了 page/folder 的那几格，合计与分组不动', () => {
    const page = countOf({ pages: 1, words: 2 });
    const stats: WordCountStats = {
      ...countOf({ pages: 3, words: 6 }),
      groups: [{ ...page, instance: 'default', version: 'current' }],
      instances: { default: countOf({ pages: 3, words: 6 }) },
      folders: { '@site/docs': page, '@site/docs/guide': page },
      docs: {
        '@site/docs/a.md': page,
        '@site/docs/guide/b.md': page,
        '@site/docs/c.md': page,
      },
    };
    const usage: StatsUsage = {
      '@site/docs/a.md': ['page'],
      '@site/docs/guide/b.md': ['folder'],
    };

    const text = renderStatsModule(stats, usage);
    const json = JSON.parse(
      text.slice(text.indexOf('{')).replace(/;\s*$/, ''),
    ) as WordCountStats;

    // a.md 写了 page → 留；guide/b.md 写了 folder → 它的目录 guide 留；c.md 没写 → 裁
    expect(Object.keys(json.docs)).toEqual(['@site/docs/a.md']);
    expect(Object.keys(json.folders)).toEqual(['@site/docs/guide']);
    // 合计、分组、实例合计照旧全铺（site / instance 范围读它们）
    expect(json.words).toBe(6);
    expect(json.groups).toHaveLength(1);
    // instances 不被裁（site / instance 范围读它），夹具里 default 那一格一定在
    expect(json.instances.default!.pages).toBe(3);
  });

  it('按 usage 裁：folder 范围但地址里没有目录那一段时，不铺那一格目录', () => {
    // 与浏览器侧 ofFolder 同一种砍法：地址没有 `/` 就挑不出目录（那边交回 undefined）。
    const page = countOf({ pages: 1, words: 2 });
    const stats: WordCountStats = {
      ...countOf({ pages: 1, words: 2 }),
      groups: [],
      instances: {},
      folders: { '@site/docs': page },
      docs: { 'README.md': page },
    };
    const usage: StatsUsage = { 'README.md': ['folder'] };

    const text = renderStatsModule(stats, usage);
    const json = JSON.parse(
      text.slice(text.indexOf('{')).replace(/;\s*$/, ''),
    ) as WordCountStats;

    // README.md 没有 `/`：挑不出目录，folders 一格都不留；写的是 folder 不是 page，docs 也裁掉
    expect(Object.keys(json.folders)).toEqual([]);
    expect(Object.keys(json.docs)).toEqual([]);
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
              // 写了 page 与 folder 两种指令：每页与每目录那两格因此铺得出去
              docs: [
                docOf(
                  'run',
                  docFile(
                    'run.md',
                    ':::word-count page\n:::word-count folder\n\n跑一遍 就好\n',
                  ),
                ),
              ],
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
    // 「跑一遍 就好」5 个字，一份文件（指令那两行是看不见的语法，不数）
    expect(text).toContain('"words": 5');
    expect(text).toContain('"pages": 1');
    // 这一页写了 page 指令：每页那一格铺进去了，浏览器侧按这一页的 source 挑
    expect(text).toContain('"@site/docs/run.md"');
    // 实例与目录在配置期先合好，页面里不做加法；这一页写了 folder 指令，目录那一格也在
    expect(text).toContain('"instances"');
    expect(text).toContain('"folders"');
    expect(text).toContain('"@site/docs"');
  });

  it('没写 page/folder 指令的页：每页与每目录明细不铺给浏览器，合计照常', async () => {
    const context = contextOf();
    const plugin = wordCountTheme(context);
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [docOf('plain', docFile('plain.md', 'hello world\n'))],
            },
          ],
        },
      },
    } as unknown as AllContent;
    const target = path.join(context.generatedFilesDir, STATS_TARGET);

    await plugin.allContentLoaded!({
      allContent,
      contentByLoadName: {},
    } as never);

    const text = fs.readFileSync(target, 'utf8');
    // 合计与实例照常铺（instance / site 范围读它们）
    expect(text).toContain('"words": 2');
    expect(text).toContain('"instances"');
    // 这一页没写 page/folder：每页与每目录明细都裁掉，不白占浏览器载荷
    expect(text).not.toContain('"@site/docs/plain.md"');
    expect(text).not.toContain('"@site/docs"');
  });

  it('数没变就不重写那份模块（dev 下改无关文件不该让浏览器白刷）', async () => {
    const context = contextOf();
    const plugin = wordCountTheme(context);
    const allContent = {
      '@docusaurus/plugin-content-docs': {
        default: {
          loadedVersions: [
            {
              versionName: 'current',
              docs: [docOf('stable', docFile('stable.md', '稳定 的一页\n'))],
            },
          ],
        },
      },
    } as unknown as AllContent;
    const target = path.join(context.generatedFilesDir, STATS_TARGET);
    const run = () =>
      plugin.allContentLoaded!({
        allContent,
        contentByLoadName: {},
      } as never);

    await run();
    const { mtimeMs } = fs.statSync(target);

    // 隔一小段再跑同样的内容：真写盘的话 mtime 一定会往前走（NTFS 精度足够）
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    await run();

    expect(fs.statSync(target).mtimeMs).toBe(mtimeMs);
  });
});
