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

`buildMarkmapData` 只留 markmap 的 **frontmatter** 那一条内置插件（见那份文件头），
所以 `features` 恒为空、额外资源恒为空 —— 这几格是「形状」，不是「判据」。
真正要钉的是那把键的三种读法（写了 / 没写 / 写成假）与链接那一格。
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

/** 一次 loader 调用的两样产出：交回 webpack 的内容、以及第一个参数（错误）。 */
interface LoaderRun {
  output: string | null;
  error: Error | null;
}

/**
用一个假的 loader 上下文跑一遍本包那条 `enforce: 'post'` loader。

真实上下文由 webpack 逐次构造，这一层只用到 `cacheable` / `async` / `resourcePath` 三件。
*/
function runLoader(resourcePath: string): LoaderRun {
  const result: LoaderRun = { output: null, error: null };

  const context = {
    resourcePath,
    cacheable: () => undefined,
    async: () => (error: Error | null, source?: string) => {
      result.error = error;
      result.output = source ?? null;
    },
  };

  loader.call(context as never, MDX_SOURCE);
  return result;
}

/** 取出产物末尾那条 `export const markmap`，按 `MarkmapData` 读回来。 */
function exportedMarkmap(output: string | null): MarkmapData {
  const raw = /export const markmap = (.*);\n$/.exec(output ?? '')?.[1];

  expect(raw, '产物末尾该有一条 `export const markmap`').toBeDefined();

  return JSON.parse(raw!) as MarkmapData;
}

describe('buildMarkmapData：markdown 落成导图要的那份数据', () => {
  it('五格都在：树、features、额外资源、以及 markmap 自己那份 frontmatter', () => {
    const data = buildMarkmapData('# 标题\n');

    expect(Object.keys(data).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'features',
      'frontmatter',
      'root',
      'scripts',
      'styles',
    ]);
    expect(data.root.content).toBe('&#x6807;&#x9898;');
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

  it('`markmap` 写成对象时是渲染选项：值被归一成数组', () => {
    // markmap 自己那份 htmlParser 选项要的是数组；这层只把原文交进去，归一是它做的
    const data = buildMarkmapData(
      '---\nmarkmap:\n  color: red\n---\n\n# 标题\n',
    );

    expect(data.frontmatter?.markmap).toEqual({ color: ['red'] });
  });

  it('frontmatter 坏掉时：那份 frontmatter 整个没有，不是半个', () => {
    const data = buildMarkmapData('---\nmarkmap: [没关上\n---\n\n# 标题\n');

    expect(data.frontmatter).toBeUndefined();
  });

  it('链接开新标签页：标题里的那条链接多一个 `target="_blank"`', () => {
    const data = buildMarkmapData('# [标题](https://example.com)\n');

    expect(data.root.content).toBe(
      '<a href="https://example.com" target="_blank">&#x6807;&#x9898;</a>',
    );
  });

  it('没有链接时：属性一个都不多加', () => {
    // 那条包装挂在渲染器的属性函数上，不该给别的标签也塞一个 target
    const data = buildMarkmapData('# 只有标题\n');

    expect(data.root.content).not.toContain('target=');
  });
});

describe('md loader 的四种落点', () => {
  it('写了 `markmap:`：追加一条导出，数据是导图要的那份', () => {
    const file = writeMd('---\ntitle: 一页\nmarkmap: true\n---\n\n# 标题\n');

    const run = runLoader(file);
    expect(run.error).toBeNull();
    expect(run.output?.startsWith(MDX_SOURCE)).toBe(true);

    const data = exportedMarkmap(run.output);
    expect(data.root.content).toBe('&#x6807;&#x9898;');
    expect(data.frontmatter).toEqual({ title: '一页', markmap: true });
  });

  it('判据读的是磁盘上那一份原文：产物里有没有 frontmatter 不相干', () => {
    // loader 收到的 `source` 是编译好的 MDX（里面没有 frontmatter）；那把键是从磁盘上的
    // 源文件读的 —— 判据若改成读产物，这一格就会静默失效（导图永远不出现）。
    const file = writeMd('---\nmarkmap: true\n---\n\n# 标题\n');
    expect(MDX_SOURCE).not.toContain('markmap');

    const run = runLoader(file);

    expect(exportedMarkmap(run.output).frontmatter?.markmap).toBe(true);
  });

  it('没写那把键：原样交回，什么都不追加', () => {
    const file = writeMd('---\ntitle: 没有这把键\n---\n\n# 标题\n');

    const run = runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
    expect(run.error).toBeNull();
  });

  it('整个文件都没有 frontmatter：原样交回', () => {
    const file = writeMd('# 只有标题\n');

    const run = runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
  });

  it('键在嵌套里（前面缩进）：不算写了这把键', () => {
    // 那把键是**顶层**的：缩进一格就是别人的字段，原样交回
    const file = writeMd('---\nfoo:\n  markmap: true\n---\n\n# 标题\n');

    const run = runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
  });

  it('键名前面有别的字：不算写了这把键', () => {
    const file = writeMd('---\nnotmarkmap: true\n---\n\n# 标题\n');

    const run = runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
  });

  it('写成 `false` 或空值：视为没开启，原样交回', () => {
    for (const value of ['false', 'null', '']) {
      const file = writeMd(`---\nmarkmap: ${value}\n---\n\n# 标题\n`);

      const run = runLoader(file);

      expect(run.output, `markmap: ${value}`).toBe(MDX_SOURCE);
    }
  });

  it('frontmatter 坏掉：markmap 自己也解析不出那把键，原样交回', () => {
    const file = writeMd('---\nmarkmap: [没关上\n---\n\n# 标题\n');

    const run = runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
    expect(run.error).toBeNull();
  });

  it('markmap 自己抛了：把那份错误交回 webpack，不产出内容', () => {
    const file = writeMd('---\nmarkmap: true\n---\n\n# 标题\n');

    forced.throwOnTransform = true;
    try {
      const run = runLoader(file);

      expect(run.output).toBeNull();
      expect(run.error?.message).toBe('markmap 自己炸了');
    } finally {
      forced.throwOnTransform = false;
    }
  });
});
