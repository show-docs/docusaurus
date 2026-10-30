import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import { normalizeSiteColumn } from '../packages/theme-component-page/src/config.mts';
import {
  buildRuleTable,
  type TableEntry,
} from '../packages/theme-component-page/src/contribute.mts';
import themeComponentPage, {
  type ComponentPageThemeOptions,
} from '../packages/theme-component-page/src/index.mts';
import {
  renderFrameRegistryModule,
  renderRegistryModule,
} from '../packages/theme-component-page/src/registry-module.mts';

/**
## 那张表铺成的两份模块

`@theme/*` 是 webpack 的构建期别名，浏览器侧那句 `import` 只能写死 —— 所以「规则里的登记名 →
真的那个组件」这一跳必须由配置期铺出一份带静态 `import` 的源码，再由 `@generated` 那条别名读回来。
理由与三条实测根据记在 `packages/theme-component-page/docs/internals.md`。

这里钉的是那两份文本的**每一格键名**：类型检查看到的是 `types/component-page-specifiers.d.ts`
那份声明，不是这份产物（它要到站点装载过插件才落盘），两边漂了不会红在类型上 ——
所以这一份与 e2e 各钉一半。

那份文本不手写：站点那一列交进 `normalizeSiteColumn` + `buildRuleTable`（先后与合成由
`component-page-{config,contrib}.test.mts` 钉），产出的表再交给这两格渲染函数，所以这里的输入
都是最终表里的那几条。
*/

/** 两份生成文件相对 `generatedFilesDir` 的位置，与入口里那两格同一路径。 */
const REGISTRY = join('theme-component-page', 'registry.ts');
const FRAME_REGISTRY = join('theme-component-page', 'frame-registry.ts');

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');

/**
本包那两份**不经 `tsc`** 的源码（`theme/` 与 `types/`）：它们由用本包的站点编，
类型检查也看不见生成产物（`.docusaurus/` 排在 `tsconfig.json` 的 exclude 里），
所以「浏览器侧读的那一格」与「配置期写的那一格」对不对齐只能在测试里读原文对。
*/
const packageFile = (relative: string): string =>
  readFileSync(
    join(repoRoot, 'packages/theme-component-page', relative),
    'utf8',
  );

/**
一张只有站点自己那一列的表：每个 `[登记名, 说明符]` 登记一个组件，`rules` 里那些完整规则按
`component` 引用它们。表就是这两格渲染函数吃的输入。
*/
const tableOf = (
  components: readonly [string, string][],
  rules: readonly Record<string, unknown>[],
): TableEntry[] =>
  buildRuleTable(
    normalizeSiteColumn(
      components.map(([id, component]) => ({ id, component })),
      rules,
    ),
    [],
  ).entries;

/** 站点自己的一条规则：一把键 + 引用上面那张登记表里的名字。 */
const ruleOf = (
  key: string,
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ key, component: id, ...extra });

describe('renderRegistryModule：空表也要出一份', () => {
  it('一张表都没有：没有 import，rules 是空数组', () => {
    const source = renderRegistryModule([]);

    expect(source).not.toContain('import');
    expect(source).toContain('export const rules = [];');
    // 抬头那句是捡到这份文件的人唯一的去处线索。
    expect(source).toContain('别手改');
  });
});

describe('renderRegistryModule：一条规则在文档页那一份里铺成什么', () => {
  it('最小那条：判法、读法、落点、登记名、入参各占一格，Component 按 page 那侧的下标定名', () => {
    const source = renderRegistryModule(
      tableOf([['report', '@theme/ReportPage']], [ruleOf('report', 'report')]),
    );

    expect(source).toContain('// 规则 `report`（render: page）');
    expect(source).toContain('import ComponentPage0 from "@theme/ReportPage";');
    expect(source).toContain('key: "report",');
    expect(source).toContain('match: "boolean",');
    expect(source).toContain('source: "auto",');
    expect(source).toContain('render: "page",');
    // `component` 那一格在产物里仍是登记名：真的组件由同一行上的 `Component` 给。
    expect(source).toContain('component: "report",');
    expect(source).toContain('props: undefined,');
    expect(source).toContain('Component: ComponentPage0');
  });

  it('静态入参与另外几臂：那一格写成 JS 字面量', () => {
    const source = renderRegistryModule(
      tableOf(
        [['embed', '@site/src/Embed.tsx']],
        [
          ruleOf('embed', 'embed', {
            match: 'value',
            source: 'frontMatter',
            props: { height: '480', nested: { a: 1 } },
          }),
        ],
      ),
    );

    expect(source).toContain('props: {"height":"480","nested":{"a":1}},');
    expect(source).toContain('match: "value",');
    expect(source).toContain('source: "frontMatter",');
    expect(source).toContain(
      'import ComponentPage0 from "@site/src/Embed.tsx";',
    );
  });

  it('说明符与键里的引号走 JSON 转义：配置写什么都铺不坏生成文件', () => {
    const source = renderRegistryModule(
      tableOf([['a"b', '@theme/we"ird']], [ruleOf('a"b', 'a"b')]),
    );

    expect(source).toContain(
      String.raw`import ComponentPage0 from "@theme/we\"ird";`,
    );
    expect(source).toContain(String.raw`key: "a\"b",`);
  });

  it('顺序 = 命中优先级：两条就是两条 import，名字各自唯一', () => {
    const source = renderRegistryModule(
      tableOf(
        [
          ['a', '@theme/A'],
          ['b', '@theme/B'],
        ],
        [ruleOf('a', 'a'), ruleOf('b', 'b', { match: 'value' })],
      ),
    );

    expect(source).toContain('import ComponentPage0 from "@theme/A";');
    expect(source).toContain('import ComponentPage1 from "@theme/B";');
    expect(source.indexOf('ComponentPage0')).toBeLessThan(
      source.indexOf('ComponentPage1'),
    );
    // 两行的先后就是表的先后。
    expect(source.indexOf('key: "a",')).toBeLessThan(
      source.indexOf('key: "b",'),
    );
  });
});

