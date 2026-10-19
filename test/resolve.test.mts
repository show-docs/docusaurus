import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrevLayerResolverPlugin } from '../plugins/plugin-prev-layer-resolver/src/resolver.mts';

import { makeFixtureSite, type ThemeLayer } from './helpers.mts';

const { normalizeLayerPath } =
  await import('../plugins/plugin-prev-layer-resolver/src/layers.mts');
// 官方那一份「谁赢」的实现：交叉核对候选顺序时以它为基准，而不是以我们的推理为基准
const { createAliasesForTheme } =
  await import('@docusaurus/core/lib/webpack/aliases/index.js');
const {
  resolveComponentInLayer,
  findIssuerLayerIndex,
  resolveIssuer,
  isSafeComponentName,
  matchSpecifier,
} = await import('../plugins/plugin-prev-layer-resolver/src/resolve.mts');

describe('resolveComponentInLayer：层内组件定位', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('目录形式优先于单文件形式；目录不存在时单文件生效（与官方别名一致）', () => {
    const withDir = site.layer('a', { Logo: 'DIR' });
    fs.writeFileSync(path.join(withDir.owner, 'Logo.js'), 'FILE');
    expect(resolveComponentInLayer(withDir, 'Logo')).toBe(
      path.join(withDir.owner, 'Logo', 'index.js'),
    );

    const noDir = site.layer('a-file');
    fs.writeFileSync(path.join(noDir.owner, 'Logo.jsx'), 'FILE');
    expect(resolveComponentInLayer(noDir, 'Logo')).toBe(
      path.join(noDir.owner, 'Logo.jsx'),
    );
  });

  it('组件名 `index` 只有目录形式成立（层根 index.tsx 在官方是裸 @theme）', () => {
    const l0 = site.layer('root-index', {});
    fs.writeFileSync(path.join(l0.owner, 'index.tsx'), '');
    expect(resolveComponentInLayer(l0, 'index')).toBeNull();
    const layer2 = site.layer('dir-index', {});
    fs.mkdirSync(path.join(layer2.owner, 'index'), { recursive: true });
    fs.writeFileSync(path.join(layer2.owner, 'index', 'index.tsx'), '');
    expect(resolveComponentInLayer(layer2, 'index')).toBe(
      path.join(layer2.owner, 'index/index.tsx'),
    );
  });

  it('组件名支持嵌套路径；层里没有该组件 / 层不存在（exists=false）时返回 null', () => {
    const layer = site.layer('a', { 'DocItem/Footer': '' });
    expect(resolveComponentInLayer(layer, 'DocItem/Footer')).toBe(
      path.join(layer.owner, 'DocItem', 'Footer', 'index.js'),
    );
    expect(resolveComponentInLayer(layer, 'Navbar')).toBeNull();
    // exists=false / 空层对象 一律不探测文件系统，也不抛错
    const ghost: ThemeLayer = {
      name: 'ghost',
      owner: '/nope',
      exists: false,
      kind: 'plugin',
    };
    expect(resolveComponentInLayer(ghost, 'Logo')).toBeNull();
    expect(resolveComponentInLayer(null, 'Logo')).toBeNull();
    expect(
      resolveComponentInLayer({ owner: '/nope' } as ThemeLayer, ''),
    ).toBeNull();
  });
});

describe('findIssuerLayerIndex：导入者归属判定', () => {
  const layer = (name: string, owner: string): ThemeLayer => ({
    name,
    owner,
    exists: true,
    kind: 'plugin',
  });
  const realpath = normalizeLayerPath;
  const layers = [
    layer('a', '/site/plugins/a/theme'),
    layer('b', '/site/plugins/b/theme'),
    layer('site', '/site/src/theme'),
  ];

  it('精确与子路径都算命中；嵌套层取最长前缀（越具体越优先）', () => {
    expect(
      findIssuerLayerIndex(
        layers,
        '/site/plugins/b/theme/Logo/index.js',
        realpath,
      ),
    ).toBe(1);
    expect(findIssuerLayerIndex(layers, '/site/src/theme', realpath)).toBe(2);
    const nested = [
      layer('outer', '/site/plugins/x/theme'),
      layer('inner', '/site/plugins/x/theme/inner'),
    ];
    expect(
      findIssuerLayerIndex(
        nested,
        '/site/plugins/x/theme/inner/Logo/index.js',
        realpath,
      ),
    ).toBe(1);
    expect(
      findIssuerLayerIndex(
        nested,
        '/site/plugins/x/theme/Logo/index.js',
        realpath,
      ),
    ).toBe(0);
  });

  it('不在任何层内（含同名前缀不是子路径）返回 -1', () => {
    expect(
      findIssuerLayerIndex(
        layers,
        '/site/plugins/a/theme-extra/x.js',
        realpath,
      ),
    ).toBe(-1); // 同前缀但不是子路径
    expect(
      findIssuerLayerIndex(
        layers,
        '/site/node_modules/react/index.js',
        realpath,
      ),
    ).toBe(-1);
    expect(findIssuerLayerIndex(layers, '', realpath)).toBe(-1);
    expect(findIssuerLayerIndex([], '/site/src/theme/a.js', realpath)).toBe(-1);
  });

  it('相对路径会被规范化后再比较', () => {
    const rel = [layer('a', path.join(process.cwd(), 'layers', 'a'))];
    expect(
      findIssuerLayerIndex(
        rel,
        path.join(process.cwd(), 'layers', 'a', 'Logo', 'index.js'),
        realpath,
      ),
    ).toBe(0);
  });
});

