import { exec } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { Plugin } from '@docusaurus/types';

import prevLayerResolverPlugin, {
  type PrevLayerResolverOptions,
} from '../packages/plugin-prev-layer-resolver/src/index.mts';
import { PrevLayerResolverPlugin } from '../packages/plugin-prev-layer-resolver/src/resolver.mts';

import { mkdtempReal } from './helpers.mts';
import type { DocusaurusPluginLike, ThemeLayer } from './helpers.mts';

const siteDir = path.resolve(import.meta.dirname, '..');

const execAsync = promisify(exec);

/**
插件入口的类型是 Docusaurus 的 `PluginInitializer`（可返回 Promise），
测试里只需要「可调用 + await 后得到 Plugin」。
*/
type PrevLayerResolverInitializer = (
  context: unknown,
  options?: PrevLayerResolverOptions,
) => Promise<Plugin>;
const createPlugin =
  prevLayerResolverPlugin as unknown as PrevLayerResolverInitializer;

/**
极简「主题插件实例」：只有 getThemePath 才有资格进层栈
*/
function themePlugin(name: string, themeDir: string): DocusaurusPluginLike {
  return { name, path: path.dirname(themeDir), getThemePath: () => themeDir };
}

/**
用桩插件列表构造插件，避开真实的 Docusaurus 复算。

给的是一个**真实的主题插件实例**（`getThemePath()` 指向本仓库的 `src/theme`），
所以层栈是真的从它推出来的 —— 接线那一层断掉时用例会红。
*/
function loadPlugin(): Promise<Plugin> {
  return createPlugin(
    { siteDir },
    {
      plugins: [themePlugin('stub', path.join(siteDir, 'src/theme'))],
    },
  );
}

/**
`configureWebpack` 的第三个参数（`utils`）：插件用它取官方那条 babel loader（`getJSLoader`）。
测试里只需要这一格，给个哨兵。
*/
const utilsStub = {
  getJSLoader: () => ({ loader: 'js-loader' }),
} as never;

