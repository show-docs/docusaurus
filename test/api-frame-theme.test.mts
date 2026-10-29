import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { PLUGIN_NAME as RESOLVER_PLUGIN } from '../packages/plugin-prev-layer-resolver/src/plugin-slots.mts';
import { createApiFrameTheme } from '../packages/theme-iframe/lib/api-frame-theme.mts';
import { IFRAME_PLUGIN } from '../packages/theme-iframe/lib/prerequisites.ts';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/** 各包入口产物在 `dist/`、`src/` 与它是兄弟，所以拿源码路径喂工厂，`../theme` 正落在各包的 `theme/`。 */
const entryUrlOf = (pkg: string): string =>
  pathToFileURL(path.resolve(repoRoot, `packages/theme-${pkg}/src/index.mts`))
    .href;

const contextWithBase = (baseUrl: string): LoadContext =>
  ({ siteConfig: { baseUrl } }) as unknown as LoadContext;

/** 跑 `contentLoaded`，收回 `addRoute` 收到的路由。工厂里 `contentLoaded` 只用到 `actions.addRoute`。 */
function routesOf(
  plugin: Plugin,
): Array<{ path: string; component: string; exact?: boolean }> {
  const added: Array<{ path: string; component: string; exact?: boolean }> = [];
  const contentLoaded = plugin.contentLoaded as unknown as (arg: {
    actions: {
      addRoute: (r: {
        path: string;
        component: string;
        exact?: boolean;
      }) => void;
    };
  }) => void;
  contentLoaded({
    actions: {
      addRoute: (route) => {
        added.push(route);
      },
    },
  });
  return added;
}

