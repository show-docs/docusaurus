import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { LoadContext, Plugin } from '@docusaurus/types';

import lazyCompilationPlugin from '../packages/plugin-lazy-compilation/src/index.mts';
import copyButtonTheme from '../packages/theme-copy-button/src/index.mts';
import diffTheme from '../packages/theme-diff/src/index.mts';
import erdTheme from '../packages/theme-erd/src/index.mts';
import {
  IFRAME_PLUGIN,
  RESOLVER_PLUGIN,
} from '../packages/theme-iframe/lib/prerequisites.ts';
import iframeTheme from '../packages/theme-iframe/src/index.mts';
import markmapTheme from '../packages/theme-markmap/src/index.mts';
import redocTheme from '../packages/theme-redoc/src/index.mts';
import scalarTheme from '../packages/theme-scalar/src/index.mts';
import stoplightTheme from '../packages/theme-stoplight/src/index.mts';
import viewerTheme from '../packages/theme-viewer/src/index.mts';

/**
## 每个包入口在配置期交出的那几格

入口（每个包 `src/` 下那一份 `index.mts`）是 Docusaurus 唯一看得见的那一面：层目录、客户端模块、
webpack 那几格、以及「缺前置插件时当场点名」。这一面全是**配置期**代码，跑在 Node 里 ——
`pnpm build` 全绿只说明它没把构建搞崩，证明不了它交出去的东西是对的：层目录指错一层、
样式表路径写错、loader 写成了源码名（`.mts`）而不是产物名（`.mjs`），构建照样绿，
坏的是产物里的那一格。

所以这里逐个包钉住它交出的形状。浏览器那半边（`components/` 与 `theme/` 里的组件）不在这一面里，
由 e2e 钉 —— 理由与分工记在 `test/README.md`。
*/

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/** 包在仓库里的那份目录。 */
const pkgDir = (name: string): string =>
  path.resolve(repoRoot, 'packages', name);

/**
一份够用的站点上下文：前置检查只读 `siteConfig.plugins` / `themes` / `future`，
入口工厂只读 `siteConfig.baseUrl`。其余一概不需要。
*/
const contextWith = (
  plugins: unknown[] = [RESOLVER_PLUGIN, IFRAME_PLUGIN],
): LoadContext =>
  ({
    siteConfig: {
      baseUrl: '/',
      plugins,
      themes: [],
      future: { faster: { lightningCssMinimizer: true } },
    },
  }) as unknown as LoadContext;

/**
webpack 的 `utils`：本仓这几条入口只用到 `getJSLoader`（erd）与
`utils.currentBundler.instance.ProvidePlugin`（stoplight 补 `process`）。
*/
class FakeProvidePlugin {
  readonly definitions: Record<string, string>;

  constructor(definitions: Record<string, string>) {
    this.definitions = definitions;
  }
}

const utilsWith = (isServer: boolean) =>
  ({
    getJSLoader: () => ({ loader: `js-loader:${isServer}` }),
    currentBundler: { instance: { ProvidePlugin: FakeProvidePlugin } },
  }) as never;

/** `configureWebpack` 交回来的那一格（只列本仓用到的几处）。 */
type WebpackResult = {
  ignoreWarnings?: Array<{ module?: RegExp }>;
  module?: { rules?: unknown[] };
  plugins?: unknown[];
  resolve?: { fallback?: Record<string, unknown> };
};

/** 跑一遍 `configureWebpack`，交回它返回的那一格。 */
const webpackOf = (
  plugin: Plugin,
  config: unknown = {},
  isServer = false,
): WebpackResult =>
  plugin.configureWebpack!(
    config as never,
    isServer,
    utilsWith(isServer),
    {} as never,
  ) as WebpackResult;

/** 层目录：入口交出去的那一格必须是包根上那份 `theme/`。 */
const themePathOf = (plugin: Plugin): string =>
  path.resolve((plugin.getThemePath as () => string)());

/**
层目录与 TS 主题路径：两者都得指向包根那份 `theme/`。
后者是给 `docusaurus swizzle` 用的（层里放的是 `.tsx`），指错一层时 swizzle 会写到别处去。
*/
const expectThemePath = (plugin: Plugin, pkg: string): void => {
  const expected = path.join(pkgDir(pkg), 'theme');
  expect(themePathOf(plugin)).toBe(expected);
  expect(path.resolve((plugin.getTypeScriptThemePath as () => string)())).toBe(
    expected,
  );
};