describe('plugin-prev-layer-resolver 插件接线', () => {
  it('插件初始化返回可用的 Plugin 形状，且不声明任何客户端模块', async () => {
    const plugin = await loadPlugin();
    // name 与包名同标识符：既是官方眼里的唯一标识，也不再长得像主题插件；
    // 且不顶 `@docusaurus/` 域（第三方包不该暗示官方血源）
    expect(plugin.name).toBe(
      '@show-docs/docusaurus-plugin-prev-layer-resolver',
    );
    expect(plugin.name.startsWith('theme-')).toBe(false);
    expect(typeof plugin.configureWebpack).toBe('function');
    // 不声明 getClientModules = 不注入任何运行时模块（默认即无）
    expect('getClientModules' in plugin).toBe(false);
  });

  it('`@theme-prev` 被认领并改写；官方别名从不拦截', async () => {
    const { makeFixtureSite } = await import('./helpers.mts');
    const site = makeFixtureSite();
    try {
      // 两层：内层提供 Logo，外层导入 → specifier 被认领并改写成内层的文件
      const inner = site.layer('theme-inner', { Logo: '' });
      const outer = site.layer('theme-outer', { Logo: '' });
      const resolver = captureResolver(
        await createPlugin(
          { siteDir: site.root },
          {
            plugins: [
              themePlugin('theme-inner', inner.owner),
              themePlugin('theme-outer', outer.owner),
            ],
          },
        ),
      );
      const issuer = path.join(outer.owner, 'Logo', 'index.js');
      expect(
        resolver.resolveTarget({ request: '@theme-prev/Logo', issuer }),
      ).not.toBeNull();
      // 官方别名从不拦截
      expect(
        resolver.resolveTarget({ request: '@theme-original/Logo', issuer }),
      ).toBeNull();
    } finally {
      site.cleanup();
    }
  });

  /** 官方 merge 对数组是 concat（成因见 `index.mts`）：这里用**真实的 webpack-merge** 跑一遍拼接结果 */
  it('只返回自己那一个 resolver，交由官方 merge 拼接（不复制已有 resolver）', async () => {
    const plugin = await loadPlugin();
    const existing = { name: 'existing-resolver' };
    const config = {
      resolve: { alias: { '@theme/Logo': '/x' }, plugins: [existing] },
    };
    const result = plugin.configureWebpack!(
      config as never,
      false,
      utilsStub,
      undefined,
    );
    // 返回值里只有我们自己，且**不改动**入参
    expect((result?.resolve?.plugins ?? []) as unknown[]).toHaveLength(1);
    expect(((result?.resolve?.plugins ?? []) as unknown[])[0]).toBeInstanceOf(
      PrevLayerResolverPlugin,
    );
    expect(config.resolve.plugins[0]).toBe(existing);

    // 官方合流之后：已有项**只出现一次**，且我们的 resolver 也在
    const { mergeWithCustomize } = await loadWebpackMerge();
    const merged = mergeWithCustomize({})(config, result);
    const mergedPlugins = merged.resolve?.plugins ?? [];
    expect(mergedPlugins.filter((p) => p === existing)).toHaveLength(1);
    expect(
      mergedPlugins.some((p) => p instanceof PrevLayerResolverPlugin),
    ).toBe(true);
  });

  /**
  这一格与层栈无关：家族里那些**未编译**的 TS 源码随包发布，官方那条 babel 规则把整个
  `node_modules` 排除在外 —— 由本插件补一条规则按 `@show-docs` 这个 scope 认领。
  判据的细节在 `test/source-js-rule.test.mts`，这里钉「这条规则由本插件产出」。
  */
  it('补上那条 TS 源码规则：官方不编的 node_modules 里的 @show-docs 源码归它', async () => {
    const plugin = await loadPlugin();
    const result = plugin.configureWebpack!(
      {} as never,
      false,
      utilsStub,
      undefined,
    );

    const rules = (result?.module?.rules ?? []) as Array<{
      test: RegExp;
      include: (file: string) => boolean;
      use: unknown[];
    }>;
    expect(rules).toHaveLength(1);
    const rule = rules[0]!;
    expect(rule.test.test('index.tsx')).toBe(true);
    expect(rule.use).toEqual([{ loader: 'js-loader' }]);
    expect(
      rule.include(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/theme/MarkmapPage/index.tsx',
      ),
    ).toBe(true);
    expect(
      rule.include('/repo/packages/theme-markmap/theme/MarkmapPage/index.tsx'),
    ).toBe(false);
  });

  it('层栈为空时告警一次，且不改写任何 request', async () => {
    // 插件列表为空 → 层栈为空：这条分支要说明「@theme-prev/* 全部交回官方解析」，
    // 而不是静默继续（症状是真实的 Module not found，最难查）。
    const warn = vi.fn();
    const plugin = await createPlugin(
      { siteDir: '/nonexistent-site-xyz' },
      { plugins: [], logger: { warn } },
    );
    const resolver = captureResolver(plugin);
    // 两条告警：① 推导阶段「拿不到 core 内部 API」；② 消费阶段「层栈为空」。
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('没拿到主题层栈'))).toBe(true);
    expect(
      resolver.resolveTarget({
        request: '@theme-prev/Logo',
        issuer: '/x/y.js',
      }),
    ).toBeNull();
  });

  it('config.resolve 缺失时不崩溃', async () => {
    const plugin = await loadPlugin();
    expect(() =>
      plugin.configureWebpack!({} as never, false, utilsStub, undefined),
    ).not.toThrow();
  });

  it('真实站点 + 默认推导：插件初始化阶段就拿回按声明顺序的插件列表', async () => {
    // 走**生产入口**（不传 `plugins`）：默认推导那一支只有这条路能走到，注入桩的用例都绕过了它。
    // 断言真实站点推出来的层栈含 `tools/` 那三层（`configureWebpack` 第二参数是 isServer 那个坑见 docs）。
    const plugin = await createPlugin({ siteDir });
    const rel = captureResolver(plugin).layers.map((l) =>
      path.relative(siteDir, l.owner),
    );
    expect(rel.filter((o) => o.startsWith('tools'))).toEqual([
      path.join('tools', 'theme-a', 'theme'),
      path.join('tools', 'theme-b', 'theme'),
      path.join('tools', 'theme-c', 'theme'),
    ]);
    expect(rel).toContain(path.join('src', 'theme'));
  }, 60_000);

  it('层栈直接从插件列表推导：theme 增删 / 调序都不用改配置', async () => {
    // 只钉**接线**：注入的插件列表会变成层栈（不改配置即是「免清单」）；
    // 逐层下降的语义由 resolver.test.mts 的「四层链逐层下降」穷举，此处不复述。
    const { makeFixtureSite } = await import('./helpers.mts');
    const site = makeFixtureSite();
    try {
      const a = site.layer('theme-a', { Logo: '' });
      const b = site.layer('theme-b', { Logo: '' });
      const owners = await discoverLayerOwners(site.root, [
        themePlugin('theme-a', a.owner),
        themePlugin('theme-b', b.owner),
      ]);
      // 顺序 = 插件声明顺序（站点层自动补在最外；theme-fallback 定位不到时不在栈里）
      expect(owners.filter((o) => o === a.owner || o === b.owner)).toEqual([
        a.owner,
        b.owner,
      ]);
    } finally {
      site.cleanup();
    }
  });
});

