import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AllContent, LoadContext } from '@docusaurus/types';

import { PluginDiscovery } from '../packages/plugin-prev-layer-resolver/src/plugins.mts';
import { normalizePages } from '../packages/theme-component-page/src/config.mts';
import {
  collectContributedPages,
  mergePages,
} from '../packages/theme-component-page/src/contribute.mts';
import themeComponentPage, {
  type ComponentPageThemeOptions,
} from '../packages/theme-component-page/src/index.mts';
import { renderRegistryModule } from '../packages/theme-component-page/src/registry-module.mts';

import { makePluginSite, warnSink, type PluginSite } from './helpers.mts';

/**
## 别的主题包把条目交给本层那一格

站点自己在配置里写一列已经能用（`component-page-registry.test.mts` 钉的就是那一列）；这里钉的是
「装了那个包就自动生效」那一步：约定只有一条（`loadContent()` 交回的 content 里有
`componentPages`），合成规则四条（站点的排前面、同一把键站点覆写会留一条提示、站点写
`component: false` 就把那把键关掉、两个包抢同一把键直接红）。

读到那一格的时机是 `allContentLoaded` —— 官方的 `allContent` 把各插件的 content 汇到一起，
所以这里既有喂数据进去的单元对合，也有一条**真跑一遍官方插件加载路径**的端到端：只有后者能
证明「贡献方 `loadContent()` 的返回值真的会出现在 `allContent` 里」。
*/

/** 一条归一化好的页：与站点那一列同款，只是来源不同。 */
const pageOf = (key: string, component: string) =>
  normalizePages([{ key, component }])[0]!;

/** 站点那一列里「关掉这把键」的那一条：只有站点写得出来。 */
const offOf = (key: string) =>
  normalizePages([{ key, component: false }], { siteColumn: true })[0]!;

/** 某个插件交出的那一列（已经按同一条校验走过）。 */
const columnOf = (from: string, ...keys: [string, string][]) => ({
  from,
  pages: keys.map(([key, component]) => pageOf(key, component)),
});

describe('collectContributedPages：读 allContent 里那一格', () => {
  it('只留交出条目的插件，那一列归一化成与站点写的同一形状', () => {
    const contributed = collectContributedPages({
      'plain-theme': { default: { routes: [] } },
      '@scope/pkg': {
        default: {
          componentPages: [{ key: 'report', component: '@theme/Report' }],
        },
      },
    });

    expect(contributed).toEqual([
      { from: '@scope/pkg', pages: [pageOf('report', '@theme/Report')] },
    ]);
  });

  it('一条没交也是合法的；content 不是对象同样跳过', () => {
    expect(
      collectContributedPages({
        'empty-theme': { default: { componentPages: [] } },
      }),
    ).toEqual([{ from: 'empty-theme', pages: [] }]);

    // 没有这一格 = 这个插件不交，不看它别的键、也不看它是哪种形状。
    expect(
      collectContributedPages({
        stringy: { default: 'x' },
        nullish: { default: null },
        missing: { default: {} },
        'other-keys': { default: { routes: [], pages: [] } },
      }),
    ).toEqual([]);
  });

  it('同一个包装了两次（两个 id）：两份 content 都收，报错和提示里带上 id', () => {
    const contributed = collectContributedPages({
      pkg: {
        first: { componentPages: [{ key: 'a', component: '@theme/A' }] },
        second: { componentPages: [{ key: 'b', component: '@theme/B' }] },
      },
    });

    expect(contributed).toEqual([
      { from: 'pkg（id: first）', pages: [pageOf('a', '@theme/A')] },
      { from: 'pkg（id: second）', pages: [pageOf('b', '@theme/B')] },
    ]);
  });

  it('交出的那一列写歪了：红，点名到插件与下标', () => {
    expect(() =>
      collectContributedPages({
        '@scope/bad': { default: { componentPages: '不是数组' } },
      }),
    ).toThrow(/pages（@scope\/bad 交出的）\s*要一个数组/u);

    // 逐格也一样带上「哪个插件、第几条、哪一格」：站点看到这条才知道该去找谁。
    expect(() =>
      collectContributedPages({
        '@scope/bad': {
          default: { componentPages: [{ key: 'report' }] },
        },
      }),
    ).toThrow(/pages（@scope\/bad 交出的）\[0\]\.component/u);
  });

  it('包交出的那一列不认 `component: false`：包不能替站点决定自己不生效', () => {
    expect(() =>
      collectContributedPages({
        pkg: {
          default: {
            componentPages: [{ key: 'report', component: false }],
          },
        },
      }),
    ).toThrow(/pages（pkg 交出的）\[0\]\.component 是 false/u);
  });
});

