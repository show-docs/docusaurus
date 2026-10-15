import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  makeFixtureSite,
  fakePlugin,
  fakeUtils,
  mkdtempReal,
} from './helpers.mjs';

const {
  layersFromPlugins,
  resolvePluginThemePath,
  resolveCoreRoot,
  resolveCoreModule,
  resolveFallbackDir,
  resolveFromCore,
  normalizeLayerPath,
} = await import('../plugins/plugin-prev-layer-resolver/src/layers.mjs');

/**
造一份最小可用的假 core：只要「包根 + 锚点文件（lib/webpack/aliases/index.js）+
lib/client/theme-fallback 目录」三样，`resolveCoreRoot` / `resolveCoreModule` /
`resolveFallbackDir` 的定位口径就全部走到。EXPORTS 那份额外补 `exports` 字段。
*/
function fakeCoreAt(root: string): {
  core: string;
  aliases: string;
  fallback: string;
} {
  const core = path.join(root, 'node_modules', '@docusaurus', 'core');
  const aliases = path.join(core, 'lib', 'webpack', 'aliases', 'index.js');
  const fallback = path.join(core, 'lib', 'client', 'theme-fallback');
  fs.mkdirSync(path.dirname(aliases), { recursive: true });
  fs.mkdirSync(fallback, { recursive: true });
  fs.writeFileSync(aliases, '');
  fs.writeFileSync(
    path.join(core, 'package.json'),
    JSON.stringify({ name: '@docusaurus/core' }),
  );
  return { core, aliases, fallback };
}

/**
站点主题目录名（官方 `THEME_PATH` = `'src/theme'`）。

层栈推导从官方常量读它，所以这里直接走推导结果拿这个名字 —— 不在测试里再抄一份常量。
*/
const THEME_PATH = layersFromPlugins({ siteDir: process.cwd(), plugins: [] })
  .filter((l) => l.kind === 'site')
  .map((l) => l.name.replace(/^site:/, ''))[0]!;

