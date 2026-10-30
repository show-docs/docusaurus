import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AllContent, LoadContext } from '@docusaurus/types';

import { PluginDiscovery } from '../packages/plugin-prev-layer-resolver/src/plugins.mts';
import {
  normalizeContribution,
  normalizeSiteColumn,
} from '../packages/theme-component-page/src/config.mts';
import {
  buildRuleTable,
  collectContributions,
  type ContributedColumn,
  type RuleTable,
} from '../packages/theme-component-page/src/contribute.mts';
import themeComponentPage, {
  type ComponentPageThemeOptions,
} from '../packages/theme-component-page/src/index.mts';

import { makePluginSite, warnSink, type PluginSite } from './helpers.mts';

/**
## 两张表怎么合成一张

站点自己在配置里写一列已经能用（形状与三种臂由 `component-page-config.test.mts` 钉）；这里钉的是
「装了那个包就自动生效」那一步：约定只有一条（content 里有 `componentPage` 那一格），合成有四条
—— 站点那一列的顺序就是优先级、没被提过的默认规则按**键名的固定字符串顺序**接在后面、引用／覆写／
禁用三种臂各取其解、两个包抢同一格就红（站点把那把键关掉时例外）。

读到那一格的时机是 `allContentLoaded` —— 官方的 `allContent` 把各插件的 content 汇到一起，所以
这里既有喂数据进去的对合，也有一条**真跑一遍官方插件加载路径**的端到端：只有后者能证明「贡献方
`loadContent()` 的返回值真的会出现在 `allContent` 里」。
*/

/** 一位贡献者交来的那两格（走真实那条校验，与 `collectContributions` 里同一跳）。 */
const columnOf = (from: string, declared: unknown): ContributedColumn => ({
  from,
  ...normalizeContribution(declared, `componentPage（${from} 交出的）`),
});

/** 某个包登记一个组件、并为它配一条默认规则：最常见的那一种贡献。 */
const pkgOf = (
  from: string,
  id: string,
  specifier: string,
  key = id,
): ContributedColumn =>
  columnOf(from, {
    components: [{ id, component: specifier }],
    rules: [{ key, component: id }],
  });

/** 站点那一列里登记一个组件的写法（`component` 是说明符，与包交出的同一形状）。 */
const compOf = (
  id: string,
  component: string,
): { id: string; component: string } => ({
  id,
  component,
});

/** 站点那一列：与入口里同一跳（`options.components` / `options.rules`）。 */
const siteOf = (
  components: readonly { id: string; component: string }[] | undefined,
  rules: readonly (string | Record<string, unknown>)[] | undefined,
): ReturnType<typeof normalizeSiteColumn> =>
  normalizeSiteColumn(components as unknown, rules as unknown);

/** 那一列里一条完整规则的写法（`component` 是登记名，不是说明符）。 */
const ruleOf = (key: string, id: string): Record<string, unknown> => ({
  key,
  component: id,
});

/** 表里那几把键，按表的顺序读 —— 顺序就是命中优先级，所以这一格是要钉的东西。 */
const keysOf = (table: Pick<RuleTable, 'entries'>): string[] =>
  table.entries.map((entry) => entry.key);

