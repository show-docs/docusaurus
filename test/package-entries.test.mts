import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { LoadContext, Plugin } from '@docusaurus/types';

import lazyCompilationPlugin from '../packages/plugin-lazy-compilation/src/index.mts';
import { PLUGIN_NAME as RESOLVER_PLUGIN } from '../packages/plugin-prev-layer-resolver/src/plugin-slots.mts';
import { PLUGIN_NAME as AVATAR_PLUGIN_NAME } from '../packages/theme-avatar/src/config.mts';
import avatarTheme from '../packages/theme-avatar/src/index.mts';
import componentPageTheme from '../packages/theme-component-page/src/index.mts';
import { COMPONENT_PAGE_PLUGIN } from '../packages/theme-component-page/src/prerequisites.mts';
import copyButtonTheme from '../packages/theme-copy-button/src/index.mts';
import diffTheme from '../packages/theme-diff/src/index.mts';
import erdTheme from '../packages/theme-erd/src/index.mts';
import gitBadgeTheme from '../packages/theme-git-badge/src/index.mts';
import iframeTheme from '../packages/theme-iframe/src/index.mts';
import markmapTheme from '../packages/theme-markmap/src/index.mts';
import redocTheme from '../packages/theme-redoc/src/index.mts';
import scalarTheme from '../packages/theme-scalar/src/index.mts';
import stoplightTheme from '../packages/theme-stoplight/src/index.mts';
import viewerTheme from '../packages/theme-viewer/src/index.mts';

/**
## 每个包入口交出的那几格

入口（每个包 `src/` 下那一份 `index.mts`）是 Docusaurus 唯一看得见的那一面：层目录、客户端模块、
webpack 那几格、以及「缺前置插件时当场点名」。这一面全是**配置期**代码，跑在 Node 里 ——
`pnpm build` 全绿只说明它没把构建搞崩，证明不了它交出去的东西是对的：层目录指错一层、
样式表路径写错、loader 写成了源码名（`.mts`）而不是产物名（`.mjs`），构建照样绿，
坏的是产物里的那一格。

所以这里逐个包钉住它交出的形状。浏览器那半边（`components/` 与 `theme/` 里的组件）不在这一面里，
由 e2e 钉 —— 理由与分工记在 `test/README.md`。

各包交出的那一列（`{ componentPage: { components, rules } }`）**合不成一张表**只是这一面的事：
判表、顺序、覆写那套算法在 `test/component-page-contrib.test.mts`，这里只钉「每一家确实交了自己
那一条」，包括它交的是登记名而不是模块说明符。
*/

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/** 包在仓库里的那份目录。 */
const pkgDir = (name: string): string =>
  path.resolve(repoRoot, 'packages', name);

