import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import { PLUGIN_NAME } from '../packages/plugin-prev-layer-resolver/src/plugin-slots.mts';
import {
  assertPrevLayerResolverInstalled,
  assertSinglePluginInstance,
  pluginInstanceCount,
  pluginIsRegistered,
} from '../packages/plugin-prev-layer-resolver/src/registered-plugins.mts';

import { fakeCore, makePresetSite, presetReturning } from './helpers.mts';

/**
## 「这个包注册成插件了没有」—— 站点写在三处的清单都要认

这条判据住在解析器包（`@theme-prev/*` 由谁提供只有本包说得住），各层配置期的 `loadContent()`
读它。原始清单那一份的判法（四种写法、按包目录段认路径）在 `test/plugin-slots.test.mts`，
这里钉的是**加上 preset 之后**那一半：站点可以把必需的插件写在 preset 交回的清单里，官方合并
发生在 `loadPluginConfigs` 内部，`LoadContext` 上没有合并后的清单可读 —— 只读原始清单会把一个
装齐了的站点判死，而那句报错会让站点去 `pnpm add` 一个已经装着的包。

判错的方向不对称：**误报会判死一个本来能成的构建**，漏报只是把构建期注定会炸的那一步留到构建期。
所以「问不到官方那一份」（core 结构变了、配置文件读不了、preset 函数自己抛）一律放行，
而「官方答了、那份清单里没有」判得实 —— 两半各要一条用例才分得开。

夹具走真的 `loadContext` + 真的 `loadPresets`（见 `helpers.mts` 的 `makePresetSite`）：这里要验的
正是「官方合并后的那一份我们看得见」，把那两个官方函数替身掉就什么都没验；假 core 只用在
「上游不再导出那个函数」这一臂上。
*/

const NO_CORE_SITE = '/nonexistent-site-xyz';

/** 一份够用的 `LoadContext`：判据只读 `siteDir` / `siteConfigPath` / `siteConfig` 那三格。 */
const contextOf = (
  siteDir: string,
  { plugins = [], presets }: { plugins?: unknown[]; presets?: string[] } = {},
): LoadContext =>
  ({
    siteDir,
    siteConfigPath: path.join(siteDir, 'docusaurus.config.mjs'),
    siteConfig: { plugins, themes: [], presets },
  }) as unknown as LoadContext;

describe('pluginIsRegistered：插件写在 preset 里也算注册', () => {
  let site: ReturnType<typeof makePresetSite>;

  beforeAll(() => {
    site = makePresetSite(presetReturning([PLUGIN_NAME]));
  });
  afterAll(() => {
    site.cleanup();
  });

  it('原始清单两处都空、插件只在 preset 里 → 认它注册了', async () => {
    expect(
      await pluginIsRegistered(
        contextOf(site.siteDir, { presets: [site.preset] }),
        PLUGIN_NAME,
      ),
    ).toBe(true);
  });

  it('官方答了、但那份清单里没有 → 判缺（不能把「问到了」当成「有」）', async () => {
    expect(
      await pluginIsRegistered(
        contextOf(site.siteDir, { presets: [site.preset] }),
        '@show-docs/docusaurus-theme-component-page',
      ),
    ).toBe(false);
  });

  it('原始清单命中就够了：官方那份即便答「没有」也不翻案', async () => {
    // 站点 `plugins` 里写着本包，preset 交回的是别的：判据是「两处任一处命中」，
    // 写成「以官方那份为准」（或 `&&`）就在这里变 false —— 而站点明明注册了。
    const other = makePresetSite(presetReturning(['some-other-plugin']));
    try {
      expect(
        await pluginIsRegistered(
          contextOf(other.siteDir, {
            plugins: [PLUGIN_NAME],
            presets: [other.preset],
          }),
          PLUGIN_NAME,
        ),
      ).toBe(true);
    } finally {
      other.cleanup();
    }
  });

  it('站点没写 presets：判得实，且不去打扰官方', async () => {
    // 没有 preset 就没有别处可查 —— 少这一臂，实现会退成「问不到官方就放行」
    // （NO_CORE_SITE 给 null → true），那句点名从此不响。
    expect(await pluginIsRegistered(contextOf(NO_CORE_SITE), PLUGIN_NAME)).toBe(
      false,
    );
    expect(
      await pluginIsRegistered(
        contextOf(NO_CORE_SITE, { presets: [] }),
        PLUGIN_NAME,
      ),
    ).toBe(false);
  });
});