describe('collectContributions：读 allContent 里那一格', () => {
  it('只留交出那两格的插件，形状与站点写的同一条校验', () => {
    const declared = {
      components: [{ id: 'report', component: '@theme/Report' }],
      rules: [{ key: 'report', component: 'report', match: 'value' }],
    };
    const contributed = collectContributions({
      'plain-theme': { default: { routes: [] } },
      '@scope/pkg': { default: { componentPage: declared } },
    });

    expect(contributed).toEqual([columnOf('@scope/pkg', declared)]);
  });

  it('两格都空也是合法的；content 不是对象、或没有那一格就一眼不看', () => {
    expect(
      collectContributions({
        'empty-theme': { default: { componentPage: {} } },
      }),
    ).toEqual([columnOf('empty-theme', {})]);

    // 只交组件不交默认规则、或反过来，都是这一族里真实存在的两种写法（组件留给站点的规则引用）。
    expect(
      collectContributions({
        'no-rules': {
          default: {
            componentPage: { components: [{ id: 'a', component: '@theme/A' }] },
          },
        },
        'no-components': {
          default: {
            componentPage: { rules: [{ key: 'b', component: 'b' }] },
          },
        },
      }),
    ).toEqual([
      columnOf('no-rules', {
        components: [{ id: 'a', component: '@theme/A' }],
      }),
      columnOf('no-components', { rules: [{ key: 'b', component: 'b' }] }),
    ]);

    expect(
      collectContributions({
        stringy: { default: 'x' },
        nullish: { default: null },
        missing: { default: {} },
        'other-keys': { default: { routes: [], components: [] } },
      }),
    ).toEqual([]);
  });

  it('同一个包装了两次（两个 id）：两份 content 都收，出处里带上 id', () => {
    expect(
      collectContributions({
        pkg: {
          first: { componentPage: { rules: [{ key: 'a', component: 'a' }] } },
          second: {
            componentPage: { rules: [{ key: 'b', component: 'b' }] },
          },
        },
      }),
    ).toEqual([
      columnOf('pkg（id: first）', { rules: [{ key: 'a', component: 'a' }] }),
      columnOf('pkg（id: second）', { rules: [{ key: 'b', component: 'b' }] }),
    ]);
  });

  it('交出的那一格写歪了：红，点名到插件、第几条、哪一格', () => {
    expect(() =>
      collectContributions({
        '@scope/bad': { default: { componentPage: '不是对象' } },
      }),
    ).toThrow(/componentPage（@scope\/bad 交出的） 要一个对象/u);

    expect(() =>
      collectContributions({
        '@scope/bad': { default: { componentPage: { rules: '不是数组' } } },
      }),
    ).toThrow(/componentPage（@scope\/bad 交出的）\.rules 要一个数组/u);

    // 逐格也一样带上「哪个插件、第几条、哪一格」：站点看到这条才知道该去找谁。
    expect(() =>
      collectContributions({
        '@scope/bad': { default: { componentPage: { rules: [{ key: 'a' }] } } },
      }),
    ).toThrow(/componentPage（@scope\/bad 交出的）\.rules\[0\]\.component/u);
  });

  it('包交出的那一列不认站点那两种臂：`enabled: false` 红，不许包替站点决定自己不生效', () => {
    expect(() =>
      collectContributions({
        pkg: {
          default: {
            componentPage: {
              rules: [{ key: 'a', component: 'a', enabled: false }],
            },
          },
        },
      }),
    ).toThrow(/componentPage（pkg 交出的）\.rules\[0\] 写了 `enabled`/u);
  });

  it('旧的那一格（`componentPages`）只红一次，并把迁移的话说清楚', () => {
    // 让它安静地不生效是最坏的那种升级：站点照常构建，被接管的每一页退回普通文档页。
    expect(() =>
      collectContributions({
        'theme-old': {
          default: { componentPages: [{ key: 'a', component: '@theme/A' }] },
        },
      }),
    ).toThrow(
      /theme-component-page：theme-old 的 loadContent\(\) 交回的是旧的那一格 `componentPages`/u,
    );

    // 出处那一格与别的报错同口径（带 id 的那个实例也要能分辨出来）。
    expect(() =>
      collectContributions({
        pkg: { second: { componentPages: [] } },
      }),
    ).toThrow(/pkg（id: second） 的 loadContent\(\)/u);
  });
});