describe('解析失败一律告警 / 交回官方', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('导入者属于任何层之外时告警；但官方 specifier 不因此告警', () => {
    const inner = site.layer('a', { Logo: '' });
    const outer = site.layer('b', { Logo: '' });
    const warn = vi.fn();
    const r = new PrevLayerResolverPlugin({
      layers: [inner, outer],
      logger: { warn },
    });
    const issuer = path.join(site.root, 'elsewhere/Logo/index.js');
    expect(r.resolveTarget({ request: '@theme-prev/Logo', issuer })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]![0]);
    expect(msg).toContain('不在任何主题层内');
    expect(msg).toContain('elsewhere');
    // 成因必须说对：最常见的是「写在层外文件里」，不是软链 / 漏层
    expect(msg).toContain('主题层目录');
    // 同一 issuer 不重复刷屏；官方 specifier 从不被拦截、也不告警
    r.resolveTarget({ request: '@theme-prev/Logo', issuer });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(
      r.resolveTarget({
        request: '@theme/Logo',
        issuer: '/elsewhere/Logo/index.js',
      }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('解析缓存 / 层栈身份', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('缓存不能把过期结论钉死：换实例（新构建）与补文件（dev/watch）都当场生效', () => {
    // 缓存 key 里没有层栈（见 `resolveTarget` 的 `cacheKey`），所以「层栈中途换了」只能靠
    // 构造时机回答：层栈是构造参数，一次构建一个实例。
    const a = site.layer('a', { Logo: '' });
    const b = site.layer('b', { Logo: '' });
    const c = site.layer('c', { Logo: '' });
    const issuer = path.join(c.owner, 'Logo', 'index.js');
    const before = new PrevLayerResolverPlugin({ layers: [a, b, c] });
    expect(
      before.resolveTarget({ request: '@theme-prev/Logo', issuer })?.via,
    ).toBe(b.name);
    // 去掉 b 重来一次（= 下一次构建）：落点必须是 a，而不是上一个实例缓存里的 b
    const after = new PrevLayerResolverPlugin({ layers: [a, c] });
    expect(
      after.resolveTarget({ request: '@theme-prev/Logo', issuer })?.via,
    ).toBe(a.name);

    // 同一实例内也一样：负结论不缓存，否则「这一层后来才有 X」会被第一次的「还没有」永久
    // 钉死，而 dev/watch 里没有任何失效路径
    const askLater = () =>
      before.resolveTarget({ request: '@theme-prev/Later', issuer });
    expect(askLater()).toBeNull();
    fs.mkdirSync(path.join(a.owner, 'Later'), { recursive: true });
    fs.writeFileSync(path.join(a.owner, 'Later', 'index.js'), '');
    expect(askLater()?.target).toBe(path.join(a.owner, 'Later', 'index.js'));

    // 正向缓存命中后目标文件被替换时，也必须重新选择当前赢家。
    const cached = before.resolveTarget({
      request: '@theme-prev/Logo',
      issuer,
    });
    expect(cached?.target).toBe(path.join(b.owner, 'Logo', 'index.js'));
    fs.rmSync(path.join(b.owner, 'Logo', 'index.js'));
    expect(
      before.resolveTarget({ request: '@theme-prev/Logo', issuer })?.target,
    ).toBe(path.join(a.owner, 'Logo', 'index.js'));

    const queried = { request: '@theme-prev/Logo?raw', issuer };
    expect(before.resolveTarget(queried)?.target).toBe(
      `${path.join(a.owner, 'Logo', 'index.js')}?raw`,
    );
    expect(before.resolveTarget(queried)?.target).toBe(
      `${path.join(a.owner, 'Logo', 'index.js')}?raw`,
    );
  });

  it('同一个实例换层栈：缓存键带层栈指纹，旧答案不串到新层栈', () => {
    // 缓存正确性原本全靠「层栈是构造参数、一次构建一个实例」这条隐性契约：实例被
    // 复用到第二个层栈上时，旧键会命中，把上一个层栈的落点当成这一个的答案 ——
    // 静默错层。键的第一段带上层栈指纹后，`layers` 整个换掉即换键、旧答案自然失效。
    const a = site.layer('fp-a', { Logo: '' });
    const mid = site.layer('fp-mid', { Logo: '' });
    const b = site.layer('fp-b', { Logo: '' });
    const issuer = path.join(b.owner, 'Logo', 'index.js');
    const r = new PrevLayerResolverPlugin({ layers: [a, b] });
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer })?.target,
    ).toBe(path.join(a.owner, 'Logo', 'index.js'));

    // 同一个实例、同一句话，但层栈里多插了一层：落点必须换成新层栈的答案
    r.layers = [a, mid, b];
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer })?.target,
    ).toBe(path.join(mid.owner, 'Logo', 'index.js'));
  });

  it('resolutionCache 有上限，且超限后仍返回正确结果（退化为现算，不是错值）', () => {
    const inner = site.layer('a', { Logo: '' });
    const outer = site.layer('b', { Logo: '' });
    const r = new PrevLayerResolverPlugin({ layers: [inner, outer] });
    // 每圈都是新键 → 现算（真实 fs），圈数即耗时；越过上限 1 圈就够
    for (let i = 0; i < 8193; i += 1) {
      r.resolveTarget({
        request: '@theme-prev/Logo',
        issuer: path.join(outer.owner, `x${i}`, 'a.js'),
      });
    }
    // 钉恰好是上限：只写 `<=` 时「一个都没存」也算绿
    expect(r.resolutionCache.size).toBe(8192);
    const res = r.resolveTarget({
      request: '@theme-prev/Logo',
      issuer: path.join(outer.owner, 'Logo', 'index.js'),
    });
    expect(res?.target).toBe(path.join(inner.owner, 'Logo', 'index.js'));
  });
});