/**
取官方 `applyConfigureWebpack` 用的那个 `webpack-merge`（同一份依赖解析）。
用 `@docusaurus/core` 的位置做基准，保证版本与官方一致。
*/
async function loadWebpackMerge(): Promise<{
  mergeWithCustomize: (opts: Record<string, unknown>) => (
    a: unknown,
    b: unknown,
  ) => {
    resolve?: { plugins?: unknown[] };
  };
}> {
  const { createRequire } = await import('node:module');
  const req = createRequire(
    path.resolve(
      siteDir,
      'node_modules/@docusaurus/core/lib/webpack/configure.js',
    ),
  );
  return req('webpack-merge') as never;
}

/**
取插件推出来的层栈 owner 列表。

判据走 `layersFromPlugins` —— **层栈推导的真实路径**，而不是 resolver 上一个
「给测试读层栈」的出口：那种出口只有测试在用，且它读的那份与「推导出来的那份」
是两个产地。站点目录与插件列表都由插件自己的初始化输入决定（`siteDir` 是模块级
常量，注入桩的用例走的也是同一个站点），因此这里重建这两样即可。
*/
async function discoverLayerOwners(
  siteDir: string,
  plugins?: DocusaurusPluginLike[],
): Promise<string[]> {
  const { layersFromPlugins } =
    await import('../packages/plugin-prev-layer-resolver/src/layers.mts');
  const { PluginDiscovery } =
    await import('../packages/plugin-prev-layer-resolver/src/plugins.mts');
  const list =
    plugins ??
    (await new PluginDiscovery(siteDir, { warn: () => {} }).discover());
  return layersFromPlugins({ siteDir, plugins: list }).map((l) => l.owner);
}

/**
取插件注入的 resolver 实例
*/
function captureResolver(plugin: Plugin): PrevLayerResolverPlugin {
  const result = plugin.configureWebpack!(
    { resolve: { alias: {} } } as never,
    false,
    utilsStub,
    undefined,
  );
  const plugins = (result?.resolve?.plugins ?? []) as unknown[];
  const found = plugins.find((p) => p instanceof PrevLayerResolverPlugin);
  if (!found) throw new Error('没有找到 PrevLayerResolverPlugin');
  return found as PrevLayerResolverPlugin;
}