describe('buildRuleTable：站点那一列的顺序就是优先级', () => {
  it('只有站点自己那一列：按写的顺序，说明符取自站点自己的登记表', () => {
    const table = buildRuleTable(
      siteOf(
        [compOf('report', '@theme/ReportPage')],
        [ruleOf('report', 'report')],
      ),
      [],
    );

    expect(keysOf(table)).toEqual(['report']);
    expect(table.entries[0]!.specifier).toBe('@theme/ReportPage');
    // 生成模块里那条 `import` 用说明符，规则里那一格仍是登记名：两侧各读各的。
    expect(table.entries[0]!.component).toBe('report');
    expect(table.notices).toEqual([]);
  });

  it('各写各的键：站点的排前面，剩下的默认规则按键名排在后面', () => {
    const table = buildRuleTable(
      siteOf([compOf('mine', '@theme/Mine')], [ruleOf('site-key', 'mine')]),
      [
        pkgOf('pkg-a', 'zeta', '@theme/Zeta'),
        pkgOf('pkg-a', 'alpha', '@theme/Alpha'),
        pkgOf('pkg-b', 'mid', '@theme/Mid'),
      ],
    );

    // 尾部那一串按**键名的固定字符串顺序**：alpha < mid < zeta，与包、与交来的先后都无关。
    expect(keysOf(table)).toEqual(['site-key', 'alpha', 'mid', 'zeta']);
    expect(table.notices).toEqual([]);
  });

  it('同一批贡献调个先后铺进来：出来的表一字不差', () => {
    // 钉的是「优先级不依赖插件声明顺序、allContent 枚举或异步完成顺序」那条承诺。
    const contributed = [
      pkgOf('pkg-a', 'a-one', '@theme/A1'),
      pkgOf('pkg-b', 'b-one', '@theme/B1'),
      pkgOf('pkg-c', 'c-one', '@theme/C1'),
    ];
    const site = siteOf(undefined, []);

    expect(buildRuleTable(site, contributed).entries).toEqual(
      buildRuleTable(site, contributed.toReversed()).entries,
    );
    expect(keysOf(buildRuleTable(site, contributed))).toEqual([
      'a-one',
      'b-one',
      'c-one',
    ]);
  });

  it('引用那一臂把那条默认规则提到这个位置：内容照取，不算覆写、不留提示', () => {
    const table = buildRuleTable(
      siteOf(
        [compOf('mine', '@theme/Mine')],
        [ruleOf('own', 'mine'), 'report'],
      ),
      [
        columnOf('pkg-a', {
          components: [{ id: 'report', component: '@theme/PkgReport' }],
          rules: [
            {
              key: 'report',
              component: 'report',
              match: 'value',
              render: 'iframe',
              props: { height: '480' },
            },
          ],
        }),
      ],
    );

    expect(keysOf(table)).toEqual(['own', 'report']);
    // 取的是那一条本身（判法、落点、静态入参、说明符都在），不是站点另写的一条。
    expect(table.entries[1]).toEqual({
      key: 'report',
      component: 'report',
      id: 'report',
      match: 'value',
      source: 'auto',
      render: 'iframe',
      props: { height: '480' },
      specifier: '@theme/PkgReport',
    });
    expect(table.notices).toEqual([]);
  });

  it('引用一把没有包交出的键：红，并把三种改法都写进报错', () => {
    expect(() => buildRuleTable(siteOf(undefined, ['ghost']), [])).toThrow(
      /站点配置里引用了键「ghost」，但没有任何装着的包交出这条默认规则/,
    );
  });

  it('完整覆写不继承那条默认规则的任何一格，并留一条点名那个包的提示', () => {
    const table = buildRuleTable(
      siteOf(
        [compOf('site-report', '@theme/SiteReport')],
        [ruleOf('report', 'site-report')],
      ),
      [
        columnOf('pkg-a', {
          components: [{ id: 'pkg-report', component: '@theme/PkgReport' }],
          rules: [
            {
              key: 'report',
              component: 'pkg-report',
              match: 'value',
              source: 'frontMatter',
              render: 'iframe',
              props: { height: '480' },
            },
          ],
        }),
      ],
    );

    expect(keysOf(table)).toEqual(['report']);
    expect(table.entries[0]!.specifier).toBe('@theme/SiteReport');
    // 「只改一格」的写法实际把另几格换成了缺省值，所以覆写就是整条重写。
    expect(table.entries[0]!.match).toBe('boolean');
    expect(table.entries[0]!.source).toBe('auto');
    expect(table.entries[0]!.render).toBe('page');
    expect(table.entries[0]!.props).toBeUndefined();
    expect(table.notices).toEqual([
      'theme-component-page：键「report」本来由 pkg-a 交出，站点配置里也写了这一把，用站点那一条（完整覆写不继承那条默认规则的 `match` / `source` / `render` / `props`）。',
    ]);
  });

  it('站点自己新写一把键：没人被压掉，一条提示都不打', () => {
    const table = buildRuleTable(
      siteOf([compOf('mine', '@theme/Mine')], [ruleOf('brand-new', 'mine')]),
      [pkgOf('pkg-a', 'other', '@theme/Other')],
    );

    expect(table.notices).toEqual([]);
  });
});

