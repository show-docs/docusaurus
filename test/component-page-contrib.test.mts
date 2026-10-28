import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import { normalizePages } from '../packages/theme-component-page/src/config.mts';
import {
  collectContributedPages,
  discoverContributedPages,
  isComponentPageContributor,
  mergePages,
} from '../packages/theme-component-page/src/contribute.mts';
import themeComponentPage from '../packages/theme-component-page/src/index.mts';

import { makePluginSite, warnSink, type PluginSite } from './helpers.mts';

/**
## 别的主题包把条目交给本层那一格

站点自己在配置里写一列已经能用（`component-page-registry.test.mts` 钉的就是那一列）；这里钉的是
「装了那个包就自动生效」那一步：约定只有一条（实例上挂着 `getComponentPages()`），合成规则三条
（站点的排前面、同一把键站点覆写会留一条提示、两个包抢同一把键直接红）。

问「装了哪些包」用的是解析器插件那次推导，所以这里既有用假站点的单元对合，也有一条**真跑一遍
官方插件加载路径**的端到端：只有后者能证明「实例上的自定义方法在推导那一侧原样留着」。
*/

/** 一条归一化好的页：与站点那一列同款，只是来源不同。 */
const pageOf = (key: string, component: string) =>
  normalizePages([{ key, component }])[0]!;

/** 某个包交出的那一列（已经按同一条校验走过）。 */
const columnOf = (from: string, ...keys: [string, string][]) => ({
  from,
  pages: keys.map(([key, component]) => pageOf(key, component)),
});

/**
交出条目的那个键：只喂 `getComponentPages` 的返回值。

`name` 也是 `unknown`：认不出包名那一种（没写、写成空串、写成个数字）正是这条通道要兜的，
所以得造得出来。
*/
const contributor = (
  name: unknown,
  pages: unknown,
): Record<string, unknown> => ({
  ...(name !== undefined && { name }),
  getComponentPages: () => pages,
});

describe('isComponentPageContributor：只认那一个方法', () => {
  it('挂着方法的实例算，装了但没交东西的普通插件不算', () => {
    expect(isComponentPageContributor(contributor('a', []))).toBe(true);
    expect(
      isComponentPageContributor({
        name: 'plain',
        getThemePath: () => './theme',
      }),
    ).toBe(false);
  });

  it('非对象与「那个格子不是函数」一律不算（连函数本身都不算）', () => {
    for (const value of [
      undefined,
      null,
      'theme-x',
      42,
      () => {},
      { getComponentPages: './theme' },
      { getComponentPages: null },
    ]) {
      expect(isComponentPageContributor(value), String(value)).toBe(false);
    }
  });
});

