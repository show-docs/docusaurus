import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { LoadContext, Plugin } from '@docusaurus/types';

import compileSourcePlugin from '../packages/plugin-compile-source/src/index.mts';
import lazyCompilationPlugin from '../packages/plugin-lazy-compilation/src/index.mts';
import componentPageTheme from '../packages/theme-component-page/src/index.mts';
import diffTheme from '../packages/theme-diff/src/index.mts';
import erdTheme from '../packages/theme-erd/src/index.mts';
import iframeTheme from '../packages/theme-iframe/src/index.mts';
import markmapTheme from '../packages/theme-markmap/src/index.mts';
import redocTheme from '../packages/theme-redoc/src/index.mts';
import scalarTheme from '../packages/theme-scalar/src/index.mts';
import stoplightTheme from '../packages/theme-stoplight/src/index.mts';
import wordCountTheme from '../packages/theme-word-count/src/index.mts';
import { PLUGIN_NAME as AVATAR_PLUGIN_NAME } from '../themes/theme-avatar/src/config.mts';
import avatarTheme from '../themes/theme-avatar/src/index.mts';
import copyButtonTheme from '../themes/theme-copy-button/src/index.mts';
import gitBadgeTheme from '../themes/theme-git-badge/src/index.mts';
import viewerTheme from '../themes/theme-viewer/src/index.mts';

import { pkgPath } from './helpers.mts';

/**
## 每个包入口交出的那几格

入口（每个包 `src/` 下那一份 `index.mts`）是 Docusaurus 唯一看得见的那一面：层目录、客户端模块、
webpack 那几格、交给机制层的那一列、以及配置期那几条校验（选项写歪、宿主前提没开）。
这一面全是**配置期**代码，跑在 Node 里 ——
`pnpm build` 全绿只说明它没把构建搞崩，证明不了它交出去的东西是对的：层目录指错一层、
样式表路径写错、loader 写成了源码名（`.mts`）而不是产物名（`.mjs`），构建照样绿，
坏的是产物里的那一格。

所以这里逐个包钉住它交出的形状。浏览器那半边（`components/` 与 `theme/` 里的组件）不在这一面里，
由 e2e 钉 —— 理由与分工记在 `test/README.md`。

各包交出的那一列（`{ componentPage: { components, rules } }`）**合不成一张表**只是这一面的事：
判表、顺序、覆写那套算法在 `test/component-page-contrib.test.mts`，这里只钉「每一家确实交了自己
那一条」，包括它交的是登记名而不是模块说明符。

「缺前置插件时当场点名」那一族用例不再由这一面钉了：机制层不依赖解析器包，于是「本层挂了几份」
和「交规则的层有没有装上机制层」那两条一起删掉了（后果记在机制层入口的文件头）。配置期还查前提
的只剩一处：`themes/theme-viewer` 查宿主开没开那个压缩器（在 `test/prerequisites.test.mts`）。
*/

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/**
包在仓库里的那份目录：`packages/` 与 `themes/` 两棵包根都找，按存在性定根 ——
搬动一个包不必回来改这张表（判据来自磁盘，不是手抄的归属清单）。
*/
const pkgDir = (name: string): string => pkgPath(repoRoot, name);

/**
一份够用的站点上下文：入口工厂只读 `siteConfig.baseUrl`（erd 那一份还读 `siteDir`），
`future.faster` 那一格是 `theme-viewer` 那条前提要看的。其余一概不需要。

那两份清单是空的：这一族曾经要在这里放「机制层装上没有」那一条前提，它随解析器依赖一起删了，
剩下的用例只关心入口交出的形状。
*/
const contextWith = (): LoadContext =>
  ({
    siteConfig: {
      baseUrl: '/',
      plugins: [],
      themes: [],
      future: { faster: { lightningCssMinimizer: true } },
    },
  }) as unknown as LoadContext;

/**
webpack 的 `utils`：本仓这几条入口只用到 `getJSLoader`（erd）、
`utils.currentBundler.instance.ProvidePlugin`（stoplight 补 `process`），以及
`utils.currentBundler.name` 与 `instance.lazyCompilationMiddleware`（lazy-compilation 那两条分支）。
bundler 默认摆成 webpack，除那几条用例外的调用不必跟着改。
*/
class FakeProvidePlugin {
  readonly definitions: Record<string, string>;