/** 客户端模块：入口交出去的那几份文件必须真的在磁盘上（写错路径的构建期报错在这里）。 */
const clientModulesOf = (plugin: Plugin): string[] =>
  plugin.getClientModules!() as string[];

/** `loadContent`：前置检查那一格，缺什么当场点名。 */
const loadContentOf = (plugin: Plugin): (() => void) =>
  plugin.loadContent as () => void;

describe('plugin-lazy-compilation：开发期给客户端 webpack 开 lazyCompilation', () => {
  /** 把 `NODE_ENV` 摆成用例要的那一格，跑完恢复。 */
  function withNodeEnv(value: string | undefined, run: () => void): void {
    const previous = process.env.NODE_ENV;
    if (value === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = value;
    }
    try {
      run();
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  }

  type ExperimentsConfig = {
    experiments?: { lazyCompilation?: unknown; [key: string]: unknown };
  };

  it('名字是包名本身', () => {
    expect(lazyCompilationPlugin().name).toBe(
      '@show-docs/docusaurus-plugin-lazy-compilation',
    );
  });

  it('客户端且不是 production：给 experiments 装上 lazyCompilation', () => {
    const config: ExperimentsConfig = {};
    withNodeEnv('development', () => {
      webpackOf(lazyCompilationPlugin(), config, false);
    });

    expect(config.experiments?.lazyCompilation).toEqual({
      entries: true,
      imports: true,
    });
  });

  it('服务端编译：不动 experiments', () => {
    const config: ExperimentsConfig = {};
    withNodeEnv('development', () => {
      webpackOf(lazyCompilationPlugin(), config, true);
    });

    expect(config.experiments).toBeUndefined();
  });

  it('production（`docusaurus build` 那一档）：不动 experiments', () => {
    const config: ExperimentsConfig = {};
    withNodeEnv('production', () => {
      webpackOf(lazyCompilationPlugin(), config, false);
    });

    expect(config.experiments).toBeUndefined();
  });

  it('experiments 已经有别的键时：只补自己那一格，不整块换掉', () => {
    const config: ExperimentsConfig = {
      experiments: { asyncWebAssembly: true },
    };
    withNodeEnv('development', () => {
      webpackOf(lazyCompilationPlugin(), config, false);
    });

    expect(config.experiments?.asyncWebAssembly).toBe(true);
    expect(config.experiments?.lazyCompilation).toEqual({
      entries: true,
      imports: true,
    });
  });
});

describe('theme-iframe 入口：只交层目录，不查前置', () => {
  it('层目录与 TS 主题路径都指向包根那份 theme/', () => {
    const plugin = iframeTheme();

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-iframe');
    expectThemePath(plugin, 'theme-iframe');
  });

  it('这一层没有 loadContent：缺解析器时让它在别处点名', () => {
    // 这一格是**刻意没有**的：那份检查住在未编译的 `lib/` 里，跨 `rootDir` import 会让
    // 构建在 TS6059 上停住。缺解析器的症状由这一层自己的 `@theme-prev/DocItem` 解析失败点出来。
    expect('loadContent' in iframeTheme()).toBe(false);
  });
});

describe('theme-copy-button 入口', () => {
  it('层目录与客户端模块：样式表是包根那份', () => {
    const plugin = copyButtonTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-copy-button');
    expectThemePath(plugin, 'theme-copy-button');

    const modules = clientModulesOf(plugin);
    expect(modules).toEqual([
      path.join(pkgDir('theme-copy-button'), 'styles', 'copy-button.css'),
    ]);
    expect(existsSync(modules[0]!)).toBe(true);
  });

  it('缺解析器：当场点名；装齐了就放行（这一层不要求注册 theme-iframe）', () => {
    const missing = copyButtonTheme(contextWith([]));
    expect(() => loadContentOf(missing)()).toThrow(new RegExp(RESOLVER_PLUGIN));

    const complete = copyButtonTheme(contextWith([RESOLVER_PLUGIN]));
    expect(() => loadContentOf(complete)()).not.toThrow();
  });
});

describe('theme-diff 入口', () => {
  it('层目录与客户端模块：官方那份样式表按包名解析', () => {
    const plugin = diffTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-diff');
    expectThemePath(plugin, 'theme-diff');

    const modules = clientModulesOf(plugin);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatch(/diff-view-pure\.css$/);
    expect(existsSync(modules[0]!)).toBe(true);
  });

  it('webpack：一条 post 规则，loader 写的是产物名（`.mjs`）', () => {
    // 写成源码名（`.mts`）构建期就报「找不到 loader」；这里钉住产物名这一格
    const result = webpackOf(diffTheme(contextWith()));
    const rules = result.module?.rules as Array<{
      enforce?: string;
      test: RegExp;
      loader: string;
    }>;

    expect(rules).toHaveLength(1);
    expect(rules[0]!.enforce).toBe('post');
    expect(rules[0]!.test.test('a.md')).toBe(true);
    expect(rules[0]!.test.test('a.mdx')).toBe(false);
    expect(rules[0]!.loader).toMatch(/[/\\]loader[/\\]md-diff-loader\.mjs$/);
  });

  it('缺 theme-iframe：当场点名（这一层要用那份共享外壳）', () => {
    const missing = diffTheme(contextWith([RESOLVER_PLUGIN]));
    expect(() => loadContentOf(missing)()).toThrow(new RegExp(IFRAME_PLUGIN));
  });
});

describe('theme-erd 入口', () => {
  it('层目录与名字', () => {
    const plugin = erdTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-erd');
    expectThemePath(plugin, 'theme-erd');
  });

  it('缺 theme-iframe：当场点名', () => {
    const missing = erdTheme(contextWith([RESOLVER_PLUGIN]));
    expect(() => loadContentOf(missing)()).toThrow(new RegExp(IFRAME_PLUGIN));
  });
});

describe('theme-markmap 入口', () => {
  it('层目录与客户端模块：工具条那份按包名解析，本仓那份在包根', () => {
    const plugin = markmapTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-markmap');
    expectThemePath(plugin, 'theme-markmap');

    const modules = clientModulesOf(plugin);
    expect(modules).toHaveLength(2);
    expect(modules[0]).toMatch(/markmap-toolbar[/\\]dist[/\\]style\.css$/);
    expect(modules[1]).toBe(
      path.join(pkgDir('theme-markmap'), 'styles', 'markmap.css'),
    );
    for (const file of modules) {
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('webpack：一条 post 规则，loader 写的是产物名（`.mjs`）', () => {
    const result = webpackOf(markmapTheme(contextWith()));
    const rules = result.module?.rules as Array<{
      enforce?: string;
      test: RegExp;
      loader: string;
    }>;

    expect(rules).toHaveLength(1);
    expect(rules[0]!.enforce).toBe('post');
    expect(rules[0]!.test.test('a.md')).toBe(true);
    expect(rules[0]!.loader).toMatch(/[/\\]loader[/\\]md-markmap-loader\.mjs$/);
  });

  it('缺 theme-iframe：当场点名', () => {
    const missing = markmapTheme(contextWith([RESOLVER_PLUGIN]));
    expect(() => loadContentOf(missing)()).toThrow(new RegExp(IFRAME_PLUGIN));
  });
});

describe('theme-viewer 入口', () => {
  it('层目录与客户端模块：viewerjs 那份按包名解析，本仓那份在包根', () => {
    const plugin = viewerTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-viewer');
    expectThemePath(plugin, 'theme-viewer');

    const modules = clientModulesOf(plugin);
    expect(modules).toHaveLength(2);
    expect(modules[0]).toMatch(/viewerjs[/\\]dist[/\\]viewer\.css$/);
    expect(modules[1]).toBe(
      path.join(pkgDir('theme-viewer'), 'styles', 'viewer.css'),
    );
    for (const file of modules) {
      expect(existsSync(file), file).toBe(true);
    }
  });
});

describe('theme-redoc 入口：worker_threads 给一个空模块', () => {
  it('层目录挂在自己的包上', () => {
    const plugin = redocTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-redoc');
    // API 三层走那份工厂：它只交层目录，不交 TS 主题路径
    expect(themePathOf(plugin)).toBe(path.join(pkgDir('theme-redoc'), 'theme'));
  });

  it('客户端：worker_threads 置 false（空模块），服务端那一格不动', () => {
    // `redoc` 那份 ESM 里有一支 Node 分支写着 `require('worker_threads')`：浏览器里跑不到，
    // 但 webpack 的**解析**这一步照样红。置 false 是给它一个空模块，比补 polyfill 诚实。
    const client = webpackOf(redocTheme(contextWith()), {}, false);
    expect(client.resolve?.fallback).toEqual({ worker_threads: false });

    const server = webpackOf(redocTheme(contextWith()), {}, true);
    expect(server).toEqual({});
  });
});

describe('theme-scalar 入口：把 Scalar 那份静态样式表摘出全站 css', () => {
  /** 官方那条 `.css` 规则（带 loader 的那一种）与本仓要改的那份样式表。 */
  const officialCssRule = (): {
    test: RegExp;
    use: string[];
    exclude?: RegExp | RegExp[];
  } => ({
    test: /\.css$/i,
    use: ['css-loader'],
  });

  it('层目录挂在自己的包上', () => {
    const plugin = scalarTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-scalar');
    // API 三层走那份工厂：它只交层目录，不交 TS 主题路径
    expect(themePathOf(plugin)).toBe(
      path.join(pkgDir('theme-scalar'), 'theme'),
    );
  });

  it('那条动态 import 的告警被按住：模块判据只认 `@scalar/api-reference` 里那一份', () => {
    const result = webpackOf(scalarTheme(contextWith()));

    expect(result.ignoreWarnings).toHaveLength(1);
    const warning = result.ignoreWarnings![0]!.module!;
    expect(
      warning.test(
        '/site/node_modules/@scalar/api-reference/dist/load-plugins-from-urls.js',
      ),
    ).toBe(true);
    // 判据不是全局消息匹配：别的包里的同名文件不该被这一条豁免
    expect(
      warning.test('/site/node_modules/other/dist/load-plugins-from-urls.js'),
    ).toBe(false);
  });

  it('样式表被改成资源规则：官方那条 `.css` 规则把它 exclude 掉', () => {
    const rule = officialCssRule();
    const config = { module: { rules: [rule] } };

    webpackOf(scalarTheme(contextWith()), config, false);

    const { rules } = config.module;
    // 资源规则**追加**在末尾（排在项目规则之后才是它命中的位置）
    expect(rules).toHaveLength(2);
    const resource = rules[1] as { type?: string; test: RegExp };
    expect(resource.type).toBe('asset/resource');
    expect(
      resource.test.test(
        '/site/node_modules/@scalar/api-reference/dist/style.css',
      ),
    ).toBe(true);
    expect(resource.test.test('/site/node_modules/other/style.css')).toBe(
      false,
    );

    // 官方那条规则不再收它：否则它照旧被 css-loader 处理，样式还是漏回全站那一份
    // （原本没有 exclude 时挂的是那一条正则本身，不是数组）
    const excluded =
      rule.exclude instanceof RegExp
        ? [rule.exclude]
        : (rule.exclude as RegExp[]);
    expect(excluded).toHaveLength(1);
    expect(
      excluded[0]!.test(
        '/site/node_modules/@scalar/api-reference/dist/style.css',
      ),
    ).toBe(true);
  });
});

describe('theme-stoplight 入口：样式表隔离 + 浏览器 bundle 补 Node 侧依赖', () => {
  it('层目录挂在自己的包上', () => {
    const plugin = stoplightTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-stoplight');
    // API 三层走那份工厂：它只交层目录，不交 TS 主题路径
    expect(themePathOf(plugin)).toBe(
      path.join(pkgDir('theme-stoplight'), 'theme'),
    );
  });

  it('客户端：ProvidePlugin 补 `process`，fallback 补 buffer 与 url', () => {
    // 裸标识符 `process` 只由 ProvidePlugin 补（`resolve.fallback` 只管按模块 id 筛的
    // require）；`buffer` / `url` 走在「按 URL 取 schema」那条路上，置 false 会在运行时抛。
    const result = webpackOf(stoplightTheme(contextWith()), {}, false);

    expect(result.plugins).toHaveLength(1);
    const provide = result.plugins![0] as FakeProvidePlugin;
    expect(provide).toBeInstanceOf(FakeProvidePlugin);
    expect(Object.keys(provide.definitions)).toEqual(['process']);
    expect(provide.definitions.process).toMatch(/process[/\\]browser\.js$/);

    const fallback = result.resolve?.fallback ?? {};
    expect(
      Object.keys(fallback).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['buffer', 'process', 'url']);
    for (const file of Object.values(fallback)) {
      expect(existsSync(String(file)), String(file)).toBe(true);
    }
  });

  it('服务端：那一格不补（有真的 Node 模块），样式表照旧隔离', () => {
    const rule = { test: /\.css$/i, use: ['css-loader'] };
    const config = { module: { rules: [rule] } };

    const result = webpackOf(stoplightTheme(contextWith()), config, true);

    expect(result).toEqual({});
    // 样式表的边界两侧都要改，服务端也不例外
    expect(config.module.rules).toHaveLength(2);
    expect((config.module.rules[1] as { type?: string }).type).toBe(
      'asset/resource',
    );
  });
});