describe('问不到官方那一份时不拦', () => {
  it('站点解析不到 core：降级成「不知道」，放行', async () => {
    expect(
      await pluginIsRegistered(
        contextOf(NO_CORE_SITE, { presets: ['fixture-preset'] }),
        PLUGIN_NAME,
      ),
    ).toBe(true);
  });

  it('core 有 `loadContext`、但 `server/plugins/presets.js` 不再导出 `loadPresets`：同样放行', async () => {
    // 上游改打包方式 / 改文件名走到这一臂。少了 `!loadPresets` 那一半，这里会把 `loadPresets`
    // 当函数调 → TypeError 冒进构建，而不是安静降级成「不知道」。
    const site = makePresetSite(presetReturning([PLUGIN_NAME]));
    try {
      fakeCore(site.siteDir, {
        site: 'export const loadContext = async ({ siteDir }) => ({ siteDir });\n',
        configs: 'export const loadPluginConfigs = async () => [];\n',
        presets: 'exports.notLoadPresets = 1;\n',
      });
      expect(
        await pluginIsRegistered(
          contextOf(site.siteDir, { presets: [site.preset] }),
          PLUGIN_NAME,
        ),
      ).toBe(true);
    } finally {
      site.cleanup();
    }
  });

  it('preset 函数抛错：与「装没装」不相干，交给官方那一步去报', async () => {
    const site = makePresetSite(
      'module.exports = () => { throw new Error("preset boom"); };\n',
    );
    try {
      expect(
        await pluginIsRegistered(
          contextOf(site.siteDir, { presets: [site.preset] }),
          PLUGIN_NAME,
        ),
      ).toBe(true);
    } finally {
      site.cleanup();
    }
  });
});

describe('assertPrevLayerResolverInstalled：缺了才点名，报错带上调用方', () => {
  it('原始清单里没有、preset 里有 → 放行', async () => {
    const site = makePresetSite(presetReturning([PLUGIN_NAME]));
    try {
      await expect(
        assertPrevLayerResolverInstalled(
          contextOf(site.siteDir, { presets: [site.preset] }),
          '@show-docs/docusaurus-theme-probe',
        ),
      ).resolves.not.toThrow();
    } finally {
      site.cleanup();
    }
  });

  it('三处都没有 → 报错里点名调用方与本包，并说明写进 preset 也算', async () => {
    const site = makePresetSite(presetReturning(['some-other-plugin']));
    try {
      await expect(
        assertPrevLayerResolverInstalled(
          contextOf(site.siteDir, { presets: [site.preset] }),
          '@show-docs/docusaurus-theme-probe',
        ),
      ).rejects.toThrow(
        new RegExp(
          String.raw`@show-docs/docusaurus-theme-probe[\s\S]*${PLUGIN_NAME}[\s\S]*pnpm add[\s\S]*preset`,
        ),
      );
    } finally {
      site.cleanup();
    }
  });
});

/**
「注册成了几份」是另一道题：官方只拦「同一插件挂两次又不给 id」，给了不同 id 的两份在它那里合法，
而在吃不下第二份实例的那几层里，第二份只是不干活（徽标那层）或把第一份写的产物盖掉（机制层那一份）。
这两道题的误差方向是同一句：**只可能少判，不可能多判** —— 数错成「两份」会判死一个本来能成的构建，
数漏了只是那句点名不响。
*/
const LAYER_NAME = '@show-docs/docusaurus-theme-git-badge';

