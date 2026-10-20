import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { createApiFrameTheme } from '../theme/theme-iframe/lib/api-frame-theme.mts';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/** 各包入口产物在 `dist/`、`src/` 与它是兄弟，所以拿源码路径喂工厂，`../theme` 正落在各包的 `theme/`。 */
const entryUrlOf = (pkg: string): string =>
  pathToFileURL(path.resolve(repoRoot, `theme/theme-${pkg}/src/index.mts`))
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
        path.resolve(repoRoot, `theme/theme-${pkg}/theme`),
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
      path.resolve(repoRoot, 'theme/theme-ghost/src/index.mts'),
    ).href;
    expect(() =>
      createApiFrameTheme(contextWithBase('/'), {
        namespace: '@show-docs/docusaurus-theme-scalar',
        selfEntryUrl: bogus,
      }),
    ).toThrow(/主题层目录不存在/);
  });

  it('configureWebpack 传了才接进 Plugin 形状（Scalar 那种没差异的不带这一格）', () => {
    const without = make('scalar');
    expect(without.configureWebpack).toBeUndefined();
    const withWebpack = createApiFrameTheme(contextWithBase('/'), {
      namespace: '@show-docs/docusaurus-theme-redoc',
      selfEntryUrl: entryUrlOf('redoc'),
      configureWebpack: () => ({ ignoreWarnings: [/x/] }) as never,
    });
    expect(typeof withWebpack.configureWebpack).toBe('function');
  });
});