describe('renderRegistryModule：`render: iframe` 那条不替父文档下载渲染器', () => {
  const mixed = tableOf(
    [
      ['page-widget', '@theme/PageWidget'],
      ['frame-widget', '@theme/FrameWidget'],
    ],
    [
      ruleOf('page', 'page-widget'),
      ruleOf('frame', 'frame-widget', { render: 'iframe' }),
    ],
  );

  it('那条仍占一行（表的顺序要看得见），只是不带 Component，也不 import 那个组件', () => {
    const source = renderRegistryModule(mixed);

    expect(source).toContain('key: "frame",');
    expect(source).toContain('render: "iframe",');
    expect(source).not.toContain('@theme/FrameWidget');
    expect(source.match(/Component: ComponentPage/g)?.length).toBe(1);
  });

  it('page 那侧的下标只管 page 那几条：iframe 那条排前面也不占名字', () => {
    const source = renderRegistryModule(
      tableOf(
        [
          ['frame-widget', '@theme/FrameWidget'],
          ['page-widget', '@theme/PageWidget'],
        ],
        [
          ruleOf('frame', 'frame-widget', { render: 'iframe' }),
          ruleOf('page', 'page-widget'),
        ],
      ),
    );

    expect(source).toContain('import ComponentPage0 from "@theme/PageWidget";');
    expect(source).toContain('Component: ComponentPage0');
    expect(source).not.toContain('ComponentPage1');
  });
});

describe('renderFrameRegistryModule：登记名 → 组件', () => {
  it('只收 iframe 那一侧，按登记名去重', () => {
    const source = renderFrameRegistryModule(
      tableOf(
        [
          ['page-widget', '@theme/PageWidget'],
          ['frame-widget', '@theme/FrameWidget'],
        ],
        [
          ruleOf('page', 'page-widget'),
          ruleOf('frame', 'frame-widget', { render: 'iframe' }),
          // 两条规则引用同一个组件：框里那份只需要一个组件。
          ruleOf('frame-alt', 'frame-widget', { render: 'iframe' }),
        ],
      ),
    );

    expect(source).not.toContain('@theme/PageWidget');
    expect(source).toContain('// 登记名 `frame-widget`');
    expect(source).toContain(
      'import FrameComponent0 from "@theme/FrameWidget";',
    );
    expect(source).toContain(
      '{ id: "frame-widget", Component: FrameComponent0 }',
    );
    expect(source.match(/import FrameComponent/g)?.length).toBe(1);
  });

  it('一条 iframe 规则都没有：没有 import，components 是空数组', () => {
    expect(
      renderFrameRegistryModule(
        tableOf([['a', '@theme/A']], [ruleOf('a', 'a')]),
      ),
    ).toContain('export const components = [];');
    expect(renderFrameRegistryModule([])).toContain(
      'export const components = [];',
    );
  });
});

