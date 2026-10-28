import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import { normalizePages } from '../packages/theme-component-page/src/config.mts';
import themeComponentPage from '../packages/theme-component-page/src/index.mts';
import { renderRegistryModule } from '../packages/theme-component-page/src/registry-module.mts';

/**
## 配置期那列清单铺成的那份模块

`@theme/*` 是 webpack 的构建期别名，浏览器侧那份 `DocItem` 只能写死 `import` —— 所以
「配置里的字符串 → 真的那个组件」这一跳必须由配置期铺出一份带静态 `import` 的源码，
再由 `@generated` 那条别名读回来。理由与三条实测根据记在
`packages/theme-component-page/docs/internals.md`。

这里钉的是那份文本的**每一格键名**：类型检查看到的是 `types/component-page-specifiers.d.ts`
那份声明，不是这份产物（它要到站点装载过插件才落盘），两边漂了不会红在类型上 ——
所以这一份与 e2e 各钉一半。

那份文本不手写：站点配置交进 `normalizePages`（`component-page-config.test.mts` 钉它），
产出的条目再交给 `renderRegistryModule`，所以这里的输入都是归一化之后的形状。
*/

/** 生成文件相对 `generatedFilesDir` 的那一格，与入口里 `REGISTRY_FILE` 同一路径。 */
const REGISTRY = join('theme-component-page', 'registry.ts');

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');

/**
本包那两份**不经 `tsc`** 的源码（`theme/DocItem` 与 `types/`）：它们由用本包的站点编，
类型检查也看不见生成产物（`.docusaurus/` 排在 `tsconfig.json` 的 exclude 里），
所以「浏览器侧读的那一格」与「配置期写的那一格」对不对齐只能在测试里读原文对。
*/
const packageFile = (relative: string): string =>
  readFileSync(
    join(repoRoot, 'packages/theme-component-page', relative),
    'utf8',
  );

/** 一条归一化好的页：省掉每个用例重写一遍 `{entry, specifier}`。 */
const pageOf = (
  key: string,
  component: string,
  match: 'boolean' | 'value' = 'boolean',
  props?: Record<string, unknown>,
) => normalizePages([{ key, component, match, props }]);

/**
入口 context：`contentLoaded` 读 `siteDir`（问「装了哪些包交出条目」）与 `generatedFilesDir`
（落盘点）。这里给的 `siteDir` 是个没有配置、没有 core 的空目录，那次推导因此交回 `null`
（= 没有包交出条目），本层照旧只铺站点自己那一列 —— 这两条用例钉的就是那一份。
*/
const contextOf = (generatedFilesDir: string): LoadContext =>
  ({
    generatedFilesDir,
    siteDir: generatedFilesDir,
  }) as unknown as LoadContext;

/** 那个空 `siteDir` 会让推导报一条「拿不到插件列表」的告警；这两条用例不断言告警，收掉。 */
const silent = { logger: { warn: () => {} } };

describe('renderRegistryModule：空清单也要出一份', () => {
  it('一条没配：没有 import，pages 是空数组', () => {
    const source = renderRegistryModule([]);

    expect(source).not.toContain('import');
    expect(source).toContain('export const pages = [];');
    // 抬头那句是捡到这份文件的人唯一的去处线索。
    expect(source).toContain('别手改');
  });
});

describe('renderRegistryModule：一条页铺成什么', () => {
  it('最小那条：判法与入参各占一格，Component 按清单下标定名', () => {
    const source = renderRegistryModule(pageOf('report', '@theme/ReportPage'));

    expect(source).toContain('// pages[0]，键 `report`');
    expect(source).toContain('import ComponentPage0 from "@theme/ReportPage";');
    expect(source).toContain('key: "report",');
    expect(source).toContain('match: "boolean",');
    expect(source).toContain('props: undefined,');
    expect(source).toContain('Component: ComponentPage0,');
  });

  it('静态入参与 value 判法：那一格写成 JS 字面量', () => {
    const source = renderRegistryModule(
      pageOf('embed', '@site/src/Embed.tsx', 'value', {
        height: '480',
        nested: { a: 1 },
      }),
    );

    expect(source).toContain('props: {"height":"480","nested":{"a":1}},');
    expect(source).toContain('match: "value",');
    expect(source).toContain(
      'import ComponentPage0 from "@site/src/Embed.tsx";',
    );
  });

  it('说明符与键里的引号走 JSON 转义：配置写什么都铺不坏生成文件', () => {
    const source = renderRegistryModule(pageOf('a"b', '@theme/we"ird'));

    expect(source).toContain(
      String.raw`import ComponentPage0 from "@theme/we\"ird";`,
    );
    expect(source).toContain(String.raw`key: "a\"b",`);
  });

  it('顺序与下标：两条就是两条 import，名字各自唯一', () => {
    const source = renderRegistryModule([
      ...pageOf('a', '@theme/A'),
      ...pageOf('b', '@theme/B', 'value'),
    ]);

    expect(source).toContain('import ComponentPage0 from "@theme/A";');
    expect(source).toContain('import ComponentPage1 from "@theme/B";');
    expect(source.indexOf('ComponentPage0,')).toBeLessThan(
      source.indexOf('ComponentPage1,'),
    );
  });
});