describe('pluginInstanceCount：包名数几份，不看实例 id', () => {
  it('原始清单里两条同名 → 2（写成 `[包名, {id}]` 那一形也一样算）', async () => {
    expect(
      await pluginInstanceCount(
        contextOf(NO_CORE_SITE, {
          plugins: [LAYER_NAME, [LAYER_NAME, { id: 'second' }]],
        }),
        LAYER_NAME,
      ),
    ).toBe(2);
  });

  it('一份、零份各判成 1 / 0：这条只回答「几份」，缺不缺归上一道题', async () => {
    expect(
      await pluginInstanceCount(
        contextOf(NO_CORE_SITE, { plugins: [LAYER_NAME] }),
        LAYER_NAME,
      ),
    ).toBe(1);
    expect(
      await pluginInstanceCount(contextOf(NO_CORE_SITE), PLUGIN_NAME),
    ).toBe(0);
  });

  it('站点没写 presets：就地收手，不去翻官方那份', async () => {
    // 夹具磁盘上那份配置文件**写着** preset（问一句就数到 1），而 `siteConfig.presets` 是空的。
    // 少这一臂，实现退成「每次都问官方」→ 这里变 1；反过来漏判一份只是点名不响，误判才会响错。
    const site = makePresetSite(presetReturning([PLUGIN_NAME]));
    try {
      expect(
        await pluginInstanceCount(
          contextOf(site.siteDir, { presets: [] }),
          PLUGIN_NAME,
        ),
      ).toBe(0);
    } finally {
      site.cleanup();
    }
  });

  it('preset 里那一份也计入：原始清单 1 条 + preset 1 条 → 2', async () => {
    const site = makePresetSite(presetReturning([PLUGIN_NAME]));
    try {
      expect(
        await pluginInstanceCount(
          contextOf(site.siteDir, {
            plugins: [PLUGIN_NAME],
            presets: [site.preset],
          }),
          PLUGIN_NAME,
        ),
      ).toBe(2);
    } finally {
      site.cleanup();
    }
  });

  it('问不到官方那一份：按原始清单那份交回，不多判也不瞎猜', async () => {
    // 这一臂的 `presets` 非空（所以要问官方）但站点解析不到 core → `+ 0`。
    // 原始清单给的是 1 条：实现写成「问不到就按两份算」或「问不到就判 0」都在这里变红。
    expect(
      await pluginInstanceCount(
        contextOf(NO_CORE_SITE, {
          plugins: [PLUGIN_NAME],
          presets: ['fixture-preset'],
        }),
        PLUGIN_NAME,
      ),
    ).toBe(1);
  });
});

describe('assertSinglePluginInstance：两份以上才点名', () => {
  it('只有一份 → 放行', async () => {
    await expect(
      assertSinglePluginInstance(
        contextOf(NO_CORE_SITE, { plugins: [LAYER_NAME] }),
        LAYER_NAME,
        '这一层只能有一份',
      ),
    ).resolves.not.toThrow();
  });

  it('一份都没有 → 也不点名：缺不缺归另一道题', async () => {
    // 这一层有没有装上由 `assertPrevLayerResolverInstalled` 那一句报，这里只判「多了」。
    // 写成 `count !== 1` 就在这一臂变红，而那句报错会让站点重复装一个本来不缺的包。
    await expect(
      assertSinglePluginInstance(
        contextOf(NO_CORE_SITE),
        LAYER_NAME,
        '这一层只能有一份',
      ),
    ).resolves.not.toThrow();
  });

  it('原始清单两份 → 报错里带份数与调用方给的那句理由', async () => {
    await expect(
      assertSinglePluginInstance(
        contextOf(NO_CORE_SITE, { plugins: [LAYER_NAME, LAYER_NAME] }),
        LAYER_NAME,
        '多棵内容根请在一份实例的 docs 数组里转述',
      ),
    ).rejects.toThrow(
      /@show-docs\/docusaurus-theme-git-badge 在本站点被注册成了 2 份实例[\s\S]*docs 数组里转述/,
    );
  });

  it('第二份藏在 preset 里 → 同样点名', async () => {
    const site = makePresetSite(presetReturning([PLUGIN_NAME]));
    try {
      await expect(
        assertSinglePluginInstance(
          contextOf(site.siteDir, {
            plugins: [PLUGIN_NAME],
            presets: [site.preset],
          }),
          PLUGIN_NAME,
          '那张表由本层一处生成',
        ),
      ).rejects.toThrow(/注册成了 2 份实例/);
    } finally {
      site.cleanup();
    }
  });
});
