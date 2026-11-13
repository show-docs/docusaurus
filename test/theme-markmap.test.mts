import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { buildMarkmapData } from '../packages/theme-markmap/src/loader/markmap-data.mts';
import loader from '../packages/theme-markmap/src/loader/md-markmap-loader.mts';
import type { MarkmapData } from '../packages/theme-markmap/src/types.mts';

import { mkdtempReal } from './helpers.mts';

/**
## theme-markmap 的构建期判据

这一层把一份 md 编译成「正文上方那张导图」：frontmatter 那把 `markmap:` 键怎么读、
markdown 怎么落成导图要的那份数据、以及链接为什么要在新标签页打开。判据全在构建期 ——
`pnpm build` 全绿只说明它没把构建搞崩，证明不了它算得对；页面上那张图对不对，
由 `test/e2e/features/markmap.feature` 钉。

`buildMarkmapData` 现在就是 `parse()` 的薄包装：树是 1.x 的结构化节点，frontmatter 原样透传。
链接的新标签页由渲染器负责，不再由这里补 —— 那条判据搬去 e2e。
*/

/**
`markmap` 自己那一版的 `transform()` 对任何输入都不抛（实测：坏 YAML、未闭合 HTML、
空源、NUL 字节都只是解析不出 frontmatter）。而 loader 必须把「它抛了」交回 webpack ——
那一格只能这样造：让 `buildMarkmapData` 在这一次调用里抛。
*/
const forced = vi.hoisted(() => ({ throwOnTransform: false }));

vi.mock(
  '../packages/theme-markmap/src/loader/markmap-data.mts',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../packages/theme-markmap/src/loader/markmap-data.mts')
      >();

    return {
      ...actual,
      buildMarkmapData: (source: string) => {
        if (forced.throwOnTransform) {
          throw new Error('markmap 自己炸了');
        }
        return actual.buildMarkmapData(source);
      },
    };
  },
);

/** 编译好的 MDX 原文：这一层的 loader 只在它后面追加一条导出，内容本身无所谓。 */
const MDX_SOURCE = 'export default function MDXContent() {};\n';

const tempDirs: string[] = [];