describe('一个包交多组规则：一列条目里各管各的', () => {
  /** 一个插件交回两列不同组件，合并后铺成注册表。 */
  const twoGroups = {
    'theme-foo': {
      default: {
        componentPages: [
          { key: 'fooPage', component: '@theme/FooPage' },
          { key: 'fooError', match: 'value', component: '@theme/FooError' },
        ],
      },
    },
  } satisfies AllContent;

  it('两列不同组件的条目都进注册表，顺序就是交回的顺序', () => {
    const { pages } = mergePages([], collectContributedPages(twoGroups));
    const source = renderRegistryModule(pages);

    expect(source).toContain('import ComponentPage0 from "@theme/FooPage";');
    expect(source).toContain('import ComponentPage1 from "@theme/FooError";');
    expect(source).toContain('key: "fooError",');
  });

  it('同一包内撞键按重复报（同源不是豁免理由）', () => {
    expect(() =>
      collectContributedPages({
        'theme-foo': {
          default: {
            componentPages: [
              { key: 'fooPage', component: '@theme/A' },
              { key: 'fooPage', component: '@theme/B' },
            ],
          },
        },
      }),
    ).toThrow(
      /pages（theme-foo 交出的）\[1\]\.key「fooPage」和前面某一条撞了/u,
    );
  });

  it('站点关掉其中一把：同包另一把不受影响', () => {
    const { pages } = mergePages(
      [offOf('fooPage')],
      collectContributedPages(twoGroups),
    );

    expect(pages.map((page) => page.entry.key)).toEqual(['fooError']);
  });
});

describe('mergePages：站点那一列排前面，同一把键站点说了算', () => {
  const keysOf = (merged: { pages: Array<{ entry: { key: string } }> }) =>
    merged.pages.map((page) => page.entry.key);

  it('没有包交出条目：站点那一列原样，不留提示', () => {
    const merged = mergePages([pageOf('a', '@theme/A')], []);

    expect(keysOf(merged)).toEqual(['a']);
    expect(merged.notices).toEqual([]);
  });

  it('两列各写各的键：站点的在前，包的接在后面', () => {
    const merged = mergePages(
      [pageOf('site-key', '@theme/Site')],
      [columnOf('pkg-a', ['pkg-key', '@theme/Pkg'])],
    );

    expect(keysOf(merged)).toEqual(['site-key', 'pkg-key']);
    expect(merged.notices).toEqual([]);
  });

  it('同一把键站点也写过：用站点那一条，并留一条点名那个包的提示', () => {
    const merged = mergePages(
      [pageOf('report', '@theme/SiteReport')],
      [columnOf('pkg-a', ['report', '@theme/PkgReport'])],
    );

    expect(keysOf(merged)).toEqual(['report']);
    // 生成模块里那条 import 必须是站点写的那个说明符：覆写不是「两条都留着」。
    expect(merged.pages[0]!.specifier).toBe('@theme/SiteReport');
    expect(merged.notices).toEqual([
      'theme-component-page：键「report」本来由 pkg-a 交出，站点配置里也写了这一把，用站点那一条。',
    ]);
  });

  it('两个包抢同一把键：红，把抢的两边都点出来', () => {
    // 这里没有合理的默认答案：让其中一个悄悄赢，另一族的键在它自己那侧照样命中、
    // 页面却归了这个包 —— 那种结果没人能从产物里看出来。
    expect(() =>
      mergePages(
        [],
        [
          columnOf('pkg-a', ['report', '@theme/A']),
          columnOf('pkg-b', ['report', '@theme/B']),
        ],
      ),
    ).toThrow(/键「report」被 pkg-a 和 pkg-b 各交出一条/u);
  });

  it('三条包列里只有抢键那一条红：其余照常接上', () => {
    const merged = mergePages(
      [pageOf('mine', '@theme/Mine')],
      [
        columnOf('pkg-a', ['a1', '@theme/A1']),
        columnOf('pkg-b', ['mine', '@theme/B'], ['b2', '@theme/B2']),
      ],
    );

    expect(keysOf(merged)).toEqual(['mine', 'a1', 'b2']);
    expect(merged.notices).toHaveLength(1);
  });
});