describe('buildRuleTable：站点把那把键关掉（enabled: false）', () => {
  it('只关掉那一把键：别的包那条照常，并留一条点名那个包的提示', () => {
    const table = buildRuleTable(
      siteOf(undefined, [{ key: 'embed', enabled: false }]),
      [
        pkgOf('pkg-a', 'embed', '@theme/Embed'),
        pkgOf('pkg-a', 'keep', '@theme/Keep'),
        pkgOf('pkg-b', 'other', '@theme/Other'),
      ],
    );

    expect(keysOf(table)).toEqual(['keep', 'other']);
    expect(table.notices).toEqual([
      'theme-component-page：键「embed」在站点配置里被关掉了（`enabled: false`），pkg-a 交出的那条默认规则不生效。',
    ]);
  });

  it('关掉一把没人交出的键：合法，也不留提示（没压掉任何东西）', () => {
    const table = buildRuleTable(
      siteOf(
        [compOf('mine', '@theme/Mine')],
        [{ key: 'ghost', enabled: false }, ruleOf('own', 'mine')],
      ),
      [],
    );

    expect(keysOf(table)).toEqual(['own']);
    expect(table.notices).toEqual([]);
  });

  it('两个包抢的那把键正好被站点关掉：不红 —— 两边都不生效，抢赢抢输没有后果', () => {
    const table = buildRuleTable(
      siteOf(undefined, [{ key: 'report', enabled: false }]),
      [
        pkgOf('pkg-a', 'a-report', '@theme/A', 'report'),
        pkgOf('pkg-b', 'b-report', '@theme/B', 'report'),
      ],
    );

    expect(keysOf(table)).toEqual([]);
    // 提示要把两家都点出来：只报一家会让站点以为另一家还在生效。
    expect(table.notices).toEqual([
      'theme-component-page：键「report」在站点配置里被关掉了（`enabled: false`），pkg-a 和 pkg-b 交出的那条默认规则不生效。',
    ]);
  });

  it('抢同一把键而站点没关掉它：红，把抢的两边都点出来', () => {
    // 让其中一个悄悄赢，另一族的键在它自己那侧照样命中、页面却归了这个包 —— 那种结果没人能从产物里看出来。
    expect(() =>
      buildRuleTable(siteOf(undefined, []), [
        pkgOf('pkg-a', 'a-report', '@theme/A', 'report'),
        pkgOf('pkg-b', 'b-report', '@theme/B', 'report'),
      ]),
    ).toThrow(/键「report」被 pkg-a 和 pkg-b 各交出一条默认规则/);
  });
});