describe('入口把那份模块写进 Docusaurus 的生成目录', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'theme-component-page-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('contentLoaded 落的盘：目录不在就先建，文件里就是清单铺出来的那几行', async () => {
    // 生成目录下面那一层是本包自己建的（Docusaurus 只保证 `generatedFilesDir` 在）。
    const target = join(dir, 'site');
    const plugin = themeComponentPage(contextOf(target), {
      ...silent,
      pages: [{ key: 'report', component: '@theme/ReportPage' }],
    });

    // 入口读的那两格是 `siteDir`（问包交出的条目）与 `generatedFilesDir`，其余一概不读。
    await (plugin.contentLoaded as () => Promise<void>)();

    const source = readFileSync(join(target, REGISTRY), 'utf8');

    expect(source).toContain('import ComponentPage0 from "@theme/ReportPage";');
    expect(source).toContain('key: "report",');
  });

  it('浏览器侧那句 @generated 落的正是写盘那一路径', async () => {
    // 入口写的那一格与 `theme/DocItem` 里那句说明符是**两处字面量**，靠注释约定一字不差。
    // 漂了不会红在类型上（babel 不吃类型），只会让那一层读不到清单、每页都交回下层 ——
    // 所以这里拿真实写盘的结果对：从浏览器侧那句反推路径，要求文件真的在那儿。
    const target = join(dir, 'importer');
    const plugin = themeComponentPage(contextOf(target), {
      ...silent,
      pages: [{ key: 'report', component: '@theme/ReportPage' }],
    });

    await (plugin.contentLoaded as () => Promise<void>)();

    const specifier = /from '@generated\/([^']+)';/u.exec(
      packageFile('theme/DocItem/index.tsx'),
    )?.[1];

    expect(
      specifier,
      'theme/DocItem 里没读到那句 @generated import',
    ).toBeTruthy();

    const written = join(target, `${specifier}.ts`);

    expect(existsSync(written), `那句读的是 ${written}，入口却没往那儿写`).toBe(
      true,
    );
  });
});

/**
生成文件那一格的键名要和两份声明对齐：`types/component-page.d.ts` 里 `ComponentPageEntry`
那些格，加上 `types/component-page-specifiers.d.ts` 里那条 `& { Component: … }` 多出来的一格。
类型检查看不见产物，两边各改各的不会红 —— 新增一格时这里会红，比运行时一个 `undefined` 早。
*/
describe('生成文件那一格的键名与两份声明同步', () => {
  /** 取一块源码或生成文本里的字段名：只认紧跟 `:`（或 `?:`）的那一行，注释行不算。 */
  const fieldNames = (block: string): string[] =>
    block
      .matchAll(/^ +(\w+)\??:/gm)
      .map(([, name]) => name!)
      .toArray();

  /** 比的是一致不一致，顺序不算：两边都按同一口径排。 */
  const ordered = (names: readonly string[]): string[] =>
    [...names].toSorted((left, right) => left.localeCompare(right));

  /** 声明与产物两边都该说得出这一份：条目自己的三格 + 注册表多出来的 `Component`。 */
  const SHAPES = ['Component', 'key', 'match', 'props'];

  it('声明那一侧：条目自己的格加上注册表多出来的 Component', () => {
    const entry = /export type ComponentPageEntry = \{([\s\S]*?)\n\}/u.exec(
      packageFile('types/component-page.d.ts'),
    )?.[1];
    const registry = /& \{([\s\S]*?)\n {2}\}/u.exec(
      packageFile('types/component-page-specifiers.d.ts'),
    )?.[1];

    expect(ordered([...fieldNames(entry!), ...fieldNames(registry!)])).toEqual(
      SHAPES,
    );
  });

  it('产物那一侧：铺出来的每一格与声明那一侧同集合', () => {
    const source = renderRegistryModule(pageOf('report', '@theme/ReportPage'));
    const body = /export const pages = \[([\s\S]*?)\n\];/u.exec(source)?.[1];

    // 生成文本里那一格多缩进两层，其余口径同上。
    expect(ordered(fieldNames(body!))).toEqual(SHAPES);
  });
});