describe('输入校验：组件名不是可信输入', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('isSafeComponentName：拒绝 .. / 绝对路径 / 反斜杠 / 空段，放行嵌套组件', () => {
    for (const bad of [
      '..',
      '../b/Logo',
      'Logo/../../b/secret',
      './Logo',
      'Logo/./x',
      'Logo//x',
      '',
      '/abs/Logo',
      String.raw`C:\x\Logo`,
      String.raw`Logo\index`,
      // 盘符相对形式：Windows 上 `path.isAbsolute` 认不出它（缺分隔符）
      'C:Logo',
      // NUL：部分 fs 调用会就地截断，`path.join` 出去之后拿到的路径与判据看到的不是一回事
      'a\0b',
      'Logo\0/evil',
    ]) {
      expect(isSafeComponentName(bad), bad).toBe(false);
    }
    for (const ok of ['Logo', 'DocItem/Footer', 'A/B/C', 'My.Logo', 'Logo-1']) {
      expect(isSafeComponentName(ok), ok).toBe(true);
    }
  });

  it('穿越型组件名直接返回 null，且告警（不是静默交回官方）', () => {
    const inner = site.layer('a', { Logo: '' });
    const outer = site.layer('b', { Logo: '' });
    fs.mkdirSync(path.join(outer.owner, 'secret'), { recursive: true });
    fs.writeFileSync(path.join(outer.owner, 'secret', 'index.js'), 'SECRET');
    expect(resolveComponentInLayer(inner, '../b/secret')).toBeNull();
    expect(resolveComponentInLayer(inner, '..')).toBeNull();

    const warn = vi.fn();
    const r = new PrevLayerResolverPlugin({
      layers: [inner, outer],
      logger: { warn },
    });
    expect(
      r.resolveTarget({
        request: '@theme-prev/../b/secret',
        issuer: path.join(inner.owner, 'Logo', 'index.js'),
      }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(
      '组件名不是安全的相对路径',
    );
  });
});

describe('组件可见性：与官方别名体系同口径', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('只认官方那四种扩展名（与官方别名体系同口径），体系外的后缀不算组件', () => {
    for (const ext of ['js', 'jsx', 'ts', 'tsx', 'mjs', 'mts']) {
      const layer = site.layer(`l-${ext}`);
      const file = path.join(layer.owner, `X.${ext}`);
      fs.writeFileSync(file, '');
      // 判据产地见 EXT_PRIORITY：认体系外的后缀 = 两套可见性
      expect(resolveComponentInLayer(layer, 'X'), ext).toBe(
        ['js', 'jsx', 'ts', 'tsx'].includes(ext) ? file : null,
      );
    }
  });

  it('候选名被组件名拼成官方会忽略的形状时跳过，而不是当成实现', () => {
    // 判据的产地是 `isIgnoredComponentFile`；这里只从**解析结果**取值，不把那份判据抄一遍
    // —— 抄的那份对着判据自己就能全绿。`Icon.d` 拼出的 `Icon.d.ts` 就是这种形状。
    const layer = site.layer('ignored-forms');
    fs.mkdirSync(path.join(layer.owner, '__tests__', 'Logo'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(layer.owner, '__tests__', 'Logo', 'index.js'),
      'export default 1',
    );
    fs.writeFileSync(path.join(layer.owner, 'Icon.d.ts'), 'export default 1');
    expect(
      resolveComponentInLayer(layer, '__tests__/Logo'),
      '__tests__ 下的文件不是组件',
    ).toBeNull();
    expect(
      resolveComponentInLayer(layer, 'Icon.d'),
      'Icon.d.ts 不是组件',
    ).toBeNull();

    // 跳过的只是那一个候选：同一个组件名的**另一个形态**仍会被找到
    fs.writeFileSync(path.join(layer.owner, 'Icon.js'), 'export default 1');
    expect(resolveComponentInLayer(layer, 'Icon')).toBe(
      path.join(layer.owner, 'Icon.js'),
    );
  });

  it('候选必须是文件：名叫 index.js / X.tsx 的目录不算组件（官方 onlyFiles 口径）', () => {
    // 官方枚举用 fast-glob 的默认 onlyFiles:true，目录永远不进别名表；
    // existsSync 对目录也返回 true —— 换成 isFile 探测才同口径。
    const layer = site.layer('dir-not-file');
    fs.mkdirSync(path.join(layer.owner, 'Logo', 'index.js'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(layer.owner, 'Solo.tsx'), { recursive: true });
    expect(
      resolveComponentInLayer(layer, 'Logo'),
      '名叫 index.js 的目录不是组件',
    ).toBeNull();
    expect(
      resolveComponentInLayer(layer, 'Solo'),
      '名叫 X.tsx 的目录不是组件',
    ).toBeNull();
  });

  it('层里只有测试文件时不算提供者：@theme-prev 跳过该层', () => {
    const inner = site.layer('a-vis', { Logo: '' });
    const mid = site.layer('mid-vis');
    fs.mkdirSync(path.join(mid.owner, 'Logo'), { recursive: true });
    fs.writeFileSync(
      path.join(mid.owner, 'Logo', 'index.test.tsx'),
      'export default 1',
    );
    expect(resolveComponentInLayer(mid, 'Logo'), '只有测试文件').toBeNull();

    const outer = site.layer('outer-vis', { Logo: '' });
    const r = new PrevLayerResolverPlugin({
      layers: [inner, mid, outer],
      logger: { warn: vi.fn() },
    });
    // mid 不算提供者 → 继续向下找到 inner
    expect(
      r.resolveTarget({
        request: '@theme-prev/Logo',
        issuer: path.join(outer.owner, 'Logo', 'index.js'),
      })?.target,
    ).toBe(path.join(inner.owner, 'Logo', 'index.js'));
  });
});

describe('matchSpecifier：前缀匹配', () => {
  it('只匹配 @theme-prev；官方别名与非字符串一律不匹配', () => {
    expect(matchSpecifier('@theme-prev/Logo')).toBe('@theme-prev/');

    for (const spec of [
      '@theme/Logo',
      '@theme-original/Logo',
      '@theme-init/Logo',
      '@theme-prev-init/Logo',
      '@theme-prev-root/Logo',
      'react',
      undefined,
      42,
    ]) {
      expect(matchSpecifier(spec as string)).toBeNull();
    }
  });
});

describe('顶层输入不是可信输入：非字符串 issuer 一律按「不在任何层内」处理', () => {
  it('非字符串 issuer（对象 / 数字 / null）不抛错，返回 -1', () => {
    // 与 `isSafeComponentName` 的 `typeof` 同一档：webpack 的 request 结构是外部输入，
    // 类型声明只描述「正常形态」。这里钉住「不抛」，因为抛错等于整个解析失败。
    const layer: ThemeLayer = {
      name: 'a',
      owner: '/site/src/theme',
      exists: true,
      kind: 'plugin',
    };
    for (const bad of [{}, 42, null] as unknown[]) {
      expect(
        findIssuerLayerIndex([layer], bad as string, normalizeLayerPath),
        String(bad),
      ).toBe(-1);
      // 组件名同理：非字符串不是「不安全」以外的第三种答案
      expect(isSafeComponentName(bad as string), String(bad)).toBe(false);
    }
  });
});

describe('matchSpecifier：前缀必须落在 `/` 边界', () => {
  it('前缀后没有组件名仍算匹配；不落在 `/` 边界的请求不算', () => {
    // 前缀之后什么都没有（空组件名）→ 交给调用方拒绝，这里仍算匹配
    expect(matchSpecifier('@theme-prev/')).toBe('@theme-prev/');
    // 不落在 `/` 边界上：前缀固定带斜杠，`@theme-prevX/Logo` 不被认领
    expect(matchSpecifier('@theme-prevX/Logo')).toBeNull();
  });
});

describe('resolveIssuer：只有 `request.context.issuer` 一种形态', () => {
  it('对象 context 取出 issuer；其余形状一律空串（不抛错、不返回 undefined）', () => {
    // webpack 把 `contextInfo`（含 issuer）作为 `resolve()` 首参传入，上游挂成 `request.context`
    expect(resolveIssuer({ context: { issuer: '/i/Logo/index.js' } })).toBe(
      '/i/Logo/index.js',
    );
    // 下面两种形状上游根本不产出：`request.contextInfo` 在 enhanced-resolve 里不存在，
    // 字符串首参会被挪去 `path`、`context` 归一成 `{}`。钉成 `''` 是「不支持它」。
    // @ts-expect-error 故意喂类型上不存在的形状
    expect(resolveIssuer({ contextInfo: { issuer: '/i' } })).toBe('');
    // @ts-expect-error 字符串首参被上游挪去 path，context 恒是对象
    expect(resolveIssuer({ context: '/i', issuer: '/i/x.js' })).toBe('');
    expect(resolveIssuer({ context: {} })).toBe('');
    expect(resolveIssuer({ context: '/i' })).toBe('');
    expect(resolveIssuer({ context: { issuer: 42 } })).toBe('');
    expect(resolveIssuer({ context: null })).toBe('');
    expect(resolveIssuer({ context: 42 })).toBe('');
    expect(resolveIssuer({})).toBe('');
    expect(resolveIssuer(undefined)).toBe('');
  });
});

/**
候选顺序的正据是官方 `createAliasesForTheme` 的**实际**赢家，不是我们的排序推理：
那套发射顺序不是文档化契约，官方枚举一变这条就报红，而不是留下「两条路两个模块」的静默分叉。
*/
describe('官方别名赢家：与 createAliasesForTheme 落在同一个文件', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('同名组件并存多种形态 / 多种扩展名时，两边指向同一个文件', async () => {
    const layer = site.layer('winner');
    // Logo 造「目录 vs 单文件」×「ts vs tsx」两层冲突，Both 只造形态冲突
    for (const f of [
      'Logo.js',
      'Logo/index.js',
      'Logo.ts',
      'Logo/index.tsx',
      'Both.js',
      'Both/index.js',
      // 点开头的段：官方 glob 默认看不见它们
      '.hidden/Logo/index.js',
      'Sub/.Icon.js',
    ]) {
      const p = path.join(layer.owner, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'export default 1;');
    }
    const aliases = await createAliasesForTheme(layer.owner, false);
    for (const name of ['Logo', 'Both']) {
      expect(resolveComponentInLayer(layer, name), name).toBe(
        aliases[`@theme/${name}`],
      );
    }
    // 「看不见」也要同样看不见：只断言我们这边 null，两套可见性的差异就留给运行时暴露
    for (const name of ['.hidden/Logo', 'Sub/.Icon']) {
      expect(
        aliases[`@theme/${name}`],
        `${name} 在官方没有别名`,
      ).toBeUndefined();
      expect(resolveComponentInLayer(layer, name), name).toBeNull();
    }
  });
});