/** 一份 md 源文件落在临时目录里；返回它的地址。 */
function writeMd(source: string): string {
  const dir = mkdtempReal(path.join(os.tmpdir(), 'markmap-loader-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'a.md');
  fs.writeFileSync(file, source, 'utf8');
  return file;
}

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 一次 loader 调用的三样产出：交回 webpack 的内容、第一个参数（错误）、以及构建告警。 */
interface LoaderRun {
  output: string | null;
  error: Error | null;
  warnings: Error[];
}

/**
用一个假的 loader 上下文跑一遍本包那条 `enforce: 'post'` loader。

真实上下文由 webpack 逐次构造，这一层只用到 `cacheable` / `async` / `resourcePath` 三件。
判据走的是官方那份异步解析，所以要等回调真的被调用才收工。
*/
async function runLoader(resourcePath: string): Promise<LoaderRun> {
  const result: LoaderRun = { output: null, error: null, warnings: [] };
  const { promise, resolve } = Promise.withResolvers<LoaderRun>();

  const context = {
    resourcePath,
    cacheable: () => undefined,
    emitWarning: (warning: Error) => {
      result.warnings.push(warning);
    },
    async: () => (error: Error | null, source?: string) => {
      result.error = error;
      result.output = source ?? null;
      resolve(result);
    },
  };

  loader.call(context as never, MDX_SOURCE);
  return promise;
}

/** 取出产物末尾那条 `export const markmap`，按 `MarkmapData` 读回来。 */
function exportedMarkmap(output: string | null): MarkmapData {
  const raw = /export const markmap = (.*);\n$/.exec(output ?? '')?.[1];

  expect(raw, '产物末尾该有一条 `export const markmap`').toBeDefined();

  return JSON.parse(raw!) as MarkmapData;
}

describe('buildMarkmapData：markdown 落成导图要的那份数据', () => {
  it('两格都在：结构化树与 markmap 自己那份 frontmatter', () => {
    const data = buildMarkmapData('# 标题\n');

    expect(Object.keys(data).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'frontmatter',
      'root',
    ]);
    // 1.x 的标签是 mdast inline 节点，不是 HTML 串
    expect(data.root.content).toEqual([{ type: 'text', value: '标题' }]);
  });

  it('frontmatter 是 markmap 自己解析的那份：站点那些键原样透传', () => {
    const data = buildMarkmapData(
      '---\ntitle: 一页\ndraft: 草稿\nmarkmap: true\n---\n\n# 标题\n',
    );

    expect(data.frontmatter).toEqual({
      title: '一页',
      draft: '草稿',
      markmap: true,
    });
  });

  it('`markmap` 写成对象时不做归一：选项原文交给渲染层再解析', () => {
    // 归一（`color: red` → `['red']`）在 resolveViewOptions 里，构建期只透传原文
    const data = buildMarkmapData(
      '---\nmarkmap:\n  color: red\n---\n\n# 标题\n',
    );

    expect(data.frontmatter.markmap).toEqual({ color: 'red' });
  });

  it('frontmatter 坏掉时：交回空对象，不是半个对象', () => {
    const data = buildMarkmapData('---\nmarkmap: [没关上\n---\n\n# 标题\n');

    expect(data.frontmatter).toEqual({});
  });

  it('段落落在 note 里，不是节点', () => {
    const data = buildMarkmapData('# 标题\n\n一段话\n');

    expect(data.root.notes.map((note) => note.block.type)).toEqual([
      'paragraph',
    ]);
    expect(data.root.children).toEqual([]);
  });

  it('裸 HTML 被丢掉，只留文字', () => {
    const data = buildMarkmapData('# <b>粗</b> <abbr title="x">缩</abbr>\n');

    expect(data.root.content).toEqual([
      { type: 'text', value: '粗' },
      { type: 'text', value: ' ' },
      { type: 'text', value: '缩' },
    ]);
  });

  it('单个 H1 是根；写了 title 时 title 赢', () => {
    const heading = buildMarkmapData('# 标题\n');
    expect(heading.root.content).toEqual([{ type: 'text', value: '标题' }]);
    expect(heading.root.children).toEqual([]);

    const titled = buildMarkmapData('---\ntitle: 一页\n---\n\n# 标题\n');
    expect(titled.root.content).toEqual([{ type: 'text', value: '一页' }]);
    expect(titled.root.children.at(0)?.content).toEqual([
      { type: 'text', value: '标题' },
    ]);
  });
});

describe('md loader 的四种落点', () => {
  it('写了 `markmap:`：追加一条导出，数据是导图要的那份', async () => {
    const file = writeMd('---\ntitle: 一页\nmarkmap: true\n---\n\n# 标题\n');

    const run = await runLoader(file);
    expect(run.error).toBeNull();
    expect(run.output?.startsWith(MDX_SOURCE)).toBe(true);

    const data = exportedMarkmap(run.output);
    // frontmatter 有 title 时，1.x 的根是 title（H1 作它的子节点）
    expect(data.root.content).toEqual([{ type: 'text', value: '一页' }]);
    expect(data.frontmatter).toEqual({ title: '一页', markmap: true });
    expect(run.warnings).toEqual([]);
  });

  it('判据读的是磁盘上那一份的官方解析结果：产物里有没有 frontmatter 不相干', async () => {
    // loader 收到的 `source` 是编译好的 MDX（里面没有 frontmatter）；那把键是从磁盘上的
    // 源文件按官方那一条读的 —— 判据若改成读产物，这一格就会静默失效（导图永远不出现）。
    const file = writeMd('---\nmarkmap: true\n---\n\n# 标题\n');
    expect(MDX_SOURCE).not.toContain('markmap');

    const run = await runLoader(file);

    expect(exportedMarkmap(run.output).frontmatter.markmap).toBe(true);
  });

  it('带引号的键名也算开了：以前站点判成导图页、数据却没生成', async () => {
    const file = writeMd('---\n"markmap": true\n---\n\n# 标题\n');

    const run = await runLoader(file);

    expect(exportedMarkmap(run.output).root.content).toEqual([
      { type: 'text', value: '标题' },
    ]);
  });

  it('`markmap:true` 不带空格：官方读不成一把键，两边一起看不见', async () => {
    const file = writeMd('---\nmarkmap:true\n---\n\n# 标题\n');

    const run = await runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
  });

  it('没写那把键：原样交回，什么都不追加', async () => {
    const file = writeMd('---\ntitle: 没有这把键\n---\n\n# 标题\n');

    const run = await runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
    expect(run.error).toBeNull();
  });

  it('整个文件都没有 frontmatter：原样交回', async () => {
    const file = writeMd('# 只有标题\n');

    const run = await runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
  });

  it('键在嵌套里（前面缩进）：不算写了这把键', async () => {
    // 那把键是**顶层**的：缩进一格就是别人的字段，原样交回
    const file = writeMd('---\nfoo:\n  markmap: true\n---\n\n# 标题\n');

    const run = await runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
  });

  it('键名前面有别的字：不算写了这把键', async () => {
    const file = writeMd('---\nnotmarkmap: true\n---\n\n# 标题\n');

    const run = await runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
  });

  it('写成 `false` 或空值：视为没开启，原样交回', async () => {
    for (const value of ['false', 'null', '']) {
      const file = writeMd(`---\nmarkmap: ${value}\n---\n\n# 标题\n`);

      const run = await runLoader(file);

      expect(run.output, `markmap: ${value}`).toBe(MDX_SOURCE);
    }
  });

  it('写成对象那一种是渲染选项：也算开了', async () => {
    const file = writeMd('---\nmarkmap:\n  color: red\n---\n\n# 标题\n');

    const run = await runLoader(file);

    expect(exportedMarkmap(run.output).frontmatter.markmap).toEqual({
      color: 'red',
    });
  });

  it('旧选项名在构建期报警告：带页面路径，不安静地掉在浏览器里', async () => {
    const file = writeMd(
      '---\nmarkmap:\n  initialExpandLevel: 1\n---\n\n# 标题\n',
    );

    const run = await runLoader(file);

    expect(run.error).toBeNull();
    expect(run.warnings.map((warning) => warning.message)).toEqual([
      expect.stringContaining('initialExpandLevel'),
    ]);
    expect(run.warnings[0]?.message).toContain(file);
  });

  it('站点那条规则判不成导图页的那几种形状：这里也不生成数据', async () => {
    // 规则是 `{ key: 'markmap', match: 'options' }`：只认真布尔 `true` 与选项对象。
    // 文本、数字、数组那些写法以前被当成真值，于是数据生成了、页面却是普通文档页。
    for (const value of ['"一段文本"', '3', '[a.md, b.md]']) {
      const file = writeMd(`---\nmarkmap: ${value}\n---\n\n# 标题\n`);

      const run = await runLoader(file);

      expect(run.output, `markmap: ${value}`).toBe(MDX_SOURCE);
    }
  });

  it('整段 frontmatter 解析不了：原样交回，不卡住这条 loader', async () => {
    // 官方那一条是异步出口，坏掉的 YAML 以拒绝收场：回调必须被调到，
    // 否则 webpack 永远等不到这一页编译完（真到构建里，mdx-loader 先报错）。
    const file = writeMd('---\nfoo: : bar\nmarkmap: true\n---\n\n# 标题\n');

    const run = await runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
    expect(run.error).toBeNull();
  });

  it('markmap 自己抛了：把那份错误交回 webpack，不产出内容', async () => {
    const file = writeMd('---\nmarkmap: true\n---\n\n# 标题\n');

    forced.throwOnTransform = true;
    try {
      const run = await runLoader(file);

      expect(run.output).toBeNull();
      expect(run.error?.message).toBe('markmap 自己炸了');
    } finally {
      forced.throwOnTransform = false;
    }
  });
});