describe('createApiFrameTheme：三条 API 层共用的配置期工厂', () => {
  const make = (pkg: 'redoc' | 'scalar' | 'stoplight', baseUrl = '/') =>
    createApiFrameTheme(contextWithBase(baseUrl), {
      namespace: `@show-docs/docusaurus-theme-${pkg}`,
      selfEntryUrl: entryUrlOf(pkg),
    });

  it('拿注册表那条 internal 条目挂上各包真实的层目录', () => {
    for (const pkg of ['redoc', 'scalar', 'stoplight'] as const) {
      const plugin = make(pkg);
      const themePath = (plugin.getThemePath as () => string)();
      expect(path.resolve(themePath)).toBe(
        path.resolve(repoRoot, `packages/theme-${pkg}/theme`),
      );
    }
  });

  it('contentLoaded 注册那条框内页面：路由名取自注册表、baseUrl 收尾斜杠归一', () => {
    const routes = [
      ['scalar', 'scalar-view'],
      ['redoc', 'redoc-view'],
      ['stoplight', 'stoplight-view'],
    ] as const satisfies ReadonlyArray<
      ['redoc' | 'scalar' | 'stoplight', string]
    >;
    for (const [pkg, route] of routes) {
      const added = routesOf(make(pkg, '/docs-site/'));
      expect(added).toHaveLength(1);
      expect(added[0]!.path).toBe(`/docs-site/${route}`);
      expect(added[0]!.exact).toBe(true);
      expect(added[0]!.component).toMatch(/^@theme\//);
    }
  });

  it('baseUrl 结尾没有斜杠时也不双拼', () => {
    expect(routesOf(make('scalar', '/base'))[0]!.path).toBe(
      '/base/scalar-view',
    );
  });

  it('注册表里没有的命名空间直接抛，不带一条没人注册的路由继续跑', () => {
    expect(() =>
      createApiFrameTheme(contextWithBase('/'), {
        namespace: '@show-docs/docusaurus-theme-nope',
        selfEntryUrl: entryUrlOf('scalar'),
      }),
    ).toThrow(/注册表里没有/);
  });

  it('命名空间指向 external 那条（iframe:）也抛：工厂只接 internal 层', () => {
    expect(() =>
      createApiFrameTheme(contextWithBase('/'), {
        namespace: '@show-docs/docusaurus-theme-iframe',
        selfEntryUrl: entryUrlOf('scalar'),
      }),
    ).toThrow(/注册表里没有 internal 层/);
  });

  it('层目录算出来不存在时当场抛，且报出实际解析到的路径', () => {
    // 指向一个不存在的包目录：../theme 落空，报错点名解析到的那格而不是留个悬空别名
    const bogus = pathToFileURL(
      path.resolve(repoRoot, 'packages/theme-ghost/src/index.mts'),
    ).href;
    expect(() =>
      createApiFrameTheme(contextWithBase('/'), {
        namespace: '@show-docs/docusaurus-theme-scalar',
        selfEntryUrl: bogus,
      }),
    ).toThrow(/主题层目录不存在/);
  });

  /** `configureWebpack` 在测试里只碰 `getJSLoader`；loader 给个哨兵，方便断言它按 isServer 取。 */
  const utilsWith = (isServer: boolean) =>
    ({
      getJSLoader: () => ({ loader: `js-loader:${isServer}` }),
    }) as never;

  type RulesConfig = {
    ignoreWarnings?: unknown[];
    module?: {
      rules?: Array<{
        test: RegExp;
        use: unknown[];
        include?: (file: string) => boolean;
      }>;
    };
  };

  const webpackResultOf = (plugin: Plugin, isServer = false): RulesConfig =>
    plugin.configureWebpack!(
      {} as never,
      isServer,
      utilsWith(isServer),
      {} as never,
    ) as RulesConfig;

  /**
  工厂**不再**补那条 TS 源码规则：那份未编译的 `.ts` / `.tsx` 由
  `@show-docs/docusaurus-plugin-prev-layer-resolver` 统一认领（按 `@show-docs` 这个 scope），
  判据与用例在那边（`test/source-js-rule.test.mts`）。这里只钉「工厂不自己再补一份」。
  */
  it('工厂不再补 TS 源码规则：那一格归解析器插件', () => {
    for (const pkg of ['redoc', 'scalar', 'stoplight'] as const) {
      const result = webpackResultOf(make(pkg));
      expect(
        result.module?.rules ?? [],
        `${pkg} 的工厂又自己补了一条规则：这条判据只该在解析器插件里有一份`,
      ).toEqual([]);
    }
  });

  it('调用方自己的 configureWebpack 结果原样透传', () => {
    const callerRule = { test: /\.md$/, loader: 'caller-loader' };
    const plugin = createApiFrameTheme(contextWithBase('/'), {
      namespace: '@show-docs/docusaurus-theme-redoc',
      selfEntryUrl: entryUrlOf('redoc'),
      configureWebpack: () =>
        ({ ignoreWarnings: [/x/], module: { rules: [callerRule] } }) as never,
    });

    const result = webpackResultOf(plugin, true);
    expect(result.ignoreWarnings).toEqual([/x/]);
    expect(result.module?.rules).toEqual([callerRule]);
  });

  it('调用方返回 undefined 时也不补任何规则', () => {
    const plugin = createApiFrameTheme(contextWithBase('/'), {
      namespace: '@show-docs/docusaurus-theme-scalar',
      selfEntryUrl: entryUrlOf('scalar'),
      configureWebpack: () => undefined,
    });

    expect(webpackResultOf(plugin).module?.rules ?? []).toEqual([]);
  });

  it('loadContent 检查前置插件：缺解析器当场点名，装齐则放行', () => {
    const contextWith = (plugins: unknown[]): LoadContext =>
      ({
        siteConfig: { baseUrl: '/', plugins, themes: [] },
      }) as unknown as LoadContext;

    const missing = createApiFrameTheme(contextWith([IFRAME_PLUGIN]), {
      namespace: '@show-docs/docusaurus-theme-redoc',
      selfEntryUrl: entryUrlOf('redoc'),
    });
    expect(() => (missing.loadContent as () => void)()).toThrow(
      new RegExp(RESOLVER_PLUGIN),
    );

    const complete = createApiFrameTheme(
      contextWith([RESOLVER_PLUGIN, IFRAME_PLUGIN]),
      {
        namespace: '@show-docs/docusaurus-theme-redoc',
        selfEntryUrl: entryUrlOf('redoc'),
      },
    );
    expect(() => (complete.loadContent as () => void)()).not.toThrow();
  });
});
