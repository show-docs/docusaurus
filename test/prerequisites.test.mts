import { describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import {
  assertThemePrerequisites,
  IFRAME_PLUGIN,
  RESOLVER_PLUGIN,
} from '../packages/theme-iframe/lib/prerequisites.ts';
import viewerTheme from '../packages/theme-viewer/src/index.mts';

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
    siteConfig: { plugins: [RESOLVER_PLUGIN], themes: [], future },
  }) as unknown as LoadContext;

const requiresLightningCss = (context: LoadContext) => () =>
  assertThemePrerequisites(context, {
    namespace: NAMESPACE,
    lightningCssMinimizer: true,
  });

describe('assertThemePrerequisites：缺前置插件时当场点名', () => {
  it('解析器与 theme-iframe 都在时放行', () => {
    expect(() =>
      assertThemePrerequisites(contextWith([RESOLVER_PLUGIN, IFRAME_PLUGIN]), {
        namespace: NAMESPACE,
        iframe: true,
      }),
    ).not.toThrow();
  });

  it('缺解析器：报出包名与安装方式', () => {
    expect(() =>
      assertThemePrerequisites(contextWith([IFRAME_PLUGIN]), {
        namespace: NAMESPACE,
      }),
    ).toThrow(new RegExp(String.raw`${NAMESPACE}[\s\S]*${RESOLVER_PLUGIN}`));
  });

  it('要求注册 theme-iframe 而它不在：报出缺的是哪一条', () => {
    expect(() =>
      assertThemePrerequisites(contextWith([RESOLVER_PLUGIN]), {
        namespace: NAMESPACE,
        iframe: true,
      }),
    ).toThrow(new RegExp(String.raw`${NAMESPACE}[\s\S]*${IFRAME_PLUGIN}`));
  });

  it('不要求注册 theme-iframe 的层：它不在也放行（默认值与显式 false 两条）', () => {
    for (const iframe of [undefined, false]) {
      expect(() =>
        assertThemePrerequisites(contextWith([RESOLVER_PLUGIN]), {
          namespace: NAMESPACE,
          iframe,
        }),
      ).not.toThrow();
    }
  });

  it('要求 lightningcss 而站点没开：报出包名与那一格配置', () => {
    expect(() =>
      assertThemePrerequisites(contextWith([RESOLVER_PLUGIN]), {
        namespace: NAMESPACE,
        lightningCssMinimizer: true,
      }),
    ).toThrow(new RegExp(String.raw`${NAMESPACE}[\s\S]*lightningCssMinimizer`));
  });

  it('lightningcss 已开、或这一项没被要求时放行', () => {
    expect(() =>
      assertThemePrerequisites(
        contextWith([RESOLVER_PLUGIN], [], { lightningCssMinimizer: true }),
        { namespace: NAMESPACE, lightningCssMinimizer: true },
      ),
    ).not.toThrow();

    expect(() =>
      assertThemePrerequisites(contextWith([RESOLVER_PLUGIN]), {
        namespace: NAMESPACE,
      }),
    ).not.toThrow();
  });

  it('老写法 `future.experimental_faster` 也认：开了就放行，没开照样报', () => {
    // 改名前的 Docusaurus 只补全 `experimental_faster`，`faster` 那一格整个缺席；
    // 只读 `faster` 会把这类站点误判成「没开压缩器」。
    expect(
      requiresLightningCss(contextWithFuture({ experimental_faster: true })),
    ).not.toThrow();

    expect(
      requiresLightningCss(
        contextWithFuture({
          experimental_faster: { lightningCssMinimizer: true },
        }),
      ),
    ).not.toThrow();

    expect(
      requiresLightningCss(
        contextWithFuture({
          experimental_faster: { lightningCssMinimizer: false },
        }),
      ),
    ).toThrow(/lightningCssMinimizer/);
  });

  it('两处都没写时报错；`faster` 在场时它赢（老写法只是缺席时的兜底）', () => {
    expect(requiresLightningCss(contextWithFuture({}))).toThrow(
      /lightningCssMinimizer/,
    );

    expect(
      requiresLightningCss(
        contextWithFuture({
          faster: true,
          experimental_faster: { lightningCssMinimizer: false },
        }),
      ),
    ).not.toThrow();
  });

  it('`themes` 里声明、`[包名, 选项]` 元组、`require.resolve()` 路径都算装上了', () => {
    // 三种真实形状：`themes` 那份清单、带选项的元组、站点里 `require.resolve()` 出来的路径
    expect(() =>
      assertThemePrerequisites(
        contextWith(
          [
            [IFRAME_PLUGIN, { some: 'option' }],
            '/repo/node_modules/@show-docs/docusaurus-plugin-prev-layer-resolver/dist/index.mjs',
          ],
          [],
        ),
        { namespace: NAMESPACE, iframe: true },
      ),
    ).not.toThrow();

    expect(() =>
      assertThemePrerequisites(
        contextWith([], [RESOLVER_PLUGIN, IFRAME_PLUGIN]),
        {
          namespace: NAMESPACE,
          iframe: true,
        },
      ),
    ).not.toThrow();
  });

  it('认不出的槽位（函数、空对象、非字符串元组头）直接略过，不算装上', () => {
    expect(() =>
      assertThemePrerequisites(
        contextWith([() => undefined, {}, { name: undefined }, [42, {}]]),
        { namespace: NAMESPACE },
      ),
    ).toThrow(new RegExp(RESOLVER_PLUGIN));
  });
});

describe('theme-viewer 入口：把「宿主必须用 lightningcss」接进 loadContent', () => {
  const load = (faster: Record<string, boolean>) => {
    const plugin = viewerTheme(contextWith([RESOLVER_PLUGIN], [], faster));
    return () => (plugin.loadContent as () => void)();
  };

  it('站点没开 lightningcss 就报错，开了才放行', () => {
    // 光有用例钉住 helper 不够：入口漏传这一格，检查器形同虚设，构建照样绿。
    expect(load({})).toThrow(/lightningCssMinimizer/);
    expect(load({ lightningCssMinimizer: true })).not.toThrow();
  });
});
