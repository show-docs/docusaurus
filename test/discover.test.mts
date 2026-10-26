import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeCore, makePluginSite } from './helpers.mts';

const { PluginDiscovery } =
  await import('../packages/plugin-prev-layer-resolver/src/plugins.mts');
const { layersFromPlugins } =
  await import('../packages/plugin-prev-layer-resolver/src/layers.mts');

// 一次插件初始化 = 一个实例，同一实例只推导一次；测试里每处新建实例 = 每次重新初始化。

const discoverPlugins = (
  dir: string,
  logger?: { warn?: (...a: unknown[]) => void },
) => new PluginDiscovery(dir, logger ?? console).discover();

/**
假 core 的两个入口的最短可用形态：`loadContext` 只要回一个带 `siteDir` 的对象，
`loadPluginConfigs` 的回值由各用例自己给。重复了七次，抽出来一份。
*/
const FAKE_SITE =
  'export const loadContext = async ({ siteDir }) => ({ siteDir });\n';
const FAKE_CONFIGS = 'export const loadPluginConfigs = async () => [];\n';
const siteDir = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

// `discoverPlugins`：复用官方 `loadContext` + `loadPluginConfigs` 拿回官方顺序的列表。
// 不包装 `loadThemeAliases` 截获入参（真实 build 里从未生效），也不从别名表反推（会丢中间层）。
describe('discoverPlugins：用官方函数拿回官方顺序的插件列表', () => {
  it('真实站点：拿到的主题插件顺序与官方 loadThemeAliases 入参一致', async () => {
    const plugins = await discoverPlugins(siteDir);
    expect(plugins).toBeTruthy();

    // 官方视角：直接问 Docusaurus 要 plugins 列表
    const { loadSite } = await import('@docusaurus/core/lib/server/site.js');
    const site = await loadSite({ siteDir, outDir: 'build' });

    const themePathOf = (p: {
      path?: string;
      getThemePath?: () => string | undefined;
    }): string | null => {
      if (!p.getThemePath || !p.path) return null;
      const themePath = p.getThemePath();
      return themePath ? path.resolve(p.path, themePath) : null;
    };
    const ours = plugins!
      .map((p) => themePathOf(p))
      .filter((p): p is string => Boolean(p));
    const official = site.props.plugins
      .map((p) => themePathOf(p))
      .filter((p): p is string => Boolean(p));

    expect(ours).toEqual(official);
    // 只保留「有主题」的插件
    expect(ours.every(() => plugins!.some((x) => x.getThemePath))).toBe(true);

    // 每个插件构造时都拿到「官方给的那份 options」（归一化口径由下一个 describe 钉住）
    const declared = plugins ?? [];
    for (const p of declared) {
      expect(
        p.options,
        `plugin ${p.name} 应有官方给的那份 options`,
      ).toBeTruthy();
    }
  }, 60_000);

  it('推出来的层栈是本仓库的 4 层链，含被官方别名表吞掉的 theme-b', async () => {
    // 层栈不能建在 `context.plugins` 上（不存在，写反过一次 —— 见 ../packages/plugin-prev-layer-resolver/README.md）：
    // 判据走**真实推导**，拿真实 `loadContext` 的**原样返回值**喂进去也必须推出同一个结果。
    // 改回 `context.plugins` 时 theme-b 会丢（构建即 Module not found）。
    const { loadContext } = await import('@docusaurus/core/lib/server/site.js');
    const context = (await loadContext({ siteDir })) as Record<string, unknown>;
    expect('plugins' in context).toBe(false);

    const owners = layersFromPlugins({
      siteDir,
      plugins: await discoverPlugins(siteDir),
    }).map((l) => path.relative(siteDir, l.owner));
    expect(owners.at(-1)).toBe(path.join('src', 'theme'));
    // 用户插件主题：顺序 = plugins 数组顺序，且 theme-b 不能被跳过
    expect(owners.filter((o) => o.startsWith('tools'))).toEqual([
      path.join('tools', 'theme-a', 'theme'),
      path.join('tools', 'theme-b', 'theme'),
      path.join('tools', 'theme-c', 'theme'),
    ]);
    // preset 主题在内层
    expect(owners.findIndex((o) => o.includes('theme-classic'))).toBeLessThan(
      owners.indexOf(path.join('tools', 'theme-a', 'theme')),
    );
  }, 120_000);

  it('不会实例化本插件自己（否则会递归推导）', async () => {
    // 判据是**入口的真实路径与本模块相同**：软链 / 别名安装 / 改名都认得出来，
    // 漏判会递归推导 → OOM。它是整条推导唯一的防递归承重墙。
    const plugins = await discoverPlugins(siteDir);
    expect(
      plugins!.some(
        (p) => p.name === '@show-docs/docusaurus-plugin-prev-layer-resolver',
      ),
    ).toBe(false);
  }, 60_000);

  it('站点不存在时返回 null 并告警，而不是抛错；同一实例第二次只吃缓存', async () => {
    const warn = vi.fn();
    const discovery = new PluginDiscovery('/nonexistent-site-xyz', { warn });
    expect(await discovery.discover()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(await discovery.discover()).toBeNull();
    // null 是「降级结果」（不是异常），同一实例内第二次直接吃缓存、不重复告警。
    // 想让它重推就是再初始化一次插件（dev server 改配置走的正是这条路）。
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('一次初始化一次推导', () => {
  it('同一实例只推导一次（同一个 Promise）；新实例 = 新推导', async () => {
    const logger = { warn: () => {} };
    const one = new PluginDiscovery(siteDir, logger);
    const first = one.discover();
    expect(one.discover()).toBe(first);
    const another = new PluginDiscovery(siteDir, logger);
    expect(another.discover(), '新实例必须是新的一次推导').not.toBe(first);
    await Promise.all([first, another.discover()]);
  }, 60_000);
});

describe('插件构造失败：一律告警，一次构建聚合成一条', () => {
  it('构造函数抛错即告警（async reject 同样）；多个失败只出一条汇总', async () => {
    // 为何一律告警见 `plugins.mts` 的 catch：无法区分「本来就没主题」与「有主题但构造
    // 失败」，漏报 = 层栈少一层且完全静默；聚合对治噪音（逐条报就是每次构建刷 N 行）。
    const site = makePluginSite('fixture-theme', '.mjs')
      .addRaw(
        'fixture-plugin-a',
        'module.exports = () => { throw new Error("boom-a"); };',
      )
      .addRaw(
        'fixture-plugin-b',
        'module.exports = async () => { throw new Error("boom-b"); };',
      );
    try {
      const warn = vi.fn();
      await discoverPlugins(site.siteDir, { warn });
      expect(warn, '两个失败也只是一条汇总').toHaveBeenCalledTimes(1);
      // 汇总行 `  - <入口>: <原因>`：入口是绝对路径，正则钉住入口与原因在同一条里
      const message = String(warn.mock.calls[0]![0]);
      expect(message).toContain('插件构造失败');
      expect(message).toMatch(/fixture-plugin-a[^\n]*: Error: boom-a/);
      expect(message).toMatch(/fixture-plugin-b[^\n]*: Error: boom-b/);
    } finally {
      site.cleanup();
    }
  }, 60_000);
});

/**
使用约束 ②「主题插件模块的整个加载期需无副作用」—— 用真实依赖钉住它的**来源**。

契约（`../packages/plugin-prev-layer-resolver/README.md` 实测表）：一次 build 里 ESM 主题插件被加载 **2 次**
（官方 `initPlugins` 一次 + 我们推导层栈一次 → 两份独立模块状态），CJS 只 **1 次**（共享实例），
但两者都**构造两次**。

只断言「`loadFreshModule(path)` 连调两次会重新求值」是不够的 —— 那只是上游的缓存口径，
与「我们到底有没有多加载一次」无关：上游哪天复用缓存、或我们把推导改成复用官方那份实例，
约束的前提就没了而测试照绿。所以走完整链路，用计数器读**实际次数**。
*/
describe('模块加载次数：ESM 顶层两次 / CJS 一次，两者都构造两次', () => {
  let site: ReturnType<typeof makePluginSite>;
  const read = (key: string): number =>
    (globalThis as unknown as Record<string, number>)[key] ?? 0;

  beforeEach(() => {
    site = makePluginSite('theme-esm', '.mjs').add('theme-cjs', '.cjs');
  });
  afterEach(() => {
    site.cleanup();
  });

  it('官方半只加载一次；加上我们那半后 ESM 变两次 / CJS 仍一次，且两者都被构造两次', async () => {
    const g = globalThis as unknown as Record<string, number>;
    for (const plugin of ['theme-esm', 'theme-cjs']) {
      g[site.counters.load(plugin)] = 0;
      g[site.counters.construct(plugin)] = 0;
    }
    // 官方那半 = `initPlugins`：loadContext → loadPluginConfigs → 逐个构造。
    // 基准取 core 的真实位置（pnpm 下站点根解析不到 core 的 lib 子路径），
    // 并且**不借实现里的私有函数**，免得实现错了测试跟着错。
    const coreLib = path.join(
      path.dirname(require.resolve('@docusaurus/core/package.json')),
      'lib',
    );
    const mod = async (rel: string, name: string): Promise<unknown> => {
      const m: Record<string, unknown> = await import(
        pathToFileURL(path.join(coreLib, rel)).href
      );
      return m[name];
    };
    const loadContext = (await mod('server/site.js', 'loadContext')) as (p: {
      siteDir: string;
    }) => Promise<unknown>;
    const loadPluginConfigs = (await mod(
      'server/plugins/configs.js',
      'loadPluginConfigs',
    )) as (c: unknown) => Promise<
      {
        plugin?: (c: unknown, o: unknown) => Promise<unknown>;
        options?: unknown;
      }[]
    >;
    const context = await loadContext({ siteDir: site.siteDir });
    const configs = await loadPluginConfigs(context);
    for (const config of configs) {
      if (typeof config.plugin === 'function')
        await config.plugin(context, config.options ?? {});
    }
    const counts = (): number[] => [
      read(site.counters.load('theme-esm')),
      read(site.counters.load('theme-cjs')),
      read(site.counters.construct('theme-esm')),
      read(site.counters.construct('theme-cjs')),
    ];
    // 官方半各加载、构造一次（loadPluginConfigs 内部 loadFreshModule 给每个模块一份）
    expect(counts()).toEqual([1, 1, 1, 1]);

    const found = await discoverPlugins(site.siteDir);
    expect(found?.map((p) => p.name)).toEqual(['theme-esm', 'theme-cjs']);

    // 我们为拿 getThemePath() 又跑了一次 loadPluginConfigs：ESM 被重新求值（第二份独立状态），
    // CJS 复用同一实例 —— 于是顶层副作用只对 ESM 跑两遍，这就是那句约束的全部依据。
    // 构造则与模块形态无关：两者都被构造第二次。
    expect(counts()).toEqual([2, 1, 2, 2]);
  }, 60_000);
});

/**
上游 core 的导出形状 / 结构变化时的降级。

**不能**改真实 core 的入口文件：`import()` 按 URL 缓存模块，同一个 worker 里前面
已经加载过它，再写文件也不会重新求值（用例会「看起来测了，其实没测」）。
所以这里给站点**复制一份 core 的 lib 树**并改掉入口：路径全新 → URL 全新 → 真的重新加载。
*/
describe('core 结构 / 导出形状变化时的降级', () => {
  let site: ReturnType<typeof makePluginSite>;
  let fakeRoot = '';

  beforeEach(() => {
    fakeRoot = '';
    site = makePluginSite('real-theme', '.mjs');
  });
  afterEach(() => {
    site.cleanup();
  });

  it('`loadContext` / `loadPluginConfigs` 只挂在 default 上时也能取到（ESM 互操作）', async () => {
    // 上游改打包方式（只留 default）的形态：没有 `?? pick(mod.default)` 那一半就整个
    // 拿不到这两个函数，`discoverPlugins` 直接降级成 null —— 层栈静默全空，构建却成功。
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'export default { loadContext: async ({ siteDir }) => ({ siteDir }) };\n',
      configs: `const plugin = () => ({ name: 'from-default', getThemePath: () => './theme' });
export default { loadPluginConfigs: async () => [{ plugin, entryPath: '/fake/from-default.js' }] };\n`,
    });

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(
      plugins?.map((p) => p.name),
      'default 上挂的两个函数都必须被取到',
    ).toEqual(['from-default']);
  }, 60_000);

  it('核心里这两个入口缺失（加载即抛）时返回 null 并告警', async () => {
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'throw new Error("no loadContext here");\n',
      configs: 'throw new Error("no loadPluginConfigs here");\n',
    });

    const warn = vi.fn();
    expect(await discoverPlugins(siteDir, { warn })).toBeNull();
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain(
      '拿不到 Docusaurus 的 loadContext',
    );
  }, 60_000);

  it('loadContext / loadPluginConfigs 抛错时返回 null 并告警，不把异常抛给构建', async () => {
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'export const loadContext = async () => { throw new Error("context boom"); };\n',
      configs: FAKE_CONFIGS,
    });

    const warn = vi.fn();
    expect(await discoverPlugins(siteDir, { warn })).toBeNull();
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain(
      '读取 Docusaurus 插件列表失败',
    );
  }, 60_000);

  it('configs 里的非函数 plugin / 本插件自身 / 无主题 / 无入口插件一律跳过', async () => {
    const { siteDir } = site;
    const selfEntry = path.resolve(
      import.meta.dirname,
      '..',
      'packages',
      'plugin-prev-layer-resolver',
      'src',
      'plugins.mts',
    );
    fakeRoot = fakeCore(siteDir, {
      site: FAKE_SITE,
      configs: `export const loadPluginConfigs = async () => [
  { plugin: null, entryPath: '/fake/null.js' },
  { plugin: () => ({ name: 'no-theme' }), entryPath: '/fake/no-theme.js' },
  { plugin: () => ({ name: 'self', getThemePath: () => './theme' }), entryPath: ${JSON.stringify(selfEntry)} },
  { plugin: () => { throw new Error('inline boom'); } },
];\n`,
    });

    // 四种都不进层栈、都不打断推导；内联插件没有入口，既不能被认成「自己」，标签也不是 undefined
    const warn = vi.fn();
    expect(await discoverPlugins(siteDir, { warn })).toEqual([]);
    expect(String(warn.mock.calls[0]![0])).toContain('<inline plugin>');
  }, 60_000);

  it.each([
    ['大版本过低', '2.4.3'],
    // 「同 major、minor 更低」才是更常见的情形（升级 core 的 minor 忘了看下限）
    ['同 major 但 minor 过低', '3.0.1'],
    ['同 minor 但 patch 过低', '3.9.1'],
  ])(
    'core 版本过低时告警（不阻断）：%s',
    async (_label, version) => {
      // 内部 API（loadPluginConfigs / theme 别名规则 / internal-resolve hook）没有稳定性承诺，
      // 但「装错版本」不该只表现为「链悄悄不生效」。这里造一份版本号偏低的 core
      // （假 core 的 package.json 就是拿来干这个的），断言告警文案里带上版本号与下限。
      const { siteDir } = site;
      fakeRoot = fakeCore(siteDir, {
        site: FAKE_SITE,
        configs: FAKE_CONFIGS,
      });
      fs.writeFileSync(
        path.join(fakeRoot, 'package.json'),
        JSON.stringify({ name: '@docusaurus/core', version }),
      );

      const warn = vi.fn();
      await discoverPlugins(siteDir, { warn });
      const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(messages).toContain(version);
      expect(messages).toContain('低于已验证的');
    },
    60_000,
  );

  it('正好落在支持下限（3.9.2）时不告警', async () => {
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: FAKE_SITE,
      configs: FAKE_CONFIGS,
    });
    fs.writeFileSync(
      path.join(fakeRoot, 'package.json'),
      JSON.stringify({ name: '@docusaurus/core', version: '3.9.2' }),
    );

    const warn = vi.fn();
    await discoverPlugins(siteDir, { warn });
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain(
      '低于已验证的',
    );
  }, 60_000);

  it('版本号里的 minor 缺失 / 非数字时安静跳过（当作「不知道」，不制造噪音）', async () => {
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: FAKE_SITE,
      configs: FAKE_CONFIGS,
    });
    fs.writeFileSync(
      path.join(fakeRoot, 'package.json'),
      JSON.stringify({ name: '@docusaurus/core' }),
    );

    const warn = vi.fn();
    await discoverPlugins(siteDir, { warn });
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain(
      '低于已验证的',
    );
  }, 60_000);

  it('插件工厂返回 null / 非对象时同样跳过（官方允许用 null 自禁）', async () => {
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: FAKE_SITE,
      configs: `export const loadPluginConfigs = async () => [
  { plugin: () => null, entryPath: '/fake/null-plugin.js' },
  { plugin: () => 42, entryPath: '/fake/number-plugin.js' },
];\n`,
    });

    expect(await discoverPlugins(siteDir, { warn: vi.fn() })).toEqual([]);
  }, 60_000);
});