describe('layersFromPlugins：层栈推导（免配置清单的核心）', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('顺序与官方一致：theme-fallback → plugin 主题 → src/theme', () => {
    // theme-fallback 的位置**跟着 core 模块走**（与官方同一基准）。
    // 因此这里造一个假的 core 安装位置，并让站点 require 解析到它。
    const fallback = site.fakeCoreFallback();
    site.layer('a', { Logo: '' });
    site.siteLayer({ Logo: '' });

    const layers = layersFromPlugins({
      siteDir: site.root,
      plugins: [fakePlugin('theme-a', path.join(site.root, 'layers', 'a'))],
    });

    expect(layers.map((l) => l.owner)).toEqual([
      fallback,
      path.join(site.root, 'layers', 'a'),
      path.join(site.root, 'src', 'theme'),
    ]);
    expect(layers.map((l) => l.kind)).toEqual(['fallback', 'plugin', 'site']);
  });

  it('core 定位不到时不编造 theme-fallback（该层缺失，其余层不受影响）', () => {
    expect(resolveFallbackDir('/nonexistent-site-xyz')).toBeNull();
  });

  it('层名优先取 plugin.name，缺失时退回目录名', () => {
    const owner = site.layer('theme-a', { Logo: '' });
    // 无 name 时退回「主题目录的上级目录名」= layers
    const unnamed = layersFromPlugins({
      siteDir: site.root,
      plugins: [{ path: site.root, getThemePath: () => owner.owner }],
    });
    expect(unnamed[0]!.name).toBe('layers');
    const named = layersFromPlugins({
      siteDir: site.root,
      plugins: [fakePlugin('theme-a', owner.owner)],
    });
    expect(named[0]!.name).toBe('theme-a');
  });

  it('不存在的主题目录不算一层（与官方 createAliasesForTheme 一致）', () => {
    const layers = layersFromPlugins({
      siteDir: site.root,
      plugins: [
        {
          name: 'ghost',
          path: site.root,
          getThemePath: () => path.join(site.root, 'nope'),
        },
        fakePlugin('theme-a', site.layer('a', { Logo: '' }).owner),
      ],
    });
    expect(layers.map((l) => l.name)).toEqual(['theme-a']);
  });

  it('没有 getThemePath 的插件（如 plugin-prev-layer-resolver 自身）不产生层', () => {
    // 导出的只有 `layersFromPlugins` 这一条路径：`getThemePath` 缺失的三形态
    // （没有这个方法 / 返回 undefined / 插件项是 null）都不该产生层。
    const layers = layersFromPlugins({
      siteDir: site.root,
      plugins: [{ name: 'no-theme' }, null, { getThemePath: () => undefined }],
    });
    expect(layers.filter((l) => l.kind === 'plugin')).toEqual([]);
  });

  it('getThemePath 抛错的插件不会中断推导', () => {
    const good = fakePlugin('good', site.layer('good', { Logo: '' }).owner);
    const bad = {
      name: 'bad',
      path: site.root,
      getThemePath() {
        throw new Error('boom');
      },
    };
    const layers = layersFromPlugins({
      siteDir: site.root,
      plugins: [bad, good],
    });
    expect(layers.map((l) => l.name)).toEqual(['good']);
  });

  it('getThemePath 抛错且插件没有 name 时告警并继续', () => {
    const warnings: unknown[][] = [];
    const warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    expect(
      resolvePluginThemePath(
        {
          getThemePath: () => {
            throw new Error('boom');
          },
        },
        site.root,
        { warn },
      ),
    ).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]?.[0])).toContain('<unknown plugin>');
    expect(warnings[0]?.[1]).toBeInstanceOf(Error);
  });

  it('相对 getThemePath 以 plugin.path 为基准（与官方 resolve 一致）', () => {
    const pluginDir = site.root;
    const { owner } = site.layer('rel', { Logo: '' });
    const relative = path.relative(pluginDir, owner);
    expect(
      resolvePluginThemePath(
        { path: pluginDir, getThemePath: () => relative },
        site.root,
      ),
    ).toBe(owner);
  });

  it('同一目录被多个插件声明时只保留第一次（去重）', () => {
    const { owner } = site.layer('shared', { Logo: '' });
    const layers = layersFromPlugins({
      siteDir: site.root,
      plugins: [
        { name: 'first', path: site.root, getThemePath: () => owner },
        { name: 'second', path: site.root, getThemePath: () => owner },
      ],
    });
    expect(layers).toHaveLength(1);
    expect(layers[0]!.name).toBe('first');
  });

  it('src/theme 始终作为最外层哨兵层', () => {
    site.layer('a', { Logo: '' });
    site.siteLayer({ Logo: '' });
    const layers = layersFromPlugins({ siteDir: site.root, plugins: [] });
    expect(layers.at(-1)!.owner).toBe(path.join(site.root, THEME_PATH));
    expect(layers.at(-1)!.kind).toBe('site');
  });

  it('推导结果与真实 docusaurus 官方 loadThemeAliases 的前缀顺序一致', async () => {
    // 用真实 Docusaurus 的 resolvePluginThemePath 逻辑做对照：
    // 官方实现等价于 plugins.map(p => resolve(p.path, p.getThemePath())).filter(Boolean)
    const require = createRequire(import.meta.url);
    const core = require('@docusaurus/core/lib/webpack/aliases/index.js') as {
      loadThemeAliases: (args: unknown) => unknown;
    };
    expect(typeof core.loadThemeAliases).toBe('function');

    const a = site.layer('a', { Logo: '' }).owner;
    const b = site.layer('b', { Logo: '' }).owner;
    const plugins = [fakePlugin('a', a), fakePlugin('b', b)];
    // 层栈里 kind === 'plugin' 的那几层就是官方 pluginThemes 的复算结果
    const ours = layersFromPlugins({ siteDir: site.root, plugins })
      .filter((l) => l.kind === 'plugin')
      .map((l) => l.owner);
    const official = plugins
      .map((p) =>
        p.getThemePath ? path.resolve(p.path!, p.getThemePath()!) : undefined,
      )
      .filter((p): p is string => Boolean(p));
    expect(ours).toEqual(official);
  });

  it('站点层目录名读的是官方常量，而不是回退到硬编码', () => {
    // 上面只比「值」；上游当前值恰好等于硬编码兜底，两条路都能过，等于没测。
    // 判据改成「跟着上游变」：把上游常量改掉，推导出的站点层名字必须跟着改。
    // **改的是这份站点自己的 utils（`fakeUtils`），不是共享依赖**：写真实文件时
    // 「谁先读到」会变成文件执行顺序的隐性依赖（istanbul 下 `discover.test.mts`
    // 读到 `THEME_PATH='borrowed'`，站点层 `src/theme` 当场消失）。
    const require = createRequire(import.meta.url);
    const corePkg = require.resolve('@docusaurus/core/package.json');
    const realConstants = createRequire(corePkg).resolve(
      '@docusaurus/utils/lib/constants.js',
    );
    const original = fs.readFileSync(realConstants, 'utf8');
    expect(original, '上游常量定义形状变了，本用例需同步').toMatch(
      /exports\.THEME_PATH = `[^`]*`/,
    );
    const siteDir = mkdtempReal(path.join(process.cwd(), '.borrowed-theme-'));
    try {
      // 假 core（锚点 + theme-fallback 目录）+ 一份只转 `THEME_PATH` 的 utils。
      fakeCoreAt(siteDir);
      fakeUtils(
        siteDir,
        original.replace(
          /exports\.THEME_PATH = `[^`]*`/,
          "exports.THEME_PATH = 'borrowed'",
        ),
      );
      // 站点层目录名必须**存在**才会进层栈（不存在的目录不是层），所以先造出来。
      fs.mkdirSync(path.join(siteDir, 'borrowed'), { recursive: true });
      // 子进程要一份干净的模块缓存，但读的必须是**包出口所在的那份产物**：
      // 目录按包名解析出来，不在这里再抄一遍 dist 的位置。
      const entry = pathToFileURL(
        path.join(
          path.dirname(
            require.resolve('@show-docs/docusaurus-plugin-prev-layer-resolver'),
          ),
          'layers.mjs',
        ),
      ).href;
      const seen = execFileSync(
        process.execPath,
        [
          '-e',
          `import(${JSON.stringify(entry)}).then((m) => process.stdout.write(JSON.stringify(
          m.layersFromPlugins({ siteDir: ${JSON.stringify(siteDir)}, plugins: [] }).map((l) => l.name))))`,
        ],
        { encoding: 'utf8' },
      ).trim();
      expect(
        JSON.parse(seen),
        '上游改名后我们没跟着变 → 读官方常量是死代码',
      ).toEqual(['theme-fallback', 'site:borrowed']);
    } finally {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
  });
});

