import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import {
  assertThemePrerequisites,
  COMPONENT_PAGE_PLUGIN,
} from '../packages/theme-component-page/src/prerequisites.mts';
import viewerTheme from '../themes/theme-viewer/src/index.mts';
import { assertViewerPrerequisites } from '../themes/theme-viewer/src/prerequisites.mts';

import { makePresetSite, presetReturning } from './helpers.mts';

/**
## 各层 `loadContent()` 里那一条安装前提

这里从**调用方**那一侧钉检查器：缺什么、报错里点谁的名、什么时候放行。判清单本身的形状
（四种写法、按包目录段认路径）在 `test/plugin-slots.test.mts`，「插件写在 preset 里也算装上」
那条的判据与夹具在 `test/registered-plugins.test.mts`。

机制层那一条交回 `Promise`（「preset 里那一份要等官方合并完才看得见」），所以这一族断言一律
`await`；`theme-viewer` 那一条只看站点自己写下的 `future`，是同步的。各层入口有没有真的 `await`
机制层那一句，由 `test/package-entries.test.mts` 从入口那一侧钉：漏掉那一跳，这句检查就变成一条
没人接的 rejection，构建照绿。
*/

/** 只造两份原始插件清单与 `future.faster`：检查器不读别的（`LoadContext` 本身没有 `plugins` 字段）。 */
const contextWith = (
  plugins: unknown[],
  themes: unknown[] = [],
  faster: Record<string, boolean> = {},
): LoadContext =>
  ({
    siteConfig: { plugins, themes, future: { faster } },
  }) as unknown as LoadContext;

const NAMESPACE = '@show-docs/docusaurus-theme-probe';

/**
只造 `future` 那一整格：老站点的 `experimental_faster`、以及两处都没写的形状，
都不在 `contextWith` 那个 `faster` 参数能表达的范围内。
*/
const contextWithFuture = (future: unknown): LoadContext =>
  ({
    siteConfig: { plugins: [], themes: [], future },
  }) as unknown as LoadContext;

describe('assertThemePrerequisites（交规则给机制层的那几层）：缺前置插件时当场点名', () => {
  it('要求注册 component-page 而它不在：报出包名与安装方式', async () => {
    await expect(
      assertThemePrerequisites(contextWith([]), NAMESPACE),
    ).rejects.toThrow(
      new RegExp(String.raw`${NAMESPACE}[\s\S]*${COMPONENT_PAGE_PLUGIN}`),
    );
  });

  it('它装在 `plugins` / `themes`、写成 `[包名, 选项]` 元组、或写成 `require.resolve()` 出来的路径都算装上', async () => {
    // 三种真实形状：带选项的元组、`require.resolve()` 出来的路径、`themes` 那份清单
    await expect(
      assertThemePrerequisites(
        contextWith([
          [COMPONENT_PAGE_PLUGIN, { some: 'option' }],
          '/repo/node_modules/@show-docs/docusaurus-theme-component-page/dist/index.mjs',
        ]),
        NAMESPACE,
      ),
    ).resolves.not.toThrow();

    await expect(
      assertThemePrerequisites(
        contextWith([], [COMPONENT_PAGE_PLUGIN]),
        NAMESPACE,
      ),
    ).resolves.not.toThrow();
  });

  it('认不出的槽位（函数、空对象、非字符串元组头）直接略过，不算装上', async () => {
    await expect(
      assertThemePrerequisites(
        contextWith([() => undefined, {}, { name: undefined }, [42, {}]]),
        NAMESPACE,
      ),
    ).rejects.toThrow(new RegExp(COMPONENT_PAGE_PLUGIN));
  });

  it('只写在 preset 里时也算装上', async () => {
    // 只看 `siteConfig.plugins` / `themes` 会把这一类站点判死：它注册了，
    // 只是那一份清单要官方合并之后才看得见（合并前 `LoadContext` 上没有）。
    const site = makePresetSite(presetReturning([COMPONENT_PAGE_PLUGIN]));
    try {
      await expect(
        assertThemePrerequisites(
          {
            siteDir: site.siteDir,
            siteConfigPath: path.join(site.siteDir, 'docusaurus.config.mjs'),
            siteConfig: {
              plugins: [],
              themes: [],
              presets: [site.preset],
              future: { faster: {} },
            },
          } as unknown as LoadContext,
          NAMESPACE,
        ),
      ).resolves.not.toThrow();
    } finally {
      site.cleanup();
    }
  });
});

/**
「宿主必须用 lightningcss」那一条住在 `theme-viewer` 自己的 `src/prerequisites.mts` 里：
它说的是 `viewerjs` 那一份样式表的形状，只有这一家用得到（机制层那条 `./prerequisites`
不再替各层摊平这件事，也就不再被这一族包依赖）。
*/
describe('theme-viewer 的安装前提：没开那个压缩器就当场点名', () => {
  const VIEWER = '@show-docs/docusaurus-theme-viewer';

  it('没开时报出本包的名字与那一格配置', () => {
    expect(() => assertViewerPrerequisites(contextWith([]))).toThrow(
      new RegExp(String.raw`${VIEWER}[\s\S]*lightningCssMinimizer`),
    );
  });

  it('开了就放行', () => {
    expect(() =>
      assertViewerPrerequisites(
        contextWith([], [], { lightningCssMinimizer: true }),
      ),
    ).not.toThrow();
  });

  it('老写法 `future.experimental_faster` 也认：开了就放行，没开照样报', () => {
    // 改名前的 Docusaurus 只补全 `experimental_faster`，`faster` 那一格整个缺席；
    // 只读 `faster` 会把这类站点误判成「没开压缩器」。
    expect(() =>
      assertViewerPrerequisites(
        contextWithFuture({ experimental_faster: true }),
      ),
    ).not.toThrow();

    expect(() =>
      assertViewerPrerequisites(
        contextWithFuture({
          experimental_faster: { lightningCssMinimizer: true },
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertViewerPrerequisites(
        contextWithFuture({
          experimental_faster: { lightningCssMinimizer: false },
        }),
      ),
    ).toThrow(/lightningCssMinimizer/);
  });

  it('两处都没写时报错；`faster` 在场时它赢（老写法只是缺席时的兜底）', () => {
    expect(() => assertViewerPrerequisites(contextWithFuture({}))).toThrow(
      /lightningCssMinimizer/,
    );

    expect(() =>
      assertViewerPrerequisites(
        contextWithFuture({
          faster: true,
          experimental_faster: { lightningCssMinimizer: false },
        }),
      ),
    ).not.toThrow();
  });
});

describe('theme-viewer 入口：那一条安装前提接进 loadContent', () => {
  const load = (faster: Record<string, boolean>) => {
    const plugin = viewerTheme(contextWith([], [], faster));
    return () => (plugin.loadContent as () => void)();
  };

  it('站点没开 lightningcss 就报错，开了才放行', () => {
    // 光有用例钉住 helper 不够：入口漏传这一格，检查器形同虚设，构建照样绿。
    expect(load({})).toThrow(/lightningCssMinimizer/);
    expect(load({ lightningCssMinimizer: true })).not.toThrow();
  });
});
