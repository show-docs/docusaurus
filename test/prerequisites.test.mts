import { describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import { PLUGIN_NAME as RESOLVER_PLUGIN } from '../packages/plugin-prev-layer-resolver/src/plugin-slots.mts';
import {
  assertThemePrerequisites,
  COMPONENT_PAGE_PLUGIN,
} from '../packages/theme-component-page/src/prerequisites.mts';
import viewerTheme from '../themes/theme-viewer/src/index.mts';
import { assertViewerPrerequisites } from '../themes/theme-viewer/src/prerequisites.mts';

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
  assertViewerPrerequisites(context);

describe('assertThemePrerequisites（交规则给机制层的那几层）：缺前置插件时当场点名', () => {
  it('缺解析器：报出包名与安装方式', () => {
    expect(() =>
      assertThemePrerequisites(contextWith([COMPONENT_PAGE_PLUGIN]), {
        namespace: NAMESPACE,
      }),
    ).toThrow(new RegExp(String.raw`${NAMESPACE}[\s\S]*${RESOLVER_PLUGIN}`));
  });

  it('要求注册 component-page 而它不在：报出缺的是哪一条', () => {
    expect(() =>
      assertThemePrerequisites(contextWith([RESOLVER_PLUGIN]), {
        namespace: NAMESPACE,
        componentPage: true,
      }),
    ).toThrow(
      new RegExp(String.raw`${NAMESPACE}[\s\S]*${COMPONENT_PAGE_PLUGIN}`),
    );
  });

  it('component-page 在时放行；不要求它的层缺它也放行（默认值与显式 false 两条）', () => {
    expect(() =>
      assertThemePrerequisites(
        contextWith([RESOLVER_PLUGIN, COMPONENT_PAGE_PLUGIN]),
        { namespace: NAMESPACE, componentPage: true },
      ),
    ).not.toThrow();

    for (const componentPage of [undefined, false]) {
      expect(() =>
        assertThemePrerequisites(contextWith([RESOLVER_PLUGIN]), {
          namespace: NAMESPACE,
          componentPage,
        }),
      ).not.toThrow();
    }
  });

  it('`themes` 里声明、`[包名, 选项]` 元组、`require.resolve()` 路径都算装上了', () => {
    // 三种真实形状：`themes` 那份清单、带选项的元组、站点里 `require.resolve()` 出来的路径
    expect(() =>
      assertThemePrerequisites(
        contextWith(
          [
            [COMPONENT_PAGE_PLUGIN, { some: 'option' }],
            '/repo/node_modules/@show-docs/docusaurus-plugin-prev-layer-resolver/dist/index.mjs',
          ],
          [],
        ),
        { namespace: NAMESPACE, componentPage: true },
      ),
    ).not.toThrow();

    expect(() =>
      assertThemePrerequisites(
        contextWith([], [RESOLVER_PLUGIN, COMPONENT_PAGE_PLUGIN]),
        {
          namespace: NAMESPACE,
          componentPage: true,
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

/**
「宿主必须用 lightningcss」那一条现在住在 `theme-viewer` 自己的 `src/prerequisites.mts` 里：
它说的是 `viewerjs` 那一份样式表的形状，只有这一家用得到（机制层那条 `./prerequisites`
不再替各层摊平这件事，也就不再被这一族包依赖）。
*/
describe('theme-viewer 的安装前提：没开那个压缩器就当场点名', () => {
  const VIEWER = '@show-docs/docusaurus-theme-viewer';

  it('缺解析器时报本包的名字，装了才往下问压缩器', () => {
    expect(() =>
      assertViewerPrerequisites(
        contextWith([], [], { lightningCssMinimizer: true }),
      ),
    ).toThrow(new RegExp(String.raw`${VIEWER}[\s\S]*${RESOLVER_PLUGIN}`));
  });

  it('解析器在、lightningcss 没开：报出那一格配置', () => {
    expect(() =>
      assertViewerPrerequisites(contextWith([RESOLVER_PLUGIN])),
    ).toThrow(new RegExp(String.raw`${VIEWER}[\s\S]*lightningCssMinimizer`));
  });

  it('两条都齐时放行', () => {
    expect(() =>
      assertViewerPrerequisites(
        contextWith([RESOLVER_PLUGIN], [], { lightningCssMinimizer: true }),
      ),
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