describe('buildRuleTable：那条规则引用的组件是谁登记的，跟它出自同一个人不是前提', () => {
  it('站点的规则引用某个包登记的组件（正常用法）', () => {
    const table = buildRuleTable(
      siteOf(undefined, [ruleOf('report', 'pkg-report')]),
      [
        columnOf('pkg-a', {
          components: [{ id: 'pkg-report', component: '@theme/PkgReport' }],
        }),
      ],
    );

    expect(table.entries[0]!.specifier).toBe('@theme/PkgReport');
  });

  it('包交出的规则引用站点登记的组件', () => {
    const table = buildRuleTable(
      siteOf([compOf('site-widget', '@theme/Widget')], []),
      [
        columnOf('pkg-a', {
          rules: [{ key: 'widget', component: 'site-widget' }],
        }),
      ],
    );

    expect(table.entries[0]!.specifier).toBe('@theme/Widget');
  });

  it('引用了没人登记过的组件：红，点名这条规则是谁写的', () => {
    expect(() =>
      buildRuleTable(siteOf(undefined, [ruleOf('a', 'ghost')]), []),
    ).toThrow(
      /键「a」那条规则（站点配置）引用了组件登记名「ghost」，但全站没有这一条登记/,
    );
    expect(() =>
      buildRuleTable(siteOf(undefined, []), [
        columnOf('pkg-a', { rules: [{ key: 'a', component: 'ghost' }] }),
      ]),
    ).toThrow(/那条规则（pkg-a）引用了组件登记名「ghost」/);
  });

  it('组件登记名撞了：红，点名两方 —— 站点与包撞同样红（那一格站点也没有关掉它的写法）', () => {
    expect(() =>
      buildRuleTable(siteOf(undefined, []), [
        columnOf('pkg-a', {
          components: [{ id: 'shared', component: '@theme/A' }],
        }),
        columnOf('pkg-b', {
          components: [{ id: 'shared', component: '@theme/B' }],
        }),
      ]),
    ).toThrow(/组件登记名「shared」被 pkg-a 和 pkg-b 各交出一条/);

    expect(() =>
      buildRuleTable(siteOf([compOf('shared', '@theme/Site')], []), [
        columnOf('pkg-a', {
          components: [{ id: 'shared', component: '@theme/A' }],
        }),
      ]),
    ).toThrow(/被 站点配置 和 pkg-a 各交出一条/);
  });

  it('三张表混着写：站点那条压过某个包的默认规则，其余各键按键名排在后面', () => {
    const table = buildRuleTable(
      siteOf([compOf('mine', '@theme/Mine')], [ruleOf('mine', 'mine')]),
      [
        columnOf('pkg-a', {
          components: [{ id: 'a1', component: '@theme/A1' }],
          rules: [{ key: 'a-one', component: 'a1' }],
        }),
        columnOf('pkg-b', {
          components: [{ id: 'b2', component: '@theme/B2' }],
          rules: [
            { key: 'mine', component: 'b2' },
            { key: 'b-two', component: 'b2' },
          ],
        }),
      ],
    );

    expect(keysOf(table)).toEqual(['mine', 'a-one', 'b-two']);
    expect(table.entries[0]!.specifier).toBe('@theme/Mine');
    // 一个包的两条里只有一条被压掉：提示只报那一条。
    expect(table.notices).toHaveLength(1);
  });
});

/**
走一遍真的官方加载路径（`loadContext` + 插件发现），再照 core 的口径把每个插件的
`loadContent()` 结果按「插件名 → id」收进 `allContent`（core 的 `aggregateAllContent` 干的就是
这件事）。这一条存在的理由：只有它能证明「贡献方 `loadContent()` 的返回值真的出现在 `allContent`
里」—— 单元对合证不了这一格。
*/
const loadAllContent = async (siteDir: string): Promise<AllContent> => {
  const plugins =
    (await new PluginDiscovery(siteDir, {
      warn: () => {},
    }).discover()) ?? [];
  const allContent: AllContent = {};

  for (const plugin of plugins) {
    const { name, options, loadContent } = plugin as {
      name?: string;
      options?: { id?: string };
      loadContent?: () => unknown;
    };

    if (!name || !loadContent) {
      continue;
    }

    allContent[name] ??= {};
    allContent[name][options?.id ?? 'default'] = await loadContent.call(plugin);
  }

  return allContent;
};