describe('theme-fallback 定位：跟着 core 走', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('core 模块定位：真实安装下能定位包根与内部文件', () => {
    const siteDir = path.resolve(import.meta.dirname, '..');
    const root = resolveCoreRoot(siteDir);
    expect(root, '真实安装下必须能定位 core 包根').toBeTruthy();
    expect(fs.existsSync(path.join(root!, 'package.json'))).toBe(true);
    // 内部文件走「包根 + path.join」，因此不受 exports 约束
    const aliases = resolveCoreModule(siteDir, 'webpack/aliases/index.js');
    expect(aliases).toBeTruthy();
    expect(fs.existsSync(aliases!)).toBe(true);
  });

  it('core 声明了导出限制时仍能定位（不依赖 require.resolve 穿越 exports）', () => {
    const siteDir = mkdtempReal(path.join(os.tmpdir(), 'core-exports-'));
    try {
      // 造一份「补了 exports、只导出 '.'」的 core：这正是上游未来可能做的事
      const { core, aliases, fallback } = fakeCoreAt(siteDir);
      fs.writeFileSync(
        path.join(core, 'package.json'),
        JSON.stringify({
          name: '@docusaurus/core',
          version: '3.10.2',
          exports: { '.': './lib/index.js' },
        }),
      );

      const siteRequire = createRequire(path.join(siteDir, 'noop.js'));
      // 前提校验：走 require.resolve 解析 lib 子路径在这个 core 上**确实会失败**
      expect(() =>
        siteRequire.resolve('@docusaurus/core/lib/webpack/aliases/index.js'),
      ).toThrow();

      // 但我们的定位仍然成立（package.json 兜底 + 路径遍历）
      expect(resolveCoreRoot(siteDir)).toBe(core);
      expect(resolveCoreModule(siteDir, 'webpack/aliases/index.js')).toBe(
        aliases,
      );
      expect(resolveFallbackDir(siteDir)).toBe(fallback);
    } finally {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
  });

  it('core 结构不符预期时返回 null（而不是一个不存在的路径）', () => {
    const siteDir = mkdtempReal(path.join(os.tmpdir(), 'core-nocore-'));
    try {
      expect(resolveCoreRoot(siteDir)).toBeNull();
      expect(resolveCoreModule(siteDir, 'webpack/aliases/index.js')).toBeNull();
    } finally {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
  });
});

describe('resolveCoreRoot 的路径遍历兜底', () => {
  it('站点侧 packge 解析无法定位时，靠逐级上溯仍能拿到 core 包根', () => {
    // 遍历兜底不经过 Node 解析（不受 `exports` / 自引用影响），是「core 定位不到 →
    // theme-fallback 整层消失」的最后一道保险。这里把 core 放在**站点以上**的
    // `node_modules` 里，站点目录自身没有 `node_modules` —— 上溯是唯一能找到它的路。
    const parent = mkdtempReal(path.join(os.tmpdir(), 'core-walk-'));
    try {
      const { core, aliases, fallback } = fakeCoreAt(parent);
      const siteDir = path.join(parent, 'packages', 'site');
      fs.mkdirSync(siteDir, { recursive: true });

      expect(resolveCoreRoot(siteDir), '必须靠逐级上溯找到 core').toBe(core);
      expect(resolveCoreModule(siteDir, 'webpack/aliases/index.js')).toBe(
        aliases,
      );
      expect(resolveFallbackDir(siteDir)).toBe(fallback);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('层路径归一（软链 / 不存在的目录）', () => {
  it('目录不存在时 normalizeLayerPath 退回 resolve（软链悬空不抛错）', () => {
    // pnpm 下「主题目录被删但层信息还在」是真实形态；这里只要不抛、且结果稳定可比。
    const missing = path.join(os.tmpdir(), 'definitely-missing-layer-dir-xyz');
    expect(normalizeLayerPath(missing)).toBe(path.resolve(missing));
    // 层栈里同一目录来自两个插件的去重（按真实路径）由真站点用例覆盖；
    // 这里只钉「目录不存在 → 该层不进层栈」：不存在的东西不该被当成层。
    const layers = layersFromPlugins({
      siteDir: missing,
      plugins: [fakePlugin('a', missing), fakePlugin('b', missing)],
    });
    expect(layers.map((l) => l.name)).toEqual([]);
  });
});

describe('官方常量读取失败时的兜底（不与上游耦合到崩）', () => {
  it('core 定位不到时站点层目录名退回硬编码兜底', () => {
    // 站点里没有 core（极端布局 / core 被裁剪）→ 层栈推导仍要能跑，
    // 只是站点层目录名退回官方默认值。用 `os.tmpdir()`：它的祖先链上不会有
    // 本仓库的 `node_modules`，因此这段路径真的走「core 定位不到」那支。
    const siteDir = mkdtempReal(path.join(os.tmpdir(), 'no-core-site-'));
    try {
      fs.mkdirSync(path.join(siteDir, 'src', 'theme'), { recursive: true });
      expect(
        layersFromPlugins({ siteDir, plugins: [] }).map((l) => l.name),
      ).toEqual([`site:${THEME_PATH}`]);
    } finally {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
  });

  it('core 在但 require 抛错时也退回兜底（不把构建打断）', () => {
    // 「core 定位得到、但 `createRequire` 真抛」这一格：拿一个 core 解析不出来的 id
    // （任一真实 core 都不可能 resolve `@docusaurus/definitely-missing`）。
    const siteDir = mkdtempReal(path.join(process.cwd(), '.bad-require-'));
    try {
      fs.mkdirSync(path.join(siteDir, 'src', 'theme'), { recursive: true });
      expect(
        resolveCoreRoot(siteDir),
        '本用例要求 core 是定位得到的',
      ).toBeTruthy();
      // 走层栈推导这条真实路径：站点层目录名退回兜底，而不是抛错
      expect(
        layersFromPlugins({ siteDir, plugins: [] }).map((l) => l.name),
      ).toContain('site:src/theme');
      // 直接测那一格：这次让「站点主题目录名」这条链上的 require 失败 —— 用一个
      // 只存在于 core 解析上下文之外的模块名（真实 core 的依赖里没有它）。
      expect(
        resolveFromCore(siteDir, '@docusaurus/definitely-missing'),
      ).toBeNull();
    } finally {
      fs.rmSync(siteDir, { recursive: true, force: true });
    }
  });

  it('utils 解析不到某个导出时也退回兜底（不抛）', () => {
    // `typeof utils?.THEME_PATH === 'string' ? ... : FALLBACK` 的 `:` 半支：
    // 上游若改了导出名，我们退回默认目录名而不是把构建打断。
    // 这里把假 core 的 `@docusaurus/utils` 换成一个**不导出 THEME_PATH** 的模块。
    const root = mkdtempReal(path.join(os.tmpdir(), 'utils-noconst-'));
    try {
      const coreRoot = path.join(root, 'node_modules', '@docusaurus', 'core');
      fs.mkdirSync(path.join(coreRoot, 'lib'), { recursive: true });
      fs.writeFileSync(
        path.join(coreRoot, 'package.json'),
        JSON.stringify({ name: '@docusaurus/core', version: '3.10.0' }),
      );
      const utils = path.join(root, 'node_modules', '@docusaurus', 'utils');
      fs.mkdirSync(utils, { recursive: true });
      fs.writeFileSync(
        path.join(utils, 'package.json'),
        JSON.stringify({ name: '@docusaurus/utils', main: 'index.js' }),
      );
      fs.writeFileSync(
        path.join(utils, 'index.js'),
        'exports.NOT_THEME_PATH = 1;\n',
      );

      fs.mkdirSync(path.join(root, 'src', 'theme'), { recursive: true });
      // 层栈推导走同一条路径：utils 拿不到 THEME_PATH → 站点层退回兜底目录名
      expect(
        layersFromPlugins({ siteDir: root, plugins: [] }).map((l) => l.name),
      ).toEqual(['site:src/theme']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('不存在的层目录不会被编造成一层（探针不抛错）', () => {
    // 「存在」是层栈是否成立的总开关，探针抛错等于整条推导失败。
    const missing = path.join(os.tmpdir(), 'nope-does-not-exist-xyz');
    expect(
      layersFromPlugins({
        siteDir: missing,
        plugins: [fakePlugin('a', missing), fakePlugin('b', missing)],
      }).map((l) => l.name),
    ).toEqual([]);
  });
});

describe('官方主题目录与插件入口的其它边角', () => {
  it('插件没给 path 时相对 getThemePath 以 siteDir 为基准', () => {
    // `plugin.path ?? siteDir` 的右半支：插件实例缺 path（手工构造 / 非官方加载路径）
    const siteDir = process.cwd();
    expect(
      resolvePluginThemePath({ getThemePath: () => 'src/theme' }, siteDir),
    ).toBe(normalizeLayerPath(path.join(siteDir, 'src/theme')));
  });

  it('取不到主题目录的三种形态都不算层，且不抛', () => {
    // `getThemePath` 返回空串 / 非字符串（`!themePath` 与 `typeof` 两侧）、
    // `plugins` 传 null / undefined（拿不到插件列表的降级形态）—— 一律不产生插件层。
    // 整个 `plugins` 传 null / undefined 也要走同一个出口（拿不到插件列表的降级形态）。
    const siteDir = process.cwd();
    for (const plugins of [
      [{ getThemePath: () => '' }],
      [{ getThemePath: () => 42 as never }],
      [null],
      [undefined],
      // 整个 `plugins` 缺失：`plugins ?? []` 的右半支（拿不到插件列表的降级形态）
      null,
      undefined,
    ]) {
      expect(
        layersFromPlugins({ siteDir, plugins }).filter(
          (l) => l.kind === 'plugin',
        ),
        String(plugins),
      ).toEqual([]);
    }
  });

  it('core 结构如官方所料但缺 theme-fallback 目录 → null（不编造一个不存在的路径）', () => {
    const root = mkdtempReal(path.join(os.tmpdir(), 'core-no-fallback-'));
    try {
      // 有锚点文件（aliases/index.js），但没有 client/theme-fallback
      const { core, fallback } = fakeCoreAt(root);
      fs.rmSync(fallback, { recursive: true, force: true });
      expect(resolveCoreRoot(root)).toBe(core);
      expect(resolveFallbackDir(root)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('core 包里没有 aliases 锚点文件 → null（不猜它是不是官方那份 core）', () => {
    const root = mkdtempReal(path.join(os.tmpdir(), 'core-no-anchor-'));
    try {
      const { aliases } = fakeCoreAt(root);
      fs.rmSync(aliases, { recursive: true, force: true });
      expect(resolveFallbackDir(root)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('探测函数自身的容错（外部输入 / 环境异常都不该抛）', () => {
  it('非法路径（空串 / 含 NUL）不抛：层栈推导不能因为一个路径崩', () => {
    // `''` 与含 NUL 的路径会让部分 fs 调用抛 —— 两者都必须被吞成「不存在」。
    expect(() => normalizeLayerPath('a\0b')).not.toThrow();
    const layers = layersFromPlugins({
      siteDir: '',
      plugins: [fakePlugin('a', '')],
    });
    // 空 siteDir 下不该推出任何**插件**层（那个插件目录名就是空串）。
    // 站点层与 fallback 层都是「跟着别人走」的：它们按 cwd / core 位置拼，不在本用例判据里。
    expect(layers.filter((l) => l.kind === 'plugin')).toEqual([]);
  });
});