describe('注入的 resolver：能力自检与失败告警', () => {
  const fakeLayersDir = mkdtempReal(path.join(os.tmpdir(), 'resolver-hooks-'));

  /**
  造一个「层」：owner 目录必须真的存在（issuer 归属按目录前缀判定）
  */
  function siteLayerFor(name: string): ThemeLayer {
    const owner = path.join(fakeLayersDir, name);
    fs.mkdirSync(path.join(owner, 'Logo'), { recursive: true });
    fs.writeFileSync(path.join(owner, 'Logo', 'index.js'), 'export default 1');
    return { name, owner, kind: 'plugin', exists: true };
  }

  const layers = [siteLayerFor('a'), siteLayerFor('b')];
  afterAll(() => fs.rmSync(fakeLayersDir, { recursive: true, force: true }));

  /**
  造一个假的 webpack resolver，把 tap 到的 handler 取出来
  */
  function tapApply(
    r: PrevLayerResolverPlugin,
    opts: {
      ensureHookThrows?: boolean;
      doResolveImpl?: (...args: never[]) => void;
    } = {},
  ): {
    handler?: (req: unknown, ctx: unknown, cb: (...a: never[]) => void) => void;
  } {
    const box: {
      handler?: (
        req: unknown,
        ctx: unknown,
        cb: (...a: never[]) => void,
      ) => void;
    } = {};
    r.apply({
      getHook: () => ({
        tapAsync: (
          _name: string,
          fn: (req: unknown, ctx: unknown, cb: (...a: never[]) => void) => void,
        ) => {
          box.handler = fn;
        },
      }),
      ensureHook: (name: string) => {
        if (opts.ensureHookThrows) throw new Error(`no such hook: ${name}`);
        return name;
      },
      doResolve: opts.doResolveImpl ?? (() => {}),
    } as never);
    return box;
  }

  it('没有 internal-resolve hook → 能力自检告警并整体禁用（不再静默）', () => {
    const warn = vi.fn();
    const r = new PrevLayerResolverPlugin({ layers, logger: { warn } });
    const box = tapApply(r, { ensureHookThrows: true });
    // 判据取**行为**：自检失败即不 tap 任何 hook（整条 `@theme-prev/*` 交回官方解析），
    // 而不是再对外暴露一个「我禁用了没有」的字段 —— 那个字段只有测试看。
    expect(box.handler, '自检失败后不该再 tap').toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]![0])).toContain('internal-resolve');
  });

  it('apply() 里改写逻辑抛错时告警（不再被 catch {} 吞掉）', () => {
    const warn = vi.fn();
    const [, b] = layers;
    const r = new PrevLayerResolverPlugin({ layers, logger: { warn } });
    const box = tapApply(r);
    // 让 resolveTarget 抛错，模拟「改写逻辑自己炸了」
    r.resolveTarget = () => {
      throw new Error('inner boom');
    };
    const callback = vi.fn();
    box.handler!(
      {
        request: '@theme-prev/Logo',
        context: { issuer: path.join(b!.owner, 'Logo', 'index.js') },
      },
      { stack: null },
      callback as never,
    );
    expect(callback).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]![0])).toContain('inner boom');
  });
});