describe('端到端：装了那个包的站点，两张表真的进了生成文件', () => {
  const REGISTRY = join('theme-component-page', 'registry.ts');
  const FRAME_REGISTRY = join('theme-component-page', 'frame-registry.ts');
  let dir = '';
  let fixture: PluginSite | undefined;
  let allContent: AllContent;

  /** 落盘点是一个空临时目录；`baseUrl` 只被那条框内路由读到。 */
  const contextOf = (generatedFilesDir: string) =>
    ({
      generatedFilesDir,
      siteConfig: { baseUrl: '/' },
    }) as unknown as LoadContext;

  /** 跑一遍 `allContentLoaded`（`actions` 这一格只用来收那条框内路由）。 */
  const writeTables = (
    content: AllContent,
    generatedFilesDir: string,
    options: ComponentPageThemeOptions,
  ): string[] => {
    const routes: string[] = [];
    const plugin = themeComponentPage(contextOf(generatedFilesDir), options);
    const hook = plugin.allContentLoaded as unknown as (args: {
      allContent: AllContent;
      actions: { addRoute: (route: { path: string }) => void };
    }) => void;

    hook({
      allContent: content,
      actions: {
        addRoute: (route) => {
          routes.push(route.path);
        },
      },
    });

    return routes;
  };

  const readGenerated = (dir: string, file: string): string =>
    readFileSync(join(dir, file), 'utf8');

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'component-page-contrib-'));
    // 真站点骨架：一个交出两张表的插件 + 一个只装不交的普通插件。
    // 夹具站点必须留在仓库树内（`helpers.mts` 的 `makePluginSite` 那段说了为什么）。
    fixture = makePluginSite('plain-theme', '.cjs').addRaw(
      'contrib-theme',
      `module.exports = () => ({
         name: 'contrib-theme',
         getThemePath: () => './theme',
         loadContent: () => ({
           componentPage: {
             components: [{ id: 'embed', component: '@theme/EmbedPage' }],
             rules: [{ key: 'embed', component: 'embed', match: 'value', render: 'iframe' }],
           },
         }),
       });`,
    );
    // 冷启动那一下要十几秒，默认 30s 在 CI 上不够；下面三条用例共用这一份。
    allContent = await loadAllContent(fixture.siteDir);
  }, 60_000);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    fixture?.cleanup();
  });

  it('没装本包的站点：贡献方照常装载、loadContent 照常求值，那张表只是没人读', () => {
    // 通道是「content 里那一格」，不靠本包去问谁装了什么。
    expect(allContent['contrib-theme']?.default).toEqual({
      componentPage: {
        components: [{ id: 'embed', component: '@theme/EmbedPage' }],
        rules: [
          {
            key: 'embed',
            component: 'embed',
            match: 'value',
            render: 'iframe',
          },
        ],
      },
    });
  });

  it('站点那条排前面，包那条接在后面：两份生成文件各收自己那一半', () => {
    const generated = join(dir, 'both');

    const routes = writeTables(allContent, generated, {
      components: [{ id: 'site/report', component: '@theme/ReportPage' }],
      rules: [{ key: 'report', component: 'site/report' }],
    });

    const registry = readGenerated(generated, REGISTRY);

    expect(registry).toContain(
      'import ComponentPage0 from "@theme/ReportPage";',
    );
    expect(registry).toContain('key: "report",');
    expect(registry).toContain('key: "embed",');
    // 框内那条规则不在文档页那一份里 `import` 渲染器（父文档不替框里下载它）。
    expect(registry).not.toContain('@theme/EmbedPage');
    expect(readGenerated(generated, FRAME_REGISTRY)).toContain(
      'import FrameComponent0 from "@theme/EmbedPage";',
    );
    expect(readGenerated(generated, FRAME_REGISTRY)).toContain(
      '{ id: "embed", Component: FrameComponent0 }',
    );
    // 那条通用框内路由与表里有没有 iframe 规则无关：一条表都不到也要注册。
    expect(routes).toEqual(['/__component-frame']);
  });

  it('站点把同一把键写了一遍：用站点的，并往告警里报一条', () => {
    const generated = join(dir, 'override');
    const { warns, logger } = warnSink();

    writeTables(allContent, generated, {
      logger,
      components: [{ id: 'site/embed', component: '@theme/SiteEmbed' }],
      rules: [{ key: 'embed', component: 'site/embed', match: 'value' }],
    });

    const registry = readGenerated(generated, REGISTRY);

    expect(registry).toContain('key: "embed",');
    expect(registry).not.toContain('@theme/EmbedPage');
    expect(warns.join('\n')).toContain(
      '键「embed」本来由 contrib-theme 交出，站点配置里也写了这一把',
    );
  });

  it('站点把那把键关掉：两份生成文件都变成合法的空表，提示照报', () => {
    const generated = join(dir, 'disabled');
    const { warns, logger } = warnSink();

    writeTables(allContent, generated, {
      logger,
      rules: [{ key: 'embed', enabled: false }],
    });

    expect(readGenerated(generated, REGISTRY)).toContain(
      'export const rules = [];',
    );
    expect(readGenerated(generated, FRAME_REGISTRY)).toContain(
      'export const components = [];',
    );
    expect(warns.join('\n')).toContain(
      '键「embed」在站点配置里被关掉了（`enabled: false`），contrib-theme 交出的那条默认规则不生效',
    );
  });
});
