import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { Plugin } from '@docusaurus/types';

import prevLayerResolverPlugin, {
  type PrevLayerResolverOptions,
} from '../plugins/plugin-prev-layer-resolver/src/index.mts';
import { PrevLayerResolverPlugin } from '../plugins/plugin-prev-layer-resolver/src/resolver.mts';

import { mkdtempReal } from './helpers.mts';
import type { DocusaurusPluginLike, ThemeLayer } from './helpers.mts';

const siteDir = path.resolve(import.meta.dirname, '..');

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
      undefined as never,
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
      plugin.configureWebpack!(
        {} as never,
        false,
        undefined as never,
        undefined,
      ),
    ).not.toThrow();
  });

  it('真实站点 + 默认推导：插件初始化阶段就拿回按声明顺序的插件列表', async () => {
    // 走**生产入口**（不传 `plugins`）：默认推导那一支只有这条路能走到，注入桩的用例都绕过了它。
    // 断言真实站点推出来的层栈含 demo 三层（`configureWebpack` 第二参数是 isServer 那个坑见 docs）。
    const plugin = await createPlugin({ siteDir });
    const rel = captureResolver(plugin).layers.map((l) =>
      path.relative(siteDir, l.owner),
    );
    expect(rel.filter((o) => o.startsWith('demo'))).toEqual([
      path.join('demo', 'theme-a', 'theme'),
      path.join('demo', 'theme-b', 'theme'),
      path.join('demo', 'theme-c', 'theme'),
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
    await import('../plugins/plugin-prev-layer-resolver/src/layers.mts');
  const { PluginDiscovery } =
    await import('../plugins/plugin-prev-layer-resolver/src/plugins.mts');
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
    undefined as never,
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

    // 去掉根的 `type` 后，ESM 只能靠扩展名声明：配置是 `.mjs`。
    // 侧栏不再需要 `sidebars.mjs`：docs 插件拿不到 `sidebarPath` 时按 docs 目录自动生成，
    // 因此这里反过来钉住「配置里不再指回 sidebars」—— 指回去就等于把删掉的文件又请回来。
    const config = fs.readFileSync(
      path.join(siteDir, 'docusaurus.config.mjs'),
      'utf8',
    );
    expect(config).not.toContain('sidebars');

    // 主页是 `docs/intro.md`：配置把 docs 的路由前缀挪到根，那份 frontmatter 用 `slug: /` 落到 `/`。
    // 站点侧因此不再有页面层目录 —— 再放一个 `src/pages/index.jsx` 就是和它争同一格，
    // 而「页面不是主题层」这条最容易踩的界线也就不用再解释了（见插件 README 的使用约束①）。
    expect(config).toContain("routeBasePath: '/'");
    expect(
      fs.existsSync(path.join(siteDir, 'src/pages')),
      'src/pages 已删：主页由 docs/intro.md 承担，不该再有页面层',
    ).toBe(false);
    expect(
      fs
        .readFileSync(path.join(siteDir, 'docs/intro.md'), 'utf8')
        .slice(0, 200),
      'docs/intro.md 要有 slug: /，否则主页那一格是空的',
    ).toContain('slug: /');
  });

  it('每个主题包有一份 docs/*-demo.{md,dbml}，主页的卡片列表由侧边栏自动给', () => {
    // 口径：`theme/<name>` 那一层的触发键要有一个页面演示它，命名固定为
    // `docs/<name 去掉 theme- 前缀>-demo.{md,dbml}`。新增主题包却没写示例页时这条用例变红
    // —— 光看 plugins 数组不知道那一层命中时长什么样。
    // theme-all 是拆分前的源目录：不在 workspace（`pnpm-workspace.yaml` 的
    // `!theme/theme-all`）、也不接进站点，不该要求它有一份示例页。
    const themeNames = fs
      .readdirSync(path.join(siteDir, 'theme'))
      .filter((name) => name.startsWith('theme-') && name !== 'theme-all');
    expect(themeNames.length, 'theme/ 下应有主题包').toBeGreaterThan(0);

    // 触发条件可以是 frontmatter 的键（示例页是 `.md`），也可以是文件扩展名
    // （`theme-erd` 的示例页就是 `.dbml`）；两种都算这一层的示例页。
    const demoOf = (name: string) => `${name.slice('theme-'.length)}-demo`;
    const intro = fs.readFileSync(path.join(siteDir, 'docs/intro.md'), 'utf8');

    // 主页只写 `<DocCardList />`（不接 items）：卡片就是这一页在侧边栏里的兄弟项，
    // 而侧边栏由 docs 插件按 `docs/` 目录自动生成，所以清单不该在文档里抄第二份。
    expect(intro).toContain('<DocCardList />');
    expect(
      intro,
      '主页的卡片列表交给侧边栏自动生成，手写 items 等于把清单抄第二份',
    ).not.toContain('items=');

    for (const name of themeNames) {
      const base = path.join(siteDir, 'docs', demoOf(name));
      const file = [`${base}.md`, `${base}.dbml`].find((candidate) =>
        fs.existsSync(candidate),
      );
      expect(
        file,
        `${name} 缺示例页 docs/${demoOf(name)}.md 或 ${demoOf(name)}.dbml`,
      ).toBeDefined();
      // 卡片上那行说明取自 frontmatter 的 `description:`（DocCard 用它作兜底），
      // 没写就只剩一个标题卡片。
      expect(
        fs.readFileSync(file!, 'utf8').slice(0, 400),
        `docs/${path.basename(file!)} 的 frontmatter 要有 description:，主页卡片才有说明`,
      ).toContain('description:');
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
    const subpackages = [
      'plugins/plugin-prev-layer-resolver',
      'demo/theme-a',
      'demo/theme-b',
      'demo/theme-c',
      'theme/theme-markmap',
      'theme/theme-iframe',
      'theme/theme-stoplight',
      'theme/theme-redoc',
      'theme/theme-scalar',
    ];
    const names: string[] = [];
    for (const dir of subpackages) {
      // 只在 `packages:` 里写不算数：没有 package.json 的目录是「目录」，不是包。
      const file = path.join(siteDir, dir, 'package.json');
      expect(fs.existsSync(file), `${dir}/package.json 应存在`).toBe(true);
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
    expect(yml).toContain('plugins/*');
    expect(yml).toContain('demo/*');
    expect(yml).toContain('theme/*');

    // 解析**按 Node 的 ESM 规则**走：写了 `exports` 就只认它（core 包的出口是 `dist/index.mjs`），
    // 没写的才退回 `main`（demo 三个包是 `index.mts`）。这里只问「解析得到没有」，
    // 真正能不能加载由 `pnpm build` 兜 —— 但解析这一步在装包时就该红，不该拖到构建期。
    const from = pathToFileURL(path.join(siteDir, 'c.js')).href;
    for (const name of names) {
      expect(
        () => import.meta.resolve(name, from),
        `${name} 应能解析（用它的 importer 必须声明 workspace:^ 依赖，否则链接不会建）`,
      ).not.toThrow();
    }
  });

  it('站点按**包名**加载插件，而不是相对路径', () => {
    // 相对路径与包名指向同一个文件，但只有包名这版证明「移动目录不用改配置」。
    const config = fs.readFileSync(
      path.join(siteDir, 'docusaurus.config.mjs'),
      'utf8',
    );
    for (const name of [
      '@show-docs/docusaurus-plugin-prev-layer-resolver',
      '@show-docs/theme-a',
      '@show-docs/theme-b',
      '@show-docs/theme-c',
    ]) {
      expect(config, `${name} 应按包名出现`).toContain(`'${name}'`);
    }
    expect(config).not.toMatch(/require\.resolve\('\.\/demo\//);
  });

  it('核心包声明了 peerDependencies（把无声漂移变成装包时可见）', () => {
    // 判据落在**被消费的那个包**上：站点根是私有 app，它没有下游，peer 写在根上是空声明。
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(
          import.meta.dirname,
          '..',
          'plugins/plugin-prev-layer-resolver/package.json',
        ),
        'utf8',
      ),
    ) as { peerDependencies?: Record<string, string> };
    expect(pkg.peerDependencies?.['@docusaurus/core']).toBeTruthy();
    expect(pkg.peerDependencies?.webpack).toBeTruthy();
  });
});