  constructor(definitions: Record<string, string>) {
    this.definitions = definitions;
  }
}

/**
假的 `rspack.lazyCompilationMiddleware`：交回一个记下「见到的是哪一份 compiler」的处理者，
让测试能钉住挂进中间件表那一步确实把 compiler 交给了它。
*/
const fakeLazyCompilationMiddleware = (
  compiler: unknown,
): (() => void) & { seen: unknown } =>
  Object.assign(() => {}, { seen: compiler });

const utilsWith = (
  isServer: boolean,
  bundler: 'webpack' | 'rspack' = 'webpack',
) =>
  ({
    getJSLoader: () => ({ loader: `js-loader:${isServer}` }),
    currentBundler: {
      name: bundler,
      instance: {
        ProvidePlugin: FakeProvidePlugin,
        lazyCompilationMiddleware: fakeLazyCompilationMiddleware,
      },
    },
  }) as never;

/** `configureWebpack` 交回来的那一格（只列本仓用到的几处）。 */
type WebpackResult = {
  ignoreWarnings?: Array<{ module?: RegExp }>;
  module?: { rules?: unknown[] };
  plugins?: unknown[];
  resolve?: { fallback?: Record<string, unknown> };
};

/**
真实基线里那条带 css-loader 的规则：`isolateRendererCss` 的探针要靠它，所以不显式给配置的调用
默认拿到这一份（形状照官方 `base.js`，值不重要）。给一份空的 `{}` 会让本包按「规则形状变了」处理，
也就是抛。
*/
const baseWebpackConfig = () => ({
  module: { rules: [{ test: /\.css$/i, use: ['css-loader'] }] },
});