/**
一份够用的站点上下文：前置检查只读 `siteConfig.plugins` / `themes` / `future`，
入口工厂只读 `siteConfig.baseUrl`。其余一概不需要。

默认那份把两条前提都装齐（解析器 + component-page）：绝大多数用例只关心入口交出的形状，
不需要再重复这两格。
*/
const contextWith = (
  plugins: unknown[] = [RESOLVER_PLUGIN, COMPONENT_PAGE_PLUGIN],
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

/** `loadContent`：前置检查那一格，缺什么当场点名；返回贡献方交回的那份 content。 */
const loadContentOf = (plugin: Plugin): (() => unknown) =>
  plugin.loadContent as () => unknown;

/** 交回本层交给 component-page 的那一列（一份组件登记 + 一条规则，判表在机制层）。 */
const contributedOf = (plugin: Plugin): unknown =>
  (loadContentOf(plugin)() as { componentPage?: unknown }).componentPage;

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

/** component-page 的包名：本层交出的那一列由它判表后挂上来。 */
const COMPONENT_PAGE = COMPONENT_PAGE_PLUGIN;

const SCALAR = '@show-docs/docusaurus-theme-scalar';
const REDOC = '@show-docs/docusaurus-theme-redoc';
const STOPLIGHT = '@show-docs/docusaurus-theme-stoplight';

/**
各层共用的那两条安装前提，各点一次名：解析器那条判据住在它自己的包里，component-page 那条住在
机制层的 `prerequisites`（各层引的是同一份判据）。缺 component-page 的症状是「页面看着正常，
那一格视图 / 框却安静地不出现」，所以各层在 `loadContent()` 里先查一遍。
*/
const expectPrerequisites = (theme: (context: LoadContext) => Plugin): void => {
  expect(loadContentOf(theme(contextWith([])))).toThrow(
    new RegExp(RESOLVER_PLUGIN),
  );
  expect(loadContentOf(theme(contextWith([RESOLVER_PLUGIN])))).toThrow(
    COMPONENT_PAGE,
  );
  expect(() =>
    loadContentOf(theme(contextWith([RESOLVER_PLUGIN, COMPONENT_PAGE])))(),
  ).not.toThrow();
};

describe('theme-iframe 入口：层目录、自己那一条 `iframe:`、两条安装前提', () => {
  it('层目录与 TS 主题路径都指向包根那份 theme/', () => {
    const plugin = iframeTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-iframe');
    expectThemePath(plugin, 'theme-iframe');
  });

  it('loadContent：缺解析器、缺 component-page 都当场点名，装齐了才放行', () => {
    expectPrerequisites(iframeTheme);
  });

  it('loadContent：只交自己那把 `iframe:` —— 三条 API 层由各包自己的 loadContent 交', () => {
    // 这一层收缩成「嵌外部站点那一个框」：组件是本包主题层那份 `ExternalFrame`，跨源的地址算法
    // 留在本包（`lib/external-url.ts`）；同源那份框、握手与框内页面都在机制层里，卸载本包
    // 三条 API 层照常可用（那条验收见 e2e）。
    expect(contributedOf(iframeTheme(contextWith()))).toEqual({
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

describe('theme-component-page 入口：层目录、一列清单、以及本层那一条安装前提', () => {
  it('层目录与 TS 主题路径都指向包根那份 theme/', () => {
    const plugin = componentPageTheme(contextWith(), {
      components: [{ id: 'site/report', component: '@theme/ReportPage' }],
      rules: [{ key: 'report', component: 'site/report', match: 'options' }],
    });

    expect(plugin.name).toBe(COMPONENT_PAGE);
    expectThemePath(plugin, 'theme-component-page');
  });

  it('loadContent 只查解析器插件：缺了当场点名，装了才放行', () => {
    // 本层不引公共那份 `assertThemePrerequisites()`（那是给**交规则的层**用的，本层自己
    // 就是被要求的那一个）；它唯一的真前提是解析器插件，那条判据住在解析器包自己那里。
    expect(loadContentOf(componentPageTheme(contextWith([])))).toThrow(
      new RegExp(RESOLVER_PLUGIN),
    );
    expect(() =>
      loadContentOf(componentPageTheme(contextWith()))(),
    ).not.toThrow();
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
  });

  it('contentLoaded 交出的是配置期校验并补齐过的那一份', () => {
    const plugin = avatarTheme(contextWith(), {
      userApi: '/api/me',
      request: { debounceWait: 0 },
    });

    expect(globalDataOf(plugin)).toEqual({
      enableHostname: '',
      userApi: '/api/me',
      anonymousName: '未命名',
      defaultAvatar: '',
      request: {
        debounceLeading: true,
        debounceWait: 0,
        throttleWait: 300,
        cacheKey: 'avatar-user',
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

  it('缺解析器：当场点名；装齐了就放行（这一层不要求注册 theme-iframe）', () => {
    const missing = avatarTheme(contextWith([]));
    expect(() => loadContentOf(missing)()).toThrow(new RegExp(RESOLVER_PLUGIN));

    const complete = avatarTheme(contextWith([RESOLVER_PLUGIN]));
    expect(() => loadContentOf(complete)()).not.toThrow();
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

  it('loadContent：交出 diff 那一格，组件写的是 @theme/DiffPage', () => {
    expect(contributedOf(diffTheme(contextWith()))).toEqual({
      components: [{ id: 'diff', component: '@theme/DiffPage' }],
      // `any` 判法：`diff:` 那三种写下的开关形状（`true` / 路径 / `{ old, new }`）都算命中
      // （见 component-page 的判据）。
      rules: [{ key: 'diff', match: 'any', component: 'diff' }],
    });
  });

  it('缺解析器、缺 component-page 都当场点名；装齐了才放行', () => {
    expectPrerequisites(diffTheme);
  });
});

describe('theme-erd 入口', () => {
  it('层目录与名字', () => {
    const plugin = erdTheme(contextWith());

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-erd');
    expectThemePath(plugin, 'theme-erd');
  });

  it('loadContent：交出 dbml_json 那一格，组件写的是 @theme/ErdPage', () => {
    expect(contributedOf(erdTheme(contextWith()))).toEqual({
      components: [{ id: 'erd', component: '@theme/ErdPage' }],
      // `any` 判法：`dbml_json` 是 loader 追加的那条导出，恒是一个对象（见 component-page 的判据）。
      rules: [{ key: 'dbml_json', match: 'any', component: 'erd' }],
    });
  });

  it('缺解析器、缺 component-page 都当场点名', () => {
    expectPrerequisites(erdTheme);
  });
});

describe('theme-git-badge 入口：层目录、样式表与前置检查', () => {
  /**
  这一层要改 `siteConfig.markdown.parseFrontMatter`，所以站点上下文里得有一份 `markdown`；
  那一格长什么样与本组断言无关，只要解析器在那儿就行。
  */
  const contextWithMarkdown = (plugins: unknown[]): LoadContext =>
    ({
      siteDir: repoRoot,
      siteConfig: {
        baseUrl: '/',
        plugins,
        themes: [],
        future: { faster: { lightningCssMinimizer: true } },
        markdown: {
          parseFrontMatter: async () => ({ frontMatter: {}, content: '' }),
        },
      },
    }) as unknown as LoadContext;

  it('层目录与客户端模块：层是包根那份 `theme/`，样式表是包根那份', () => {
    const plugin = gitBadgeTheme(contextWithMarkdown([RESOLVER_PLUGIN]));

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-git-badge');
    expectThemePath(plugin, 'theme-git-badge');

    const modules = clientModulesOf(plugin);
    expect(modules).toEqual([
      path.join(pkgDir('theme-git-badge'), 'styles', 'git-badge.css'),
    ]);
    expect(existsSync(modules[0]!)).toBe(true);
  });

  it('缺解析器：当场点名（两格是未编译的 TS 源码，由它那条 babel 规则编）', () => {
    const missing = gitBadgeTheme(contextWithMarkdown([]));
    expect(() => loadContentOf(missing)()).toThrow(new RegExp(RESOLVER_PLUGIN));

    const complete = gitBadgeTheme(contextWithMarkdown([RESOLVER_PLUGIN]));
    expect(() => loadContentOf(complete)()).not.toThrow();
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

  it('loadContent：交出 markmap 那一格，组件写的是 @theme/MarkmapPage', () => {
    expect(contributedOf(markmapTheme(contextWith()))).toEqual({
      components: [{ id: 'markmap', component: '@theme/MarkmapPage' }],
      // `options` 判法：`markmap: true` 与选项对象都算命中（见 component-page 的判据）。
      rules: [{ key: 'markmap', match: 'options', component: 'markmap' }],
    });
  });

  it('缺解析器、缺 component-page 都当场点名；装齐了才放行', () => {
    expectPrerequisites(markmapTheme);
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

    expect(plugin.name).toBe(REDOC);
    expectThemePath(plugin, 'theme-redoc');
  });

  it('loadContent：缺解析器、缺 component-page 都当场点名；装齐了才放行', () => {
    // 这一层不再要求 `theme-iframe`：外层框、那条握手循环与框内那份文档都在机制层里，
    // 卸载 `theme-iframe` 这一层照常可用。缺 component-page 则是交出的那一列永远不会被用到。
    expectPrerequisites(redocTheme);
  });

  it('loadContent：交出 `redoc` 那一格，框内取 @theme/RedocView', () => {
    expect(contributedOf(redocTheme(contextWith()))).toEqual({
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

    expect(plugin.name).toBe(SCALAR);
    expectThemePath(plugin, 'theme-scalar');
  });

  it('loadContent：缺解析器、缺 component-page 都当场点名；装齐了才放行', () => {
    expectPrerequisites(scalarTheme);
  });

  it('loadContent：交出 `scalar` 那一格，框内取 @theme/ScalarView', () => {
    expect(contributedOf(scalarTheme(contextWith()))).toEqual({
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

    expect(plugin.name).toBe(STOPLIGHT);
    expectThemePath(plugin, 'theme-stoplight');
  });

  it('loadContent：缺解析器、缺 component-page 都当场点名；装齐了才放行', () => {
    expectPrerequisites(stoplightTheme);
  });

  it('loadContent：交出 `stoplight` 那一格，框内取 @theme/StoplightView', () => {
    expect(contributedOf(stoplightTheme(contextWith()))).toEqual({
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