describe('mergePages：站点把一把键关掉（component: false）', () => {
  const keysOf = (merged: { pages: Array<{ entry: { key: string } }> }) =>
    merged.pages.map((page) => page.entry.key);

  it('包交出的那一条不生效，留一条点名那个包的提示', () => {
    const merged = mergePages(
      [offOf('embed')],
      [columnOf('pkg-a', ['embed', '@theme/Embed'], ['keep', '@theme/Keep'])],
    );

    expect(keysOf(merged)).toEqual(['keep']);
    expect(merged.notices).toEqual([
      'theme-component-page：键「embed」在站点配置里被关掉了（`component: false`），pkg-a 交出的那一条不生效。',
    ]);
  });

  it('关掉记号自己不进生成模块：交得出的每一格都有真说明符', () => {
    const merged = mergePages([offOf('embed'), pageOf('a', '@theme/A')], []);

    expect(keysOf(merged)).toEqual(['a']);
    expect(
      merged.pages.every((page) => typeof page.specifier === 'string'),
    ).toBe(true);
    expect(merged.notices).toEqual([]);
  });

  it('两个包抢的那把键正好被站点关掉：不红 —— 两边都不生效，抢赢抢输没有后果', () => {
    const merged = mergePages(
      [offOf('report')],
      [
        columnOf('pkg-a', ['report', '@theme/A']),
        columnOf('pkg-b', ['report', '@theme/B']),
      ],
    );

    expect(keysOf(merged)).toEqual([]);
    expect(merged.notices).toHaveLength(2);
  });

  it('关掉只影响那一把键：其余各包条目照常', () => {
    const merged = mergePages(
      [offOf('embed'), pageOf('site', '@theme/Site')],
      [columnOf('pkg-a', ['pkg', '@theme/Pkg'])],
    );

    expect(keysOf(merged)).toEqual(['site', 'pkg']);
  });
});

/**
走一遍真的官方加载路径（`loadContext` + `loadPluginConfigs`），再照 core 的口径把每个插件的
`loadContent()` 结果按「插件名 → id」收进 `allContent`（`aggregateAllContent` 干的就是这件事）。
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

describe('端到端：装了那个包的站点，条目真的进了生成文件', () => {
  const REGISTRY = join('theme-component-page', 'registry.ts');
  let dir = '';
  let fixture: PluginSite | undefined;
  let allContent: AllContent;

  /** 落盘点是一个空临时目录：`allContentLoaded` 只读 `generatedFilesDir`。 */
  const contextOf = (generatedFilesDir: string) =>
    ({ generatedFilesDir }) as unknown as LoadContext;

  /** 跑一遍 `allContentLoaded`（`actions` 这一格本层不读）。 */
  const writeRegistry = (
    allContent: AllContent,
    generatedFilesDir: string,
    options: ComponentPageThemeOptions,
  ): void => {
    const plugin = themeComponentPage(contextOf(generatedFilesDir), options);
    const hook = plugin.allContentLoaded as unknown as (args: {
      allContent: AllContent;
      actions: unknown;
    }) => void;

    hook({ allContent, actions: {} });
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'component-page-contrib-'));
    // 真站点骨架：一个交出条目的主题包 + 一个只装不交的普通主题包。
    // 夹具站点必须留在仓库树内（`helpers.mts` 的 `makePluginSite` 那段说了为什么）。
    fixture = makePluginSite('plain-theme', '.cjs').addRaw(
      'contrib-theme',
      `module.exports = () => ({
         name: 'contrib-theme',
         getThemePath: () => './theme',
         loadContent: () => ({ componentPages: [{ key: 'embed', component: '@theme/EmbedPage' }] }),
       });`,
    );
    // 冷启动那一下要十几秒，默认 30s 在 CI 上不够；三条用例共用这一份。
    allContent = await loadAllContent(fixture.siteDir);
  }, 60_000);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    fixture?.cleanup();
  });

  it('没装本包的站点：贡献方照常装载、loadContent 照常求值，规则只是没人读', () => {
    // 夹具站点的配置里没有 component-page：通道是「content 里那一格」，不靠本包去问。
    expect(allContent['contrib-theme']?.default).toEqual({
      componentPages: [{ key: 'embed', component: '@theme/EmbedPage' }],
    });
  });

  it('贡献方交出的那条排在站点那条后面，两条一起铺进生成模块', () => {
    const generated = join(dir, 'both');

    writeRegistry(allContent, generated, {
      pages: [{ key: 'report', component: '@theme/ReportPage' }],
    });

    const source = readFileSync(join(generated, REGISTRY), 'utf8');

    // 顺序 = 命中优先级：站点写的那条先判。
    expect(source).toContain('import ComponentPage0 from "@theme/ReportPage";');
    expect(source).toContain('import ComponentPage1 from "@theme/EmbedPage";');
    expect(source).toContain('key: "embed",');
  });

  it('站点把同一把键写了一遍：用站点的，并往告警里报一条', () => {
    const generated = join(dir, 'override');
    const { warns, logger } = warnSink();

    writeRegistry(allContent, generated, {
      logger,
      pages: [{ key: 'embed', component: '@theme/SiteEmbed' }],
    });

    const source = readFileSync(join(generated, REGISTRY), 'utf8');

    expect(source).toContain('import ComponentPage0 from "@theme/SiteEmbed";');
    expect(source).not.toContain('@theme/EmbedPage');
    expect(warns.join('\n')).toContain(
      '键「embed」本来由 contrib-theme 交出，站点配置里也写了这一把',
    );
  });
});