describe('插件 options 校验：声明值 + 官方 normalizePluginOptions 归一化', () => {
  let site: ReturnType<typeof makePluginSite>;
  let fakeRoot = '';

  beforeEach(() => {
    fakeRoot = '';
    site = makePluginSite('options-theme', '.mjs');
  });
  afterEach(() => {
    site.cleanup();
  });

  // 「core 能定位、但它那份 utils-validation 取不到」的两种形态：加载即抛 / 导出形状变了。
  // 都退直通 —— 退回 undefined 会让插件自己的 `validate()` 直接炸，那才是本条钉的事。
  // 够得到的理由：假 core 夹具下 `resolveCoreRoot(siteDir)` 指向的就是**假 core**，
  // 所以「它那份 utils-validation」指的是我们摆在它里面的那一份。
  it.each([
    ['加载即抛', 'throw new Error("broken utils-validation");\n'],
    ['导出形状不对', 'exports.normalizePluginOptions = 42;\n'],
  ])(
    'core 能定位、但它那份 utils-validation %s → 退回直通（校验失效，不炸）',
    async (_label, body) => {
      const { siteDir } = site;
      fakeRoot = fakeCore(siteDir, {
        site: FAKE_SITE,
        // 校验函数查找顺序照官方：先看 pluginModule.module.default.validateOptions
        configs: `const factory = () => ({ name: 'theme-with-broken-validation', getThemePath: () => './theme' });
const validateOptions = ({ validate, options }) => validate(null, options);
export const loadPluginConfigs = async () => [
  { plugin: factory, entryPath: '/fake/broken.js', pluginModule: { module: { default: { validateOptions } } } },
];\n`,
      });
      const utils = path.join(
        fakeRoot,
        'node_modules',
        '@docusaurus',
        'utils-validation',
      );
      fs.mkdirSync(utils, { recursive: true });
      fs.writeFileSync(
        path.join(utils, 'package.json'),
        JSON.stringify({
          name: '@docusaurus/utils-validation',
          main: 'index.js',
        }),
      );
      fs.writeFileSync(path.join(utils, 'index.js'), body);

      const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
      // 退直通 → 直通把 schema（这里是 null）当函数调会抛错 → 校验抛错 → 退声明值。
      // 钉的是「层不消失、构建不被打断」，而不是某个内部函数的返回值。
      expect(plugins?.map((p) => p.name)).toEqual([
        'theme-with-broken-validation',
      ]);
      expect(plugins?.[0]?.options).toEqual({ id: 'default' });
    },
    60_000,
  );

  it('真站点的 classic：声明值是字符串的 customCss 被 normalizePluginOptions 归一化成数组', async () => {
    // 判据是**上游口径**而不是我们有没有调用某个导出：官方插件构造函数拿到的是
    // 「Joi 校验 + 默认值归一化之后」的 options，而 classic 的 `customCss` 声明值是字符串。
    // 没跑校验时它会原样是字符串 —— 依赖选项默认值的主题会因此**算错层路径**。
    // 这一条同时覆盖「取到的是官方实现」（直通把 Joi 对象当函数调会抛错 → 退声明值 → 仍是字符串）。
    const plugins = await discoverPlugins(siteDir);
    const classic = plugins!.find((p) => p.name === 'docusaurus-theme-classic');
    expect(
      Array.isArray(classic?.options?.customCss),
      '只有官方 schema 校验会归一化成数组',
    ).toBe(true);
  }, 60_000);

  it('内联函数插件的静态 validateOptions 会被跑到（官方第二条查找路）', async () => {
    // 回归：曾经的实现只查 `pluginModule`（按字符串 / 数组声明的插件），第二条查的是一个
    // 官方返回形状里不存在的字段 —— **内联声明**的主题插件（config 里直接写函数）因此
    // 整体丢默认值，层路径静默算错。官方 `getOptionValidationFunction` 对无 pluginModule
    // 的 config 看的是插件函数自己的静态属性 `plugin.validateOptions`。
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: FAKE_SITE,
      configs: `const factory = () => ({ name: 'inline-theme', getThemePath: () => './theme' });
factory.validateOptions = ({ options }) => ({ ...options, dir: 'from-static-validate' });
export const loadPluginConfigs = async () => [{
  plugin: factory,
  entryPath: '/fake/inline.js',
  options: {},
}];\n`,
    });

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(plugins?.map((p) => p.name)).toEqual(['inline-theme']);
    // 校验后的 options 必须进到实例上（构造函数拿到的就是归一化之后的那份）
    expect(plugins?.[0]?.options).toEqual({ dir: 'from-static-validate' });
  }, 60_000);

  it('插件自己的 validateOptions 抛错时退回声明值（不打断整个插件列表推导）', async () => {
    // 校验函数抛错必须被吞掉；位置照官方——这里走**内联函数插件**那条查找路
    // （静态属性在插件函数上），与上面「字符串声明」那条路（pluginModule.module.default）互补。
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: FAKE_SITE,
      configs: `const factory = () => ({ name: 'boom-theme', getThemePath: () => './theme' });
factory.validateOptions = () => { throw new Error('validate boom'); };
export const loadPluginConfigs = async () => [{
  plugin: factory,
  entryPath: '/fake/boom.js',
  options: { title: 'declared' },
}];\n`,
    });

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(
      plugins?.map((p) => p.name),
      '校验抛错不该让这一层消失',
    ).toEqual(['boom-theme']);
    // 退回声明值：字段原样保留，只补 id（官方在没有校验函数时也这么补）
    expect(plugins?.[0]?.options, '退回声明值 + 补 id').toEqual({
      title: 'declared',
      id: 'default',
    });
  }, 60_000);
});