describe('构建脚本与 CI 护栏', () => {
  it('pnpm start 会先编译核心包（否则改源码后 start 用旧产物）', () => {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(import.meta.dirname, '..', 'package.json'),
        'utf8',
      ),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.start).toContain('build:core');
  });

  it('站点根不是 ESM 包：不写 "type": "module"，配置靠扩展名拿 ESM', () => {
    // 这条钉的是 `.docusaurus/` 里 `require.resolveWeak` 报错的根因不复发。
    // webpack 判型的口径是「扩展名 + 最近 `package.json` 的 `type`」：根上写了
    // `"type": "module"`，Docusaurus 生成的 `.docusaurus/*.js`（CJS 风格）就会被
    // 判成 ESM，那行 `require.resolveWeak` 原样进产物、SSG 求值即抛。
    // 判型口径决定了这只能靠**根上不写 `type`** 来避免，改写法补不回来。
    const pkg = JSON.parse(
      fs.readFileSync(path.join(siteDir, 'package.json'), 'utf8'),
    ) as { type?: string };
    expect(
      pkg.type,
      '站点根写了 "type": "module" 会让 require.resolveWeak 复发',
    ).toBeUndefined();

    // 去掉根的 `type` 后，ESM 只能靠扩展名声明：配置是 `.mjs`、侧栏是 `.mts`。
    // 站点有**两棵内容根**：`packages/`（插件与基础设施）与 `themes/`（带渲染器的主题包，
    // 挂在 `/themes` 前缀下）。每一棵都是「每个包占侧边栏一顶层格」，那一格的顶层页就是包自己的
    // `README.md`、子页是包 `docs/` 里那几页。哪一格对应哪个包因此写在侧栏文件里，而两份侧栏
    // 只扫目录、不抄包清单（抄一份清单，新增一个包就要回来改第二处 —— 和主页卡片同一个道理）：
    // 扫描逻辑住在仓库根的 `sidebars-lib.mts`，两棵根各叫一次。
    const config = fs.readFileSync(
      path.join(siteDir, 'docusaurus.config.mjs'),
      'utf8',
    );
    for (const root of ['packages', 'themes']) {
      expect(
        config,
        `docsScope('${root}') 应在配置里：内容根由那一格工厂转述，别处不该再出现裸的 path 字面量`,
      ).toContain(`docsScope('${root}')`);
    }
    expect(config, '徽标那一份实例要把两棵根都转述给它').toContain(
      "[docsScope('packages'), docsScope('themes')]",
    );
    expect(config, '每棵根各点自己那份侧栏文件').toContain(
      "sidebarPath: './sidebars.mts'",
    );
    expect(config, 'themes 那棵根要有自己的侧栏文件').toContain(
      "sidebarPath: './sidebars-themes.mts'",
    );
    // 两份侧栏都只叫共享 helper；扫描（`readdirSync`）只在 helper 里出现一次。
    // 第二棵根一旦抄了一份带 `readdirSync` 的清单，两棵根的口径就会各自漂移。
    for (const file of ['sidebars.mts', 'sidebars-themes.mts']) {
      const sidebars = fs.readFileSync(path.join(siteDir, file), 'utf8');
      expect(sidebars, `${file} 应经共享 helper 得到包清单`).toContain(
        'packageCategories(',
      );
      expect(
        sidebars,
        `${file} 不该自己扫目录：扫描逻辑两棵根只留一份`,
      ).not.toContain('.readdirSync(');
      expect(
        sidebars,
        `${file} 不该出现手写的包路径：清单一旦写死，新增包就会漏进站点`,
      ).not.toMatch(/['"`]theme\/theme-/);
    }
    expect(
      fs.readFileSync(path.join(siteDir, 'sidebars-lib.mts'), 'utf8'),
      '两棵根共用的那份扫描逻辑里应当真的在扫目录',
    ).toContain('.readdirSync(');

    // 主页是 `packages/README.md`：配置把 docs 的路由前缀挪到根，那份 frontmatter 用 `slug: /` 落到 `/`。
    // 站点侧因此不再有页面层目录 —— 再放一个 `src/pages/index.jsx` 就是和它争同一格，
    // 而「页面不是主题层」这条最容易踩的界线也就不用再解释了（见插件 README 的使用约束①）。
    expect(config).toContain("routeBasePath: '/'");
    expect(
      fs.existsSync(path.join(siteDir, 'src/pages')),
      'src/pages 已删：主页由 packages/README.md 承担，不该再有页面层',
    ).toBe(false);
    expect(
      fs
        .readFileSync(path.join(siteDir, 'packages/README.md'), 'utf8')
        .slice(0, 200),
      'packages/README.md 要有 slug: /，否则主页那一格是空的',
    ).toContain('slug: /');
    // `themes/` 那一格相反：它的内容根 README **不写** `slug:`。`README.md` 天然拿 slug `/`，
    // 而每一份 docs 实例把 slug `/` 的那一页落在**自己的** `routeBasePath` 上，于是它自动是 `/themes/`；
    // 在这里手写一条 slug 只会把这一格从 `/themes/` 挪走，或与前缀争同一格。
    expect(
      fs
        .readFileSync(path.join(siteDir, 'themes/README.md'), 'utf8')
        .slice(0, 200),
      'themes/README.md 不该写 slug:：那一格由 routeBasePath 决定',
    ).not.toContain('slug:');
    expect(config, 'themes 那棵根挂在 /themes 前缀').toContain(
      "routeBasePath: '/themes'",
    );
  });

  it('每个主题包在自己包里有一份 docs/*-demo.{md,dbml}，仓库根不再有自己的文档目录', () => {
    // 口径：`<内容根>/<name>` 那一层的触发键要有一个页面演示它，命名固定为
    // `<内容根>/<name>/docs/<name 去掉 theme- 前缀>-demo.{md,dbml}` —— 示例页跟着包走，
    // 于是它在站点里的地址就是这个文件相对**它所属那棵内容根**的路径：`packages/` 里的
    // `/theme-erd/docs/erd-demo`，`themes/` 里的 `/themes/theme-viewer/docs/viewer-demo`。
    // 新增主题包却没写示例页时这条用例变红 —— 光看 plugins 数组不知道那一层命中时长什么样。
    const themes = ['packages', 'themes'].flatMap((root) =>
      fs
        .readdirSync(path.join(siteDir, root))
        .filter((name) => name.startsWith('theme-'))
        .map((name) => `${root}/${name}`),
    );
    expect(
      themes.length,
      '两棵包根下应有主题包（少了就是根目录名写错，整族静默失覆盖）',
    ).toBeGreaterThan(0);

    // 触发条件可以是 frontmatter 的键（示例页是 `.md`），也可以是文件扩展名
    // （`theme-erd` 的示例页就是 `.dbml`）；两种都算这一层的示例页。
    const demoOf = (name: string) => `${name.slice('theme-'.length)}-demo`;

    // 两棵内容根的落地页都只写 `<DocCardList />`（不接 items）：卡片就是各自那一页在**本实例**
    // 侧边栏里的兄弟项，而那份根级清单由侧栏文件扫目录得到，所以清单不该在文档里抄第二份。
    for (const file of ['packages/README.md', 'themes/README.md']) {
      const home = fs.readFileSync(path.join(siteDir, file), 'utf8');
      expect(home, `${file} 要渲染卡片列表`).toContain('<DocCardList />');
      expect(
        home,
        `${file} 的卡片列表交给侧边栏自动生成，手写 items 等于把清单抄第二份`,
      ).not.toContain('items=');
    }

    // 仓库根不再有 `docs/`：示例页与维护者文档都跟着包走，主页也在 `packages/` 那一格里。
    // 这里断言「不存在」而不是数包里的文件 —— 后者整条用例已经在做，重复一遍只是第二处要改的地方。
    expect(
      fs.existsSync(path.join(siteDir, 'docs')),
      '站点根下的 docs/ 应已删空：往这里放一份，就是把它从包里搬回站点、顶层页与子页那棵树跟着散架',
    ).toBe(false);

    for (const pkg of themes) {
      const name = pkg.slice(pkg.indexOf('/') + 1);
      const base = path.join(siteDir, pkg, 'docs', demoOf(name));
      const file = [`${base}.md`, `${base}.dbml`].find((candidate) =>
        fs.existsSync(candidate),
      );
      expect(
        file,
        `${pkg} 缺示例页 ${pkg}/docs/${demoOf(name)}.md 或 ${demoOf(name)}.dbml`,
      ).toBeDefined();
      // 这一页 frontmatter 的 `description:` 是它在包那一格里（侧边栏子项）的说明来源。
      expect(
        fs.readFileSync(file!, 'utf8').slice(0, 400),
        `${pkg}/docs/${path.basename(file!)} 的 frontmatter 要有 description:`,
      ).toContain('description:');
      // 顶层页是这个包的 README：没有它，这一格在站点里就没有落点。
      expect(
        fs.existsSync(path.join(siteDir, pkg, 'README.md')),
        `${pkg} 缺 README.md：它在站点里的顶层页就是这份文档`,
      ).toBe(true);
    }
  });

  it('仓库有 CI 配置且至少跑 pnpm verify', () => {
    // CI 从 CNB（`.cnb.yml`）迁到了 GitHub Actions（`.github/workflows/`）—— 护栏跟着认
    // 工作流目录，且至少有一个工作流跑 `pnpm verify`：只跑 `test` 不够，
    // typecheck / lint / 版本一致性 / build / 覆盖率红线都在 `pnpm verify` 里。
    const dir = path.resolve(import.meta.dirname, '..', '.github', 'workflows');
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
    expect(files.length, '.github/workflows 下应有工作流文件').toBeGreaterThan(
      0,
    );
    const runsVerify = files.filter((f) =>
      fs.readFileSync(path.join(dir, f), 'utf8').includes('pnpm verify'),
    );
    expect(
      runsVerify,
      '至少一个工作流应运行 pnpm verify（只跑 test 会漏掉 typecheck/lint/build/覆盖率红线）',
    ).not.toHaveLength(0);
  });

  // 分包只有一个事实：目录里有 package.json、清单收下它、包名解析得到。三者缺一个，
  // 「按包名加载」就退化成构建时才报的 `Cannot find module`。
  it('分包三件套齐全：package.json 存在、packages 清单收下、包名真的能解析', () => {
    // 目录清单是**扫出来的**，不是手抄的（与侧栏文件同一口径）：手抄那版漏过
    // `themes/theme-git-badge` —— 站点正是按包名加载它的，漏了这条用例就正好丢
    // 掉它要防的那一格（装包时红，而不是拖到 `docusaurus build` 才炸 `Cannot find module`）。
    // 三组都要在：`themes/` 那棵包根漏进来，那四个包就没人管版本一致性、也没人验解析。
    const subpackages = ['packages', 'themes', 'tools']
      .flatMap((group) =>
        fs
          .readdirSync(path.join(siteDir, group), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(group, entry.name)),
      )
      // 「有没有 `package.json`」是「是不是包」的唯一判据：`tools/scripts/` 就在这一格被挡掉。
      .filter((dir) => fs.existsSync(path.join(siteDir, dir, 'package.json')));
    // 「有没有 `package.json`」这一判据真的在挡东西：`tools/scripts/` 是目录，但不是包。
    expect(fs.existsSync(path.join(siteDir, 'tools', 'scripts'))).toBe(true);
    expect(subpackages).not.toContain(path.join('tools', 'scripts'));
    // 扫空了这条用例就是空跑，所以先钉一句「三边都扫到了包」。
    for (const group of ['packages', 'themes', 'tools']) {
      expect(
        subpackages.filter((d) => d.startsWith(group)),
        `${group}/ 下应扫到包：扫不到就是这棵根没接进来看`,
      ).not.toHaveLength(0);
    }
    const names: string[] = [];
    for (const dir of subpackages) {
      const file = path.join(siteDir, dir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        name?: string;
      };
      expect(pkg.name, `${dir} 的包名`).toMatch(/^@show-docs\//);
      names.push(pkg.name!);
    }
    const yml = fs.readFileSync(
      path.join(siteDir, 'pnpm-workspace.yaml'),
      'utf8',
    );
    expect(yml).toMatch(/^packages:/m);
    for (const group of ['packages', 'themes', 'tools']) {
      expect(
        yml,
        `workspace 清单应收下 ${group}/*：漏一棵，那棵包根的四个包不受 syncpack 管`,
      ).toContain(`${group}/*`);
    }

    // 解析**按 Node 的 ESM 规则**走：写了 `exports` 就只认它（`packages/` 下那些包的出口是
    // `dist/index.mjs`），没写的才退回 `main`（`tools/` 那三个假主题都是 `index.mts`）。
    // 这里只问「解析得到没有」，
    // 真正能不能加载由 `pnpm build` 兜 —— 但解析这一步在装包时就该红，不该拖到构建期。
    const from = pathToFileURL(path.join(siteDir, 'c.js')).href;
    for (const name of names) {
      expect(
        () => import.meta.resolve(name, from),
        `${name} 应能解析（用它的 importer 必须声明 workspace:^ 依赖，否则链接不会建）`,
      ).not.toThrow();
    }
  });

  it('发布出去的包里没有构建期缓存（`.tsbuildinfo` 那类）', async () => {
    // 判据落在**真的会被发出去的那份清单**上：`files` 只写了目录名，里面的东西全都会跟着走 ——
    // 构建期缓存（`.tsbuildinfo`）就是这么混进 tarball 的（一次 92 KB 的陈旧文件）。
    // 走真的打包器问它「发出去的有哪些」，不自己复刻一遍 glob 语义。
    const dirs = ['packages', 'themes'].flatMap((group) =>
      fs
        .readdirSync(path.join(siteDir, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(siteDir, group, entry.name))
        .filter((dir) => fs.existsSync(path.join(dir, 'package.json'))),
    );

    expect(dirs.length, '两棵包根下应有若干包').toBeGreaterThan(0);

    const packed = await Promise.all(
      dirs.map(async (dir) => {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
        ) as { private?: boolean };

        // 私有的包不发出去，也就没有「发出去的清单」这一格
        if (pkg.private) {
          return { dir, files: [] as string[] };
        }

        // `pnpm pack --dry-run --json` 就是发布那一步（不落 tarball）。
        // Windows 上 `pnpm` 是 `.cmd`，`execFile` 不拼 `PATHEXT`、spawn 不了它 —— 走 shell。
        // 参数是写死的常量，命令串里没有别的东西进去。
        const { stdout } = await execAsync('pnpm pack --dry-run --json', {
          cwd: dir,
          maxBuffer: 10 * 1024 * 1024,
        });
        const raw = stdout.trim();
        const json = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'));

        return {
          dir,
          files: (JSON.parse(json) as { files: { path: string }[] }).files.map(
            (file) => file.path,
          ),
        };
      }),
    );

    for (const { dir, files } of packed) {
      expect(
        files.filter((file) => file.endsWith('.tsbuildinfo')),
        `${path.relative(siteDir, dir)} 发出去的清单里不该有构建期缓存`,
      ).toEqual([]);
    }
  });

  it('站点按**包名**加载插件，而不是相对路径', () => {
    // 相对路径与包名指向同一个文件，但只有包名这版证明「移动目录不用改配置」。
    const config = fs.readFileSync(
      path.join(siteDir, 'docusaurus.config.mjs'),
      'utf8',
    );
    for (const name of [
      '@show-docs/docusaurus-plugin-lazy-compilation',
      '@show-docs/docusaurus-plugin-prev-layer-resolver',
      '@show-docs/theme-a',
      '@show-docs/theme-b',
      '@show-docs/theme-c',
    ]) {
      expect(config, `${name} 应按包名出现`).toContain(`'${name}'`);
    }
    expect(config).not.toMatch(/require\.resolve\('\.\/tools\//);
  });

  it('核心包声明了 peerDependencies（把无声漂移变成装包时可见）', () => {
    // 判据落在**被消费的那个包**上：站点根是私有 app，它没有下游，peer 写在根上是空声明。
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(
          import.meta.dirname,
          '..',
          'packages/plugin-prev-layer-resolver/package.json',
        ),
        'utf8',
      ),
    ) as { peerDependencies?: Record<string, string> };
    expect(pkg.peerDependencies?.['@docusaurus/core']).toBeTruthy();
    expect(pkg.peerDependencies?.webpack).toBeTruthy();
  });
});