/** 跑一遍 `configureWebpack`，交回它返回的那一格。 */
const webpackOf = (
  plugin: Plugin,
  config: unknown = baseWebpackConfig(),
  isServer = false,
  bundler: 'webpack' | 'rspack' = 'webpack',
): WebpackResult =>
  plugin.configureWebpack!(
    config as never,
    isServer,
    utilsWith(isServer, bundler),
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

/**
`loadContent`：交回本层那份 content。个别层在这一步里当场点名宿主前提
（`themes/theme-viewer` 那一格），交回的东西未必是 `Promise`，所以这里的断言一律 `await`。
*/
const loadContentOf = (plugin: Plugin): (() => Promise<unknown>) =>
  plugin.loadContent as () => Promise<unknown>;

/** 交回本层交给 component-page 的那一列（一份组件登记 + 一条规则，判表在机制层）。 */
const contributedOf = async (plugin: Plugin): Promise<unknown> =>
  ((await loadContentOf(plugin)()) as { componentPage?: unknown })
    .componentPage;

describe('plugin-lazy-compilation：开发期给客户端编译开 lazyCompilation', () => {
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

  /**
  `configureWebpack` 交回来的那一格（本包只点名自己要的那几格，其余一概不写）。
  官方那一步把它用 webpack-merge 并进传进来的 config，所以这里断言的是「交出去的那几格」。
  */
  type LazyPatch = {
    experiments?: { lazyCompilation?: unknown; [key: string]: unknown };
    lazyCompilation?: unknown;
    devServer?: {
      setupMiddlewares?: (
        middlewares: unknown[],
        devServer: { compiler: unknown },
      ) => unknown[];
      [key: string]: unknown;
    };
  };

  /** 装上时装的那两格 —— 两个 bundler 收的是同一份形状，只是住的地方不同。 */
  const LAZY = { entries: true, imports: true };

  /** 中间件表的那一项：本仓只用到 `name` 与 `middleware` 两格。 */
  type MiddlewareEntry = {
    name?: string;
    middleware?: (() => void) & { seen?: unknown };
  };

  /** 跑一遍并交回本包点名那一格；`undefined` = 这一支什么都不改。 */
  const patchOf = (
    isServer: boolean,
    bundler: 'webpack' | 'rspack' = 'webpack',
  ): LazyPatch | undefined => {
    const config = {};
    let patch: LazyPatch | undefined;
    withNodeEnv('development', () => {
      patch = webpackOf(
        lazyCompilationPlugin(),
        config,
        isServer,
        bundler,
      ) as unknown as LazyPatch | undefined;
    });
    // 本包不改动传进来的那份 config：要改的都从返回值交出去
    expect(config).toEqual({});
    return patch;
  };

  it('名字是包名本身', () => {
    expect(lazyCompilationPlugin().name).toBe(
      '@show-docs/docusaurus-plugin-lazy-compilation',
    );
  });

  it('webpack：客户端且不是 production，给 experiments 装上 lazyCompilation', () => {
    const patch = patchOf(false);

    expect(patch?.experiments?.lazyCompilation).toEqual(LAZY);
    // 顶层那一格与 devServer 都不交：webpack 自己起那份按需编译的后端
    expect(patch?.lazyCompilation).toBeUndefined();
    expect(patch?.devServer).toBeUndefined();
  });

  it('rspack：同一格装在顶层，不写 experiments（那一格在 rspack 里是废弃写法）', () => {
    const patch = patchOf(false, 'rspack');

    expect(patch?.lazyCompilation).toEqual(LAZY);
    expect(patch?.experiments).toBeUndefined();
  });

  it('rspack：那份中间件挂到中间件表表头，compiler 交给它，devServer 只交这一格', () => {
    const patch = patchOf(false, 'rspack');
    const compiler = { tag: 'fake-client-compiler' };
    const registered = patch?.devServer?.setupMiddlewares?.(
      [{ name: 'webpack-dev-middleware' }],
      { compiler },
    ) as MiddlewareEntry[];

    expect(Object.keys(patch?.devServer ?? {})).toEqual(['setupMiddlewares']);
    expect(registered.map((entry) => entry.name)).toEqual([
      'rspack-lazy-compilation',
      'webpack-dev-middleware',
    ]);
    expect(registered[0]?.middleware?.seen).toBe(compiler);
  });

  it('服务端编译：两处都不动', () => {
    for (const bundler of ['webpack', 'rspack'] as const) {
      expect(patchOf(true, bundler)).toBeUndefined();
    }
  });

  it('production（`docusaurus build` 那一档）：两处都不动', () => {
    for (const bundler of ['webpack', 'rspack'] as const) {
      const config = { experiments: { asyncWebAssembly: true } };
      withNodeEnv('production', () => {
        expect(
          webpackOf(lazyCompilationPlugin(), config, false, bundler),
        ).toBeUndefined();
      });
      expect(config).toEqual({ experiments: { asyncWebAssembly: true } });
    }
  });

  it('交出的那一格只有本包自己那几格，不带同级别的键', () => {
    const webpackPatch = patchOf(false);
    const rspackPatch = patchOf(false, 'rspack');

    // 并进站点已有的 `experiments` / `devServer` 时不会被整块换掉：交出去的形状里只有这一格
    expect(webpackPatch && Object.keys(webpackPatch)).toEqual(['experiments']);
    expect(Object.keys(webpackPatch?.experiments ?? {})).toEqual([
      'lazyCompilation',
    ]);
    expect(Object.keys(rspackPatch ?? {})).toEqual([
      'lazyCompilation',
      'devServer',
    ]);
  });
});

/**
那条规则在 `configureWebpack` 交回来的那一格里长什么样（只列这里要钉的三格）。
判据的细节与「babelOptions 为什么必须和官方同源」在 `test/source-js-rule.test.mts`，
这里只钉入口确实把那一格交出去了。
*/
type SourceRule = {
  test: RegExp;
  include: (file: string) => boolean;
  use: Array<{ loader: string }>;
};

describe('plugin-compile-source：交出一条编译这一族未编译 TS 源码的规则', () => {
  /**
  入口要拿 `siteDir` 问官方那份自定义 babel 配置的产地（`@docusaurus/babel` 的
  `getCustomBabelConfigFilePath`，本包按自己的依赖清单直接引它）。仓库根没有
  `babel.config.js`，那一步因此回 `undefined` —— 与官方那条 JS 规则在这一轮里拿到的是同一个值。
  */
  const load = () =>
    compileSourcePlugin({ siteDir: repoRoot } as unknown as LoadContext);

  it('名字是包名本身', async () => {
    const plugin = await load();
    expect(plugin.name).toBe('@show-docs/docusaurus-plugin-compile-source');
  });

  it('交出的只有一条 TS 源码规则：官方不编的那一族归它，且不碰 resolve.plugins', async () => {
    const plugin = await load();

    const result = webpackOf(plugin);
    const rules = (result.module?.rules ?? []) as unknown as SourceRule[];
    expect(rules).toHaveLength(1);

    const rule = rules[0]!;
    expect(rule.test.test('index.tsx')).toBe(true);
    expect(rule.test.test('index.js')).toBe(false);
    expect(
      rule.include(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/theme/MarkmapPage/index.tsx',
      ),
    ).toBe(true);
    expect(
      rule.include('/repo/packages/theme-markmap/theme/MarkmapPage/index.tsx'),
    ).toBe(false);
    expect(rule.use).toEqual([{ loader: 'js-loader:false' }]);

    // 这一格与层栈无关：`resolve.plugins` 归解析器插件，本包碰了就是两件事又缠回一处。
    expect(result.resolve).toBeUndefined();
  });

  it('服务端那一轮也用服务端自己的 loader：客户端与服务端各一条', async () => {
    const plugin = await load();
    expect(webpackOf(plugin, baseWebpackConfig(), true).module?.rules).toEqual([
      expect.objectContaining({ use: [{ loader: 'js-loader:true' }] }),
    ]);
  });
});

/** component-page 的包名：本层交出的那一列由它判表后挂上来。 */
const COMPONENT_PAGE = '@show-docs/docusaurus-theme-component-page';

const SCALAR = '@show-docs/docusaurus-theme-scalar';
const REDOC = '@show-docs/docusaurus-theme-redoc';
const STOPLIGHT = '@show-docs/docusaurus-theme-stoplight';

describe('theme-iframe 入口：层目录与自己那一条 `iframe:`', () => {
  it('层目录与 TS 主题路径都指向包根那份 theme/', () => {
    const plugin = iframeTheme();

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-iframe');
    expectThemePath(plugin, 'theme-iframe');
  });

  it('loadContent：只交自己那把 `iframe:` —— 三条 API 层由各包自己的 loadContent 交', async () => {
    // 这一层收缩成「嵌外部站点那一个框」：组件是本包主题层那份 `ExternalFrame`，跨源的地址算法
    // 留在本包（`lib/external-url.ts`）；同源那份框、握手与框内页面都在机制层里，卸载本包
    // 三条 API 层照常可用（那条验收见 e2e）。
    expect(await contributedOf(iframeTheme())).toEqual({
      components: [{ id: 'external-frame', component: '@theme/ExternalFrame' }],
      rules: [
        {
          key: 'iframe',
          // 只读 frontmatter：正文里恰好有一条同名导出就把整页换成框，不是作者的本意。
          source: 'frontMatter',
          match: 'value',
          component: 'external-frame',
        },
      ],
    });
  });
});

describe('theme-component-page 入口：层目录与一列清单的校验', () => {
  it('层目录与 TS 主题路径都指向包根那份 theme/，且不查任何配置期前提', () => {
    const plugin = componentPageTheme(contextWith(), {
      components: [{ id: 'site/report', component: '@theme/ReportPage' }],
      rules: [{ key: 'report', component: 'site/report', match: 'options' }],
    });

    expect(plugin.name).toBe(COMPONENT_PAGE);
    expectThemePath(plugin, 'theme-component-page');
    // 本层不交 content，也不在配置期查「自己挂了几份」：那一条要读站点那份插件清单，判据住在
    // 解析器包里，而本层不该依赖它 —— 于是这一族两条检查一起删了，「只注册一份」归站点自己。
    expect(plugin.loadContent).toBeUndefined();
  });

  it('选项缺省 = 空清单：装上这一层但不配页面，站点照跑', () => {
    expect(() => componentPageTheme(contextWith())).not.toThrow();
  });

  it('旧的 `pages` 那一列红一次：这一版换了契约，不静默退回普通文档页', () => {
    // 让它安静地不生效是最坏的那种升级 —— 站点照常构建，被接管的每一页退回普通文档页，
    // 看不出跟这次升级有关系。所以红在入口，报错里带着新的写法。
    expect(() =>
      componentPageTheme(contextWith(), {
        pages: [{ key: 'report', component: '@theme/ReportPage' }],
      } as never),
    ).toThrow(/还有旧的 `pages` 那一列/);
  });
});

describe('theme-avatar 入口', () => {
  /**
  跑一遍 `contentLoaded`，把那一格里 `actions.setGlobalData()` 交出去的数据收回来。

  这一格是这一层唯一的配置出口，也是它最容易静默失灵的地方：`setGlobalData` 不是生命周期方法
  （是 `actions` 上的那一个），而 `actions` 只在插件**定义了** `contentLoaded` 时才创建。
  */
  const globalDataOf = (plugin: Plugin): unknown => {
    let captured: unknown;

    (
      plugin.contentLoaded as unknown as (args: {
        actions: { setGlobalData(data: unknown): void };
      }) => void
    )({
      actions: {
        setGlobalData(data: unknown): void {
          captured = data;
        },
      },
    });

    return captured;
  };

  it('层目录两条都指向包根那份 `theme/`，且没有自己的样式表', () => {
    const plugin = avatarTheme(contextWith());

    expect(plugin.name).toBe(AVATAR_PLUGIN_NAME);
    expectThemePath(plugin, 'theme-avatar');
    // 这一层用的全是 Infima 已有的类名，不交客户端模块 = 它确实没有一份要交给站点的样式表。
    expect(plugin.getClientModules).toBeUndefined();
    // 这一层也没有配置期要查的前提：层里那句 `@theme-init/ColorModeToggle` 是官方别名。
    expect(plugin.loadContent).toBeUndefined();
  });

  it('contentLoaded 交出的是配置期校验并补齐过的那一份', () => {
    const plugin = avatarTheme(contextWith(), {
      userApi: '/api/me',
      request: { cacheKey: 'staff-user' },
    });

    expect(globalDataOf(plugin)).toEqual({
      enableHostname: '',
      userApi: '/api/me',
      anonymousName: '未命名',
      defaultAvatar: '',
      request: {
        cacheKey: 'staff-user',
      },
      fields: {
        id: 'id',
        name: 'name',
        displayName: 'displayName',
        avatar: 'avatar',
      },
      menu: {
        profileLabelPrefix: '用户：',
        profileHref: '',
        logoutText: '退出登录',
        logoutHref: '',
        logoutTarget: '_self',
      },
    });
  });

  it('选项写歪红在入口，不红在浏览器里那颗头像', () => {
    expect(() =>
      avatarTheme(contextWith(), { userAPI: '/api/me' } as never),
    ).toThrow(/userAPI/);
  });

  it('两处包名字面量对齐：主题层里那句就是入口那个常量', () => {
    // 浏览器侧那一层不能引 `src/`（那里是 Node 侧的编译产物），于是包名在两个文件里各写一次。
    // 漂了的症状是「头像静默消失」：全局数据里取到的那一格是 `undefined`。
    const layer = readFileSync(
      path.join(
        pkgDir('theme-avatar'),
        'theme',
        'ColorModeToggle',
        'index.tsx',
      ),
      'utf8',
    );

    expect(layer).toContain(`const PLUGIN_NAME = '${AVATAR_PLUGIN_NAME}'`);
  });
});

describe('theme-copy-button 入口', () => {
  it('层目录与客户端模块：样式表是包根那份', () => {
    const plugin = copyButtonTheme();

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-copy-button');
    expectThemePath(plugin, 'theme-copy-button');

    const modules = clientModulesOf(plugin);
    expect(modules).toEqual([
      path.join(pkgDir('theme-copy-button'), 'styles', 'copy-button.css'),
    ]);
    expect(existsSync(modules[0]!)).toBe(true);
    // 这一层没有配置期要查的前提：层里那句 `@theme-init/Footer/Copyright` 是官方别名。
    expect(plugin.loadContent).toBeUndefined();
  });
});

describe('theme-diff 入口', () => {
  it('层目录与客户端模块：官方那份样式表按包名解析', () => {
    const plugin = diffTheme();

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-diff');
    expectThemePath(plugin, 'theme-diff');

    const modules = clientModulesOf(plugin);
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatch(/diff-view-pure\.css$/);
    expect(existsSync(modules[0]!)).toBe(true);
  });

  it('webpack：一条 post 规则，loader 写的是产物名（`.mjs`）', () => {
    // 写成源码名（`.mts`）构建期就报「找不到 loader」；这里钉住产物名这一格
    const result = webpackOf(diffTheme());
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

  it('loadContent：交出 diff 那一格，组件写的是 @theme/DiffPage', async () => {
    expect(await contributedOf(diffTheme())).toEqual({
      components: [{ id: 'diff', component: '@theme/DiffPage' }],
      // `any` 判法：`diff:` 那三种写下的开关形状（`true` / 路径 / `{ old, new }`）都算命中
      // （见 component-page 的判据）。
      rules: [{ key: 'diff', match: 'any', component: 'diff' }],
    });
  });
});

describe('theme-erd 入口', () => {
  it('层目录与名字', () => {
    const plugin = erdTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-erd');
    expectThemePath(plugin, 'theme-erd');
  });

  it('loadContent：交出 dbml_json 那一格，组件写的是 @theme/ErdPage', async () => {
    expect(await contributedOf(erdTheme(contextWith()))).toEqual({
      components: [{ id: 'erd', component: '@theme/ErdPage' }],
      // `any` 判法：`dbml_json` 是 loader 追加的那条导出，恒是一个对象（见 component-page 的判据）。
      rules: [{ key: 'dbml_json', match: 'any', component: 'erd' }],
    });
  });
});

describe('theme-git-badge 入口：层目录、样式表与接线', () => {
  const GIT_BADGE = '@show-docs/docusaurus-theme-git-badge';

  /**
  这一层要改 `siteConfig.markdown.parseFrontMatter`，所以站点上下文里得有一份 `markdown`；
  那一格长什么样与本组断言无关，只要解析器在那儿就行。
  */
  const contextWithMarkdown = (): LoadContext =>
    ({
      siteDir: repoRoot,
      siteConfig: {
        baseUrl: '/',
        plugins: [],
        themes: [],
        future: { faster: { lightningCssMinimizer: true } },
        markdown: {
          parseFrontMatter: async () => ({ frontMatter: {}, content: '' }),
        },
      },
    }) as unknown as LoadContext;

  it('层目录与客户端模块：层是包根那份 `theme/`，样式表是包根那份', () => {
    const plugin = gitBadgeTheme(contextWithMarkdown());

    expect(plugin.name).toBe(GIT_BADGE);
    expectThemePath(plugin, 'theme-git-badge');

    const modules = clientModulesOf(plugin);
    expect(modules).toEqual([
      path.join(pkgDir('theme-git-badge'), 'styles', 'git-badge.css'),
    ]);
    expect(existsSync(modules[0]!)).toBe(true);
  });

  it('接线在 `loadContent()`，`contentLoaded()` 那格留给 reloadSite', () => {
    const plugin = gitBadgeTheme(contextWithMarkdown());

    expect(plugin.loadContent).toBeTypeOf('function');
    expect(plugin.contentLoaded).toBeTypeOf('function');
  });
});

describe('theme-markmap 入口', () => {
  it('层目录与客户端模块：工具条那份按包名解析，本仓那份在包根', () => {
    const plugin = markmapTheme();

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
    const result = webpackOf(markmapTheme());
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

  it('loadContent：交出 markmap 那一格，组件写的是 @theme/MarkmapPage', async () => {
    expect(await contributedOf(markmapTheme())).toEqual({
      components: [{ id: 'markmap', component: '@theme/MarkmapPage' }],
      // `options` 判法：`markmap: true` 与选项对象都算命中（见 component-page 的判据）。
      rules: [{ key: 'markmap', match: 'options', component: 'markmap' }],
    });
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
    const plugin = redocTheme();

    expect(plugin.name).toBe(REDOC);
    expectThemePath(plugin, 'theme-redoc');
  });

  it('loadContent：交出 `redoc` 那一格，框内取 @theme/RedocView', async () => {
    expect(await contributedOf(redocTheme())).toEqual({
      components: [{ id: 'redoc', component: '@theme/RedocView' }],
      rules: [
        {
          key: 'redoc',
          match: 'boolean',
          component: 'redoc',
          render: 'iframe',
        },
      ],
    });
  });

  it('客户端：worker_threads 置 false（空模块），服务端那一格不动', () => {
    // `redoc` 那份 ESM 里有一支 Node 分支写着 `require('worker_threads')`：浏览器里跑不到，
    // 但 webpack 的**解析**这一步照样红。置 false 是给它一个空模块，比补 polyfill 诚实。
    const client = webpackOf(redocTheme(), {}, false);
    expect(client.resolve?.fallback).toEqual({ worker_threads: false });

    const server = webpackOf(redocTheme(), {}, true);
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
    const plugin = scalarTheme();

    expect(plugin.name).toBe(SCALAR);
    expectThemePath(plugin, 'theme-scalar');
  });

  it('loadContent：交出 `scalar` 那一格，框内取 @theme/ScalarView', async () => {
    expect(await contributedOf(scalarTheme())).toEqual({
      components: [{ id: 'scalar', component: '@theme/ScalarView' }],
      rules: [
        {
          key: 'scalar',
          match: 'boolean',
          component: 'scalar',
          render: 'iframe',
        },
      ],
    });
  });

  it('那条动态 import 的告警被按住：模块判据只认 `@scalar/api-reference` 里那一份', () => {
    const result = webpackOf(scalarTheme());

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

    webpackOf(scalarTheme(), config, false);

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
    const plugin = stoplightTheme();

    expect(plugin.name).toBe(STOPLIGHT);
    expectThemePath(plugin, 'theme-stoplight');
  });

  it('loadContent：交出 `stoplight` 那一格，框内取 @theme/StoplightView', async () => {
    expect(await contributedOf(stoplightTheme())).toEqual({
      components: [{ id: 'stoplight', component: '@theme/StoplightView' }],
      rules: [
        {
          key: 'stoplight',
          match: 'boolean',
          component: 'stoplight',
          render: 'iframe',
        },
      ],
    });
  });

  it('客户端：ProvidePlugin 补 `process`，fallback 补 buffer 与 url', () => {
    // 裸标识符 `process` 只由 ProvidePlugin 补（`resolve.fallback` 只管按模块 id 筛的
    // require）；`buffer` / `url` 走在「按 URL 取 schema」那条路上，置 false 会在运行时抛。
    const result = webpackOf(stoplightTheme());

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

    const result = webpackOf(stoplightTheme(), config, true);

    expect(result).toEqual({});
    // 样式表的边界两侧都要改，服务端也不例外
    expect(config.module.rules).toHaveLength(2);
    expect((config.module.rules[1] as { type?: string }).type).toBe(
      'asset/resource',
    );
  });
});

describe('theme-word-count 入口：层目录与全站那一份统计', () => {
  it('层目录与名字', () => {
    const plugin = wordCountTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-word-count');
    expectThemePath(plugin, 'theme-word-count');
    // 这一层没有样式表、也没有 webpack 那一格：数在配置期算完，浏览器只读生成模块
    expect(plugin.getClientModules).toBeUndefined();
    expect(plugin.configureWebpack).toBeUndefined();
  });

  it('loadContent：交出 wordCount 那一格，组件写的是 @theme/WordCountPage', async () => {
    expect(await contributedOf(wordCountTheme(contextWith()))).toEqual({
      components: [{ id: 'word-count', component: '@theme/WordCountPage' }],
      // `boolean` 判法：只有认真布尔 `true` 才算命中（写串文本或选项对象都不算）
      rules: [{ key: 'wordCount', match: 'boolean', component: 'word-count' }],
    });
  });
});
