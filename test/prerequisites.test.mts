import { describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import {
  assertThemePrerequisites,
  IFRAME_PLUGIN,
  RESOLVER_PLUGIN,
} from '../packages/theme-iframe/lib/prerequisites.ts';

/** 只造两份原始插件清单：检查器不读别的（`LoadContext` 本身没有 `plugins` 字段）。 */
const contextWith = (plugins: unknown[], themes: unknown[] = []): LoadContext =>
  ({
    siteConfig: { plugins, themes },
  }) as unknown as LoadContext;

const NAMESPACE = '@show-docs/docusaurus-theme-probe';

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