describe('collectContributedPages：交回的那一列走站点同款校验', () => {
  it('只留交出条目的实例，那一条归一化成与站点写的同一形状', () => {
    const contributed = collectContributedPages([
      { name: 'plain-theme', getThemePath: () => './theme' },
      contributor('@scope/pkg', [
        { key: 'report', component: '@theme/Report' },
      ]),
    ]);

    expect(contributed).toEqual([
      { from: '@scope/pkg', pages: [pageOf('report', '@theme/Report')] },
    ]);
  });

  it('一条没交也是合法的（那个包不参与判定）', () => {
    expect(collectContributedPages([contributor('empty-theme', [])])).toEqual([
      { from: 'empty-theme', pages: [] },
    ]);
  });

  it('包写歪的那一列，报错点名是哪个包的哪一格', () => {
    expect(() =>
      collectContributedPages([contributor('@scope/bad', '不是数组')]),
    ).toThrow(/pages（@scope\/bad 交出的）\s*要一个数组/u);

    // 逐格也一样带上「哪个包、第几条、哪一格」：站点看到这条才知道该去找谁。
    expect(() =>
      collectContributedPages([contributor('@scope/bad', [{ key: 'report' }])]),
    ).toThrow(/pages（@scope\/bad 交出的）\[0\]\.component/u);
  });

  it('认不出包名的实例也给个名字：没写 name 与写了空串都算认不出', () => {
    for (const instance of [
      contributor(undefined, 'x'),
      contributor('', 'x'),
      contributor(42, 'x'),
    ]) {
      expect(() => collectContributedPages([instance])).toThrow(
        /pages（'<没有名字的插件>' 交出的）\s*要一个数组/u,
      );
    }
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

describe('discoverContributedPages：问的是解析器插件那次推导', () => {
  it('拿不到插件列表时交回空列（整层不至于失效），告警由推导那一侧报', async () => {
    // 一个什么都不装的目录：core 都定位不到，`discover()` 交回 null。
    const { warns, logger } = warnSink();
    const contributed = await discoverContributedPages(
      join(tmpdir(), 'no-such-docs-site'),
      logger,
    );

    expect(contributed).toEqual([]);
    expect(warns.join('\n')).toContain('拿不到 Docusaurus 的 loadContext');
  });
});

describe('端到端：装了那个包的站点，条目真的进了生成文件', () => {
  const REGISTRY = join('theme-component-page', 'registry.ts');
  let dir = '';
  let fixture: PluginSite | undefined;

  /** `siteDir` 指夹具站点（问得出谁交出了条目），落盘点仍是一个空临时目录。 */
  const contextOf = (fixtureSiteDir: string, generatedFilesDir: string) =>
    ({
      siteDir: fixtureSiteDir,
      generatedFilesDir,
    }) as unknown as LoadContext;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'component-page-contrib-'));
    // 真站点骨架：一个交出条目的主题包 + 一个只装不交的普通主题包。
    // 夹具站点必须留在仓库树内（`helpers.mts` 的 `makePluginSite` 那段说了为什么）。
    fixture = makePluginSite('plain-theme', '.cjs').addRaw(
      'contrib-theme',
      `module.exports = () => ({
         name: 'contrib-theme',
         getThemePath: () => './theme',
         getComponentPages: () => [{ key: 'embed', component: '@theme/EmbedPage' }],
       });`,
    );
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    fixture?.cleanup();
  });

  it('包交出的那条排在站点那条后面，两条一起铺进生成模块', async () => {
    // 这两条走的是真 `loadContext` + `loadPluginConfigs`（与 `discover.test.mts` 同款），
    // 冷启动那一下要十几秒，默认 30s 在 CI 上不够。
    const generated = join(dir, 'both');
    const plugin = themeComponentPage(contextOf(fixture!.siteDir, generated), {
      pages: [{ key: 'report', component: '@theme/ReportPage' }],
    });

    await (plugin.contentLoaded as () => Promise<void>)();

    const source = readFileSync(join(generated, REGISTRY), 'utf8');

    // 顺序 = 命中优先级：站点写的那条先判。
    expect(source).toContain('import ComponentPage0 from "@theme/ReportPage";');
    expect(source).toContain('import ComponentPage1 from "@theme/EmbedPage";');
    expect(source).toContain('key: "embed",');
  }, 60_000);

  it('站点把同一把键写了一遍：用站点的，并往告警里报一条', async () => {
    const generated = join(dir, 'override');
    const { warns, logger } = warnSink();
    const plugin = themeComponentPage(contextOf(fixture!.siteDir, generated), {
      logger,
      pages: [{ key: 'embed', component: '@theme/SiteEmbed' }],
    });

    await (plugin.contentLoaded as () => Promise<void>)();

    const source = readFileSync(join(generated, REGISTRY), 'utf8');

    expect(source).toContain('import ComponentPage0 from "@theme/SiteEmbed";');
    expect(source).not.toContain('@theme/EmbedPage');
    expect(warns.join('\n')).toContain(
      '键「embed」本来由 contrib-theme 交出，站点配置里也写了这一把',
    );
  }, 60_000);
});