describe('入口把两份模块写进 Docusaurus 的生成目录', () => {
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'theme-component-page-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** 跑一遍 `allContentLoaded`；那条框内路由与本包无关，收进一个数组丢掉。 */
  const writeTables = (
    target: string,
    options: ComponentPageThemeOptions,
  ): void => {
    const plugin = themeComponentPage(
      // `allContentLoaded` 只读落盘点与 `baseUrl`（那条框内路由的路径）。
      {
        generatedFilesDir: target,
        siteConfig: { baseUrl: '/' },
      } as unknown as LoadContext,
      options,
    );
    const hook = plugin.allContentLoaded as unknown as (args: {
      allContent: Record<string, Record<string, unknown>>;
      actions: { addRoute: (route: unknown) => void };
    }) => void;

    hook({ allContent: {}, actions: { addRoute: () => {} } });
  };

  it('落的盘：目录不在就先建，两份文件里就是那张表铺出来的那几行', () => {
    // 生成目录下面那一层是本包自己建的（Docusaurus 只保证 `generatedFilesDir` 在）。
    const target = join(dir, 'site');

    writeTables(target, {
      components: [{ id: 'report', component: '@theme/ReportPage' }],
      rules: [{ key: 'report', component: 'report' }],
    });

    const registry = readFileSync(join(target, REGISTRY), 'utf8');
    const frame = readFileSync(join(target, FRAME_REGISTRY), 'utf8');

    expect(registry).toContain(
      'import ComponentPage0 from "@theme/ReportPage";',
    );
    expect(registry).toContain('key: "report",');
    // 这条规则落点是 `page`：框内那一份里没有它引用的组件。
    expect(frame).toContain('export const components = [];');
  });

  it('浏览器侧那两句 @generated 落的正是写盘那两条路径', () => {
    // 入口写的那两格与 `theme/DocItem`、`theme/ComponentFramePage` 里那两句说明符是**三处字面量**，
    // 靠注释约定一字不差。漂了不会红在类型上（babel 不吃类型），只会让那一层读不到那张表、
    // 每页都交回下层 / 框里一片空白 —— 所以这里拿真实写盘的结果对：从浏览器侧那句反推路径，
    // 要求文件真的在那儿。
    const target = join(dir, 'importers');

    writeTables(target, {});

    for (const [importer, specifier] of [
      ['theme/DocItem/index.tsx', /from '@generated\/([^']+)';/u],
      ['theme/ComponentFramePage/index.tsx', /from '@generated\/([^']+)';/u],
    ] as const) {
      const read = specifier.exec(packageFile(importer))?.[1];

      expect(read, `${importer} 里没读到那句 @generated import`).toBeTruthy();
      const written = join(target, `${read}.ts`);

      expect(
        existsSync(written),
        `那句读的是 ${written}，入口却没往那儿写`,
      ).toBe(true);
    }
  });
});

/**
生成文件里那几格要和两份声明对齐：`types/component-page.d.ts` 里 `ComponentPageRule` 那些格，
加上 `types/component-page-specifiers.d.ts` 里两条臂各自多出来的那一格。类型检查看不见产物，
两边各改各的不会红 —— 新增一格时这里会红，比运行时一个 `undefined` 早。
*/
describe('生成文件那一格的键名与两份声明同步', () => {
  /** 取一块声明里的字段名：只认行首那个名字紧跟 `:`（或 `?:`）的那一行，注释行不算。 */
  const fieldNames = (block: string): string[] =>
    block
      .matchAll(/^\s*(\w+)\??:/gm)
      .map(([, name]) => name!)
      .toArray();

  /**
  取生成文本里那一格的字段名：文档页那一份一行一格、框内那一份一整行，两种写法都读
  （所以不按行首，而按 `{` / `,` 后面那个名字）。两边的样本都不带嵌套 `props`，
  否则 JSON 里那几格也会被读成字段名。
  */
  const rowFieldNames = (block: string): string[] =>
    block
      .matchAll(/[{,]\s*(\w+)\s*:/g)
      .map(([, name]) => name!)
      .toArray();

  /** 比的是一致不一致，顺序不算：两边都按同一口径排。 */
  const ordered = (names: readonly string[]): string[] =>
    [...names].toSorted((left, right) => left.localeCompare(right));

  /** 声明那一侧：规则自己的六格 + 注册表多出来的 `Component`。 */
  const PAGE_SHAPES = [
    'Component',
    'component',
    'key',
    'match',
    'props',
    'render',
    'source',
  ];

  const ruleFields = (): string[] => {
    const declaration =
      /export type ComponentPageRuleDeclaration = \{([\s\S]*?)\n\}/u.exec(
        packageFile('types/component-page.d.ts'),
      )?.[1];

    expect(
      declaration,
      'types 里读不到 ComponentPageRuleDeclaration',
    ).toBeTruthy();

    return fieldNames(declaration!);
  };

  it('声明那一侧：规则六格，加上文档页那条臂多出来的 Component', () => {
    expect(ordered([...ruleFields(), 'Component'])).toEqual(
      ordered(PAGE_SHAPES),
    );
  });

  it('产物那一侧（文档页）：铺出来的每一格与声明那一侧同集合', () => {
    const source = renderRegistryModule(
      tableOf([['report', '@theme/ReportPage']], [ruleOf('report', 'report')]),
    );
    const body = /export const rules = \[([\s\S]*?)\n\];/u.exec(source)?.[1];

    expect(ordered(rowFieldNames(body!))).toEqual(ordered(PAGE_SHAPES));
  });

  it('框内那一份：产物里那一格的键名就是声明里那两个', () => {
    const source = renderFrameRegistryModule(
      tableOf(
        [['embed', '@theme/Embed']],
        [ruleOf('embed', 'embed', { render: 'iframe' })],
      ),
    );
    const body = /export const components = \[([\s\S]*?)\n\];/u.exec(
      source,
    )?.[1];

    expect(ordered(rowFieldNames(body!))).toEqual(['Component', 'id']);
  });
});