/**
官方 `initializePlugin` 在调构造函数**之前**，会把每个插件 `validateThemeConfig` 的
返回值并进 `context.siteConfig.themeConfig`（core `server/plugins/init.js`）——
`theme-classic` 的构造函数就读这份 themeConfig（`themeConfig.prism.additionalLanguages`，
站点不声明 `prism` 时直接 TypeError）。发现这条路漏了这一步，那个主题插件会整个构造
失败、从层栈里**静默消失**：实测正是本仓库配置去掉 `prism` 后 theme-classic 消失、
两条真站点用例飘红的原因（层少一层比多一行日志严重得多）。

假 core 的 utils-validation 要自己摆一份（pnpm 下站点根解析不到 core 的那份，与
「插件 options 校验」两节同一条口径）；摆不摆 `normalizeThemeConfig` 就是「官方实现
取得到 / 取不到」两档。
*/
describe('插件构造前的 themeConfig 合并：官方 doValidateThemeConfig 同序', () => {
  let site: ReturnType<typeof makePluginSite>;
  let fakeRoot = '';

  /** 构造函数看到的 themeConfig 由插件实例带出来（发现路径原样 spread 实例） */
  const seenOf = (plugin: unknown): unknown =>
    (plugin as { seen?: unknown } | null | undefined)?.seen;

  /**
  摆一份假 `@docusaurus/utils-validation`（放假 core 下，就近 shadow 真的那份）。
  @param withThemeConfig 是否导出 `normalizeThemeConfig`（不导出 = 官方实现取不到）
  */
  function fakeUtilsValidation(withThemeConfig: boolean): void {
    const utils = path.join(
      fakeRoot,
      'node_modules',
      '@docusaurus',
      'utils-validation',
    );
    fs.mkdirSync(utils, { recursive: true });
    fs.writeFileSync(
      path.join(utils, 'package.json'),
      JSON.stringify({
        name: '@docusaurus/utils-validation',
        main: 'index.js',
      }),
    );
    // 官方口径：schema 由插件给、validate 负责跑它并填默认值。夹具里 schema 就是函数，
    // 所以这份 validate 也只是「把 schema 当函数调」—— 判据是合并行为，不是 Joi 本身。
    fs.writeFileSync(
      path.join(utils, 'index.js'),
      `exports.normalizePluginOptions = (schema, options) => schema(options);\n${
        withThemeConfig
          ? 'exports.normalizeThemeConfig = (schema, themeConfig) => schema(themeConfig);\n'
          : ''
      }`,
    );
  }

  beforeEach(() => {
    fakeRoot = '';
    site = makePluginSite('theme-config', '.mjs');
  });
  afterEach(() => {
    site.cleanup();
  });

  it('内联函数插件的静态 validateThemeConfig 会被跑到，并入构造函数看到的 themeConfig', async () => {
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'export const loadContext = async ({ siteDir }) => ({ siteDir, siteConfig: { themeConfig: { declared: 1 } } });\n',
      configs: `const factory = (context) => ({
  name: 'inline-theme-config',
  seen: context.siteConfig.themeConfig,
  getThemePath: () => './theme',
});
factory.validateThemeConfig = ({ validate, themeConfig }) =>
  validate((tc) => ({ ...tc, fromStatic: true }), themeConfig);
export const loadPluginConfigs = async () => [{
  plugin: factory,
  entryPath: '/fake/inline-theme-config.js',
  options: {},
}];\n`,
    });
    fakeUtilsValidation(true);

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(plugins?.map((p) => p.name)).toEqual(['inline-theme-config']);
    // 构造函数看到的 = 声明值 + 本插件 validateThemeConfig 的返回值（官方同序）
    expect(seenOf(plugins?.[0])).toEqual({ declared: 1, fromStatic: true });
  }, 60_000);

  it('按字符串 / 数组声明的插件：module.default.validateThemeConfig 会被跑到', async () => {
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'export const loadContext = async ({ siteDir }) => ({ siteDir, siteConfig: { themeConfig: { declared: 1 } } });\n',
      configs: `const factory = (context) => ({
  name: 'module-default-theme-config',
  seen: context.siteConfig.themeConfig,
  getThemePath: () => './theme',
});
const validateThemeConfig = ({ validate, themeConfig }) =>
  validate((tc) => ({ ...tc, fromDefault: true }), themeConfig);
export const loadPluginConfigs = async () => [{
  plugin: factory,
  entryPath: '/fake/module-default.js',
  options: {},
  pluginModule: { module: { default: { validateThemeConfig } } },
}];\n`,
    });
    fakeUtilsValidation(true);

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(plugins?.map((p) => p.name)).toEqual([
      'module-default-theme-config',
    ]);
    expect(seenOf(plugins?.[0])).toEqual({ declared: 1, fromDefault: true });
  }, 60_000);

  it('module.default 上没有时退回模块命名导出的 validateThemeConfig', async () => {
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'export const loadContext = async ({ siteDir }) => ({ siteDir, siteConfig: { themeConfig: { declared: 1 } } });\n',
      configs: `const factory = (context) => ({
  name: 'module-named-theme-config',
  seen: context.siteConfig.themeConfig,
  getThemePath: () => './theme',
});
const validateThemeConfig = ({ validate, themeConfig }) =>
  validate((tc) => ({ ...tc, fromNamed: true }), themeConfig);
export const loadPluginConfigs = async () => [{
  plugin: factory,
  entryPath: '/fake/module-named.js',
  options: {},
  pluginModule: { module: { default: {}, validateThemeConfig } },
}];\n`,
    });
    fakeUtilsValidation(true);

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(plugins?.map((p) => p.name)).toEqual(['module-named-theme-config']);
    expect(seenOf(plugins?.[0])).toEqual({ declared: 1, fromNamed: true });
  }, 60_000);

  it('合并是累积的：后一个插件看到前一个并入的值', async () => {
    // 官方是逐个累积合并（core 的 initializePlugin 按 configs 顺序推进）；这里钉住
    // 同一顺序 —— 少了它，后一个插件的 themeConfig 就退回「只有声明值」。
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'export const loadContext = async ({ siteDir }) => ({ siteDir, siteConfig: { themeConfig: { declared: 1 } } });\n',
      configs: `const factory = (name) => (context) => ({
  name,
  seen: context.siteConfig.themeConfig,
  getThemePath: () => './theme',
});
const first = factory('accum-first');
first.validateThemeConfig = ({ validate, themeConfig }) =>
  validate((tc) => ({ ...tc, first: 1 }), themeConfig);
const second = factory('accum-second');
second.validateThemeConfig = ({ validate, themeConfig }) =>
  validate((tc) => ({ ...tc, second: 2 }), themeConfig);
export const loadPluginConfigs = async () => [
  { plugin: first, entryPath: '/fake/accum-first.js', options: {} },
  { plugin: second, entryPath: '/fake/accum-second.js', options: {} },
];\n`,
    });
    fakeUtilsValidation(true);

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(plugins?.map((p) => p.name)).toEqual([
      'accum-first',
      'accum-second',
    ]);
    expect(seenOf(plugins?.[0])).toEqual({ declared: 1, first: 1 });
    // 第二个构造函数看到的带着第一个并入的 first: 1
    expect(seenOf(plugins?.[1])).toEqual({
      declared: 1,
      first: 1,
      second: 2,
    });
  }, 60_000);

  it('validateThemeConfig 自己抛错时跳过合并，但层照常推导', async () => {
    // 官方那轮会在真正的构建里把同一个错报出来；推导层栈这一轮不需要它炸。
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'export const loadContext = async ({ siteDir }) => ({ siteDir, siteConfig: { themeConfig: { declared: 1 } } });\n',
      configs: `const factory = (context) => ({
  name: 'boom-theme-config',
  seen: context.siteConfig.themeConfig,
  getThemePath: () => './theme',
});
factory.validateThemeConfig = () => { throw new Error('theme config boom'); };
export const loadPluginConfigs = async () => [{
  plugin: factory,
  entryPath: '/fake/boom-theme-config.js',
  options: {},
}];\n`,
    });
    fakeUtilsValidation(true);

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(plugins?.map((p) => p.name)).toEqual(['boom-theme-config']);
    // 合并跳过：构造函数看到的是未合并的声明值
    expect(seenOf(plugins?.[0])).toEqual({ declared: 1 });
  }, 60_000);

  it('core 那份 utils-validation 取不到 normalizeThemeConfig 时整体跳过合并', async () => {
    // 没有官方的 validate，插件那份 Joi schema 没人跑 —— 与「options 校验退直通」
    // 同属「官方实现取不到」档：层照常推导，只是这一轮没有默认值可填。
    const { siteDir } = site;
    fakeRoot = fakeCore(siteDir, {
      site: 'export const loadContext = async ({ siteDir }) => ({ siteDir, siteConfig: { themeConfig: { declared: 1 } } });\n',
      configs: `const factory = (context) => ({
  name: 'no-normalize-theme-config',
  seen: context.siteConfig.themeConfig,
  getThemePath: () => './theme',
});
factory.validateThemeConfig = ({ validate, themeConfig }) =>
  validate((tc) => ({ ...tc, never: true }), themeConfig);
export const loadPluginConfigs = async () => [{
  plugin: factory,
  entryPath: '/fake/no-normalize.js',
  options: {},
}];\n`,
    });
    fakeUtilsValidation(false);

    const plugins = await discoverPlugins(siteDir, { warn: vi.fn() });
    expect(plugins?.map((p) => p.name)).toEqual(['no-normalize-theme-config']);
    expect(seenOf(plugins?.[0])).toEqual({ declared: 1 });
  }, 60_000);
});
