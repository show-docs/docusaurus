import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  makeFixtureSite,
  tick,
  warnSink,
  withFixedTarget,
  type ThemeLayer,
} from './helpers.mts';

import { PrevLayerResolverPlugin } from '../plugins/plugin-prev-layer-resolver/src/resolver.mts';

type FixtureSite = ReturnType<typeof makeFixtureSite>;

/**
构造一个 4 层链的层栈：a（最内）→ b → c → site（最外），
每层都提供 Logo；只有 a、site 提供 OnlyA（用于验证「向下继续找」）。
*/
function makeChain(site: FixtureSite) {
  const a = site.layer('a', { Logo: '', OnlyA: '' });
  const b = site.layer('b', { Logo: '' });
  const c = site.layer('c', { Logo: '' });
  const s = site.siteLayer({ Logo: '', OnlyA: '' });
  return { a, b, c, s, layers: [a, b, c, s] };
}

function resolverFor(
  layers: ThemeLayer[],
  extra: Record<string, unknown> = {},
): PrevLayerResolverPlugin {
  return new PrevLayerResolverPlugin({ layers, ...extra });
}

/**
从层信息拼出「该层的 Logo 文件绝对路径」
*/
const logo = (layer: ThemeLayer): string =>
  path.join(layer.owner, 'Logo', 'index.js');
const onlyA = (layer: ThemeLayer): string =>
  path.join(layer.owner, 'OnlyA', 'index.js');

describe('@theme-prev/X：每层拿到「紧邻下面那一层」', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('四层链逐层下降（本仓库实际形态）', () => {
    const { a, b, c, s } = makeChain(site);
    const r = resolverFor([a, b, c, s]);

    const cases: Array<[string, string | null]> = [
      [s.owner, logo(c)],
      [c.owner, logo(b)],
      [b.owner, logo(a)],
      [a.owner, null], // 最内层下面没人 → 交回官方解析（真实报 Module not found）
    ];
    for (const [owner, expected] of cases) {
      const got = r.resolveTarget({
        request: '@theme-prev/Logo',
        issuer: path.join(owner, 'Logo', 'index.js'),
      });
      expect(got?.target ?? null, `issuer=${owner}`).toBe(expected);
    }

    // 下面那一层没有实现该组件时，继续向下找（不是停在空层上）
    expect(
      r.resolveTarget({
        request: '@theme-prev/OnlyA',
        issuer: path.join(c.owner, 'Logo', 'index.js'),
      }),
    ).toMatchObject({ target: onlyA(a), targetIndex: 0 });
    expect(
      r.resolveTarget({
        request: '@theme-prev/OnlyA',
        issuer: path.join(s.owner, 'Logo', 'index.js'),
      }),
    ).toMatchObject({ target: onlyA(a) });
  });

  it('链底（下方无实现）不返回自身：交回官方解析，最坏是真 Module not found', () => {
    const { a, b, c, s } = makeChain(site);
    const r = resolverFor([a, b, c, s]);
    // a 是 OnlyA 的最内层提供者，a 内部 import @theme-prev/OnlyA 无层可指；
    // 层栈里没人提供时一律交回官方解析（真实的 Module not found），不回落官方别名
    expect(
      r.resolveTarget({ request: '@theme-prev/OnlyA', issuer: onlyA(a) }),
    ).toBeNull();
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer: logo(a) }),
    ).toBeNull();
  });
});

describe('官方别名完全不受影响', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('@theme / @theme-original / @theme-init 一律不改写', () => {
    const { a, b, c, s } = makeChain(site);
    const r = resolverFor([a, b, c, s]);
    // 官方三个别名、无关 specifier、以及「前缀后没有组件名」的写法，一律不消费
    for (const spec of [
      '@theme/Logo',
      '@theme-original/Logo',
      '@theme-init/Logo',
      'react',
      '@theme-prev/',
    ]) {
      expect(
        r.resolveTarget({ request: spec, issuer: logo(b) }),
        spec,
      ).toBeNull();
    }
  });
});

describe('边界与降级', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('导入者不属于任何层 → 保持官方行为', () => {
    const { a, b, c, s } = makeChain(site);
    const r = resolverFor([a, b, c, s]);
    expect(
      r.resolveTarget({
        request: '@theme-prev/Logo',
        issuer: path.join(site.root, 'node_modules/x.js'),
      }),
    ).toBeNull();
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer: '' }),
    ).toBeNull();
  });

  it('组件名可以是嵌套路径（DocItem/Footer）；单文件形式同样可解析', () => {
    const a = site.layer('a', { 'DocItem/Footer': '' });
    const b = site.layer('b', { 'DocItem/Footer': '' });
    const r = resolverFor([a, b]);
    expect(
      r.resolveTarget({
        request: '@theme-prev/DocItem/Footer',
        issuer: path.join(b.owner, 'x.js'),
      })?.target,
    ).toBe(path.join(a.owner, 'DocItem', 'Footer', 'index.js'));
    // 单文件形式（`X.js`）在层里没有同名目录时生效 —— 与目录形式同一套定位规则
    fs.writeFileSync(path.join(a.owner, 'Solo.js'), 'export default 1');
    expect(
      r.resolveTarget({
        request: '@theme-prev/Solo',
        issuer: path.join(b.owner, 'x.js'),
      })?.target,
    ).toBe(path.join(a.owner, 'Solo.js'));
  });

  it('query / fragment 用裸名定位文件，尾部原样拼回落点', () => {
    const a = site.layer('q-a', { Logo: '' });
    const b = site.layer('q-b', { Logo: '' });
    const r = resolverFor([a, b]);
    // 官方别名对 `@theme/Logo?raw` 一样生效并保留尾部 ⇒ 尾部不属于组件名，但属于落点
    for (const tail of ['', '?raw', '?a=1#frag', '#frag'])
      expect(
        r.resolveTarget({
          request: `@theme-prev/Logo${tail}`,
          issuer: logo(b),
        })?.target,
      ).toBe(logo(a) + tail);
  });

  it('嵌套主题层时按最长前缀判定导入者归属', () => {
    const inner = site.layer('outer/inner', { Logo: '' });
    const outer = site.layer('outer', { Logo: '' });
    const r = resolverFor([inner, outer]);
    // 导入者位于 inner（同时是 outer 的子路径）→ 应取 inner（index 0）；
    // inner 下面没有别的层提供 Logo → 交回官方解析
    const res = r.resolveTarget({
      request: '@theme-prev/Logo',
      issuer: logo(inner),
    });
    expect(res).toBeNull();
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer: logo(outer) })
        ?.target,
    ).toBe(logo(inner));
  });

  it('同一组合的解析结果被缓存：再问一次命中缓存，不重算', () => {
    const { a, b, c, s } = makeChain(site);
    const r = resolverFor([a, b, c, s]);
    const ask = (issuer: string): string | undefined =>
      r.resolveTarget({ request: '@theme-prev/Logo', issuer })?.target;
    expect(ask(logo(s))).toBe(logo(c));
    expect(ask(logo(b))).toBe(logo(a));
    // 同一个 issuer 再问一次：结果一样，且不新增缓存条目（key 用 NUL 分隔三个字段）
    expect(ask(logo(s))).toBe(logo(c));
    expect(r.resolutionCache.size).toBe(2);
    // `|` 是合法文件名字符，不能当分隔符：下面两组在旧键式（`prefix|组件|导入者`）下同键，
    // 第二个就会拿到第一个的落点；它的 issuer 在层外，正确结论只能是 null
    const fw = (p: string) => p.replaceAll('\\', '/');
    const colliding = `${fw(c.owner)}/x|y/Intro.js`;
    expect(ask(colliding)).toBe(logo(b));
    expect(
      r.resolveTarget({
        request: `@theme-prev/Logo|${fw(c.owner)}/x`,
        issuer: 'y/Intro.js',
      }),
    ).toBeNull();
  });

  it('挂在 resolve 入口，并把 request 换绝对路径后从 internal-resolve 继续', async () => {
    // 这两个 hook 的选择都是「换一个就坏」的：
    //  - 入口必须是 resolve，裸 specifier 才会经过我们（internal-resolve 到不了）
    //  - 出口必须是 internal-resolve，回到 resolve 会回环 + 被别名二次加工
    const { a, b, c, s } = makeChain(site);
    const r = resolverFor([a, b, c, s]);
    const tapAsync = vi.fn();
    const hooked: string[] = [];
    const doResolve = vi.fn(
      (
        _hook: unknown,
        req: { request?: string },
        _msg: unknown,
        _ctx: unknown,
        cb: (e: null, r: unknown) => void,
      ) => cb(null, { path: req.request }),
    );
    const resolver = {
      getHook: (name: string) => {
        hooked.push(name);
        return { tapAsync };
      },
      ensureHook: (name: string) => {
        hooked.push(`ensure:${name}`);
        return name;
      },
      doResolve,
    };
    r.apply(resolver as never);
    // 能力自检会先 ensure 一次 internal-resolve；入口 hook 必须是 resolve
    expect(hooked).toEqual(['ensure:internal-resolve', 'resolve']);
    expect(tapAsync).toHaveBeenCalledWith(
      'PrevLayerResolverPlugin',
      expect.any(Function),
    );

    const handler = tapAsync.mock.calls[0]![1] as (
      req: unknown,
      ctx: unknown,
      cb: (e: unknown, r?: unknown) => void,
    ) => void;
    const callback = vi.fn();
    // 真实 webpack 形态：`contextInfo` 是 `resolve()` 的首参，上游把它挂成 `request.context`
    const request = {
      request: '@theme-prev/Logo',
      context: { issuer: logo(s) },
    };
    handler(request, {}, callback);
    await tick();

    expect(doResolve).toHaveBeenCalledTimes(1);
    expect(doResolve.mock.calls[0]![0]).toBe('internal-resolve');
    expect((doResolve.mock.calls[0]![1] as { request: string }).request).toBe(
      logo(c),
    );
    expect(callback).toHaveBeenCalledWith(null, { path: logo(c) });
  });

  it.each([
    [
      'doResolve 抛错',
      (cb: (e: unknown, r: unknown) => void) => cb(new Error('boom'), null),
      '解析失败',
    ],
    // 失败还有第二种形态：「静默不给结果」。只测抛错会让这一种退回**无告警**的静默，
    // 而「解析真的坏了」与「本来就不该我管」在日志里就再也分不出来。
    [
      'doResolve 既没给 error 也没给 result',
      (cb: (e: unknown, r: unknown) => void) => cb(null, null),
      'doResolve 未返回结果',
    ],
  ])('%s 时交回官方解析并告警', async (_label, fail, expected) => {
    const { warns, logger } = warnSink();
    const { a, b, c, s } = makeChain(site);
    const r = resolverFor([a, b, c, s], { logger });
    const tapAsync = vi.fn();
    const doResolve = vi.fn((...args: unknown[]) => {
      const cb = args.at(-1) as (e: unknown, r: unknown) => void;
      return fail(cb);
    });
    r.apply({
      getHook: () => ({ tapAsync }),
      ensureHook: () => 'x',
      doResolve,
    } as never);
    const handler = tapAsync.mock.calls[0]![1] as (
      req: unknown,
      ctx: unknown,
      cb: (e?: unknown) => void,
    ) => void;
    const callback = vi.fn();
    handler(
      { request: '@theme-prev/Logo', context: { issuer: logo(s) } },
      {},
      callback,
    );
    await tick();
    expect(callback).toHaveBeenCalledWith();
    // 交回官方解析，但**不静默**：失败要有一行告警（否则「解析坏了」与「本来就不该我管」同形）
    expect(warns.at(-1)).toContain(expected);
  });

  it('resolver 抛错时不污染 webpack 解析（callback 兜底）', () => {
    const { a, b, c, s } = makeChain(site);
    const r = resolverFor([a, b, c, s]);
    const tapAsync = vi.fn();
    r.apply({
      getHook: () => ({ tapAsync }),
      ensureHook: () => 'resolve',
      doResolve: vi.fn(),
    } as never);
    const handler = tapAsync.mock.calls[0]![1] as (
      req: unknown,
      ctx: unknown,
      cb: (e: unknown, r?: unknown) => void,
    ) => void;
    const callback = vi.fn();
    const badRequest = {
      request: '@theme-prev/Logo',
      get context() {
        throw new Error('boom');
      },
    };
    expect(() => handler(badRequest, {}, callback)).not.toThrow();
    expect(callback).toHaveBeenCalled();
  });
});

describe('告警口径：同一句话只报一次、不刷屏', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('issuerIndex < 0 的告警按类别折叠：上千个 issuer 不会刷满日志', () => {
    const a = site.layer('a', { Logo: '' });
    const warn = vi.fn();
    const r = new PrevLayerResolverPlugin({ layers: [a], logger: { warn } });
    for (let i = 0; i < 2000; i += 1) {
      r.resolveTarget({
        request: '@theme-prev/Logo',
        issuer: path.join(site.root, 'elsewhere', `m${i}.js`),
      });
    }
    // 5 条采样 + 按量级补报的汇总（折叠 1 / 10 / 100 / 1000 各一次），远小于 2000
    // 上界用 `<=` 而不是 `===` 是有意的：这里量的是「防刷屏生效了」，不是汇总行的条数
    // —— 条数由下面两条断言逐字钉住（`另有 1 条` / `另有 1000 条`），再数一遍调用次数
    // 等于把「同一行文案被折叠」从**未限流**这一侧再测一次。
    expect(warn.mock.calls.length).toBeLessThanOrEqual(9);
    expect(warn.mock.calls.length).toBeGreaterThan(0);
    const all = warn.mock.calls.map((c) => String(c[0])).join('\n');
    // 告警主体文案（成因那几句）由 resolve.test.mts 钉住，本用例只量防刷屏。
    // 汇总行要钉**完整文案**：只断言子串「已被折叠」时，「还有 1 多条」这种病句照样全绿出货。
    // 且数字必须是**真实**的折叠条数快照：2000 条 = 5 条采样 + 1995 条折叠，
    // 告警点是 10 的幂（1 / 10 / 100 / 1000），不是恒为 1。
    expect(all).toContain('另有 1 条「导入者不属于任何已知层」的告警已被折叠');
    expect(all).toContain(
      '另有 1000 条「导入者不属于任何已知层」的告警已被折叠',
    );
    expect(all).not.toContain('1 多条');
    // 「一共」这种绝对口径在流式告警里必然是假的 —— 数字只是快照
    expect(all).toContain('截至这里');

    // 去重仍然生效：同一句文案不会报第二遍（多出来的是那条折叠汇总，另一句话）
    const warn2 = vi.fn();
    const r2 = new PrevLayerResolverPlugin({
      layers: [a],
      logger: { warn: warn2 },
    });
    const issuer = path.join(site.root, 'elsewhere', 'Logo', 'index.js');
    for (let i = 0; i < 10; i += 1)
      r2.resolveTarget({ request: '@theme-prev/Logo', issuer });
    const texts = warn2.mock.calls.map((c) => String(c[0]));
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.filter((t) => t.includes('不在任何主题层内'))).toHaveLength(1);
  });

  it('不安全组件名按类别限流：不同坏名字不刷屏（变量是用户输入）', () => {
    const a = site.layer('warn-unsafe', { Logo: '' });
    const warn = vi.fn();
    const r = new PrevLayerResolverPlugin({ layers: [a], logger: { warn } });
    // 200 个**不同**的坏名字：按完整消息去重会出 200 行（消息里带用户写的组件名）
    for (let i = 0; i < 200; i += 1)
      r.resolveTarget({
        request: `@theme-prev/../evil-${i}/Logo`,
        issuer: path.join(a.owner, 'Logo', 'index.js'),
      });
    // 5 条采样 + 按量级补报的汇总（折叠 1 / 10 / 100 各一次），远小于 200
    expect(warn.mock.calls.length).toBeLessThanOrEqual(9);
    const all = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(all).toContain('组件名不是安全的相对路径');
    expect(all).toContain(
      '另有 1 条「组件名不是安全的相对路径」的告警已被折叠',
    );
  });

  it('匹配到 specifier 但拿不到 issuer → 告警（上游 contextInfo 漂移探针）', () => {
    // 正常构建里这条路不该走到（webpack 的模块解析都带 contextInfo）；不告警就会把
    // 「上游形态漂移」表现成和「写在层外」完全一样的 Module not found，而后者有告警。
    const { a, b, c, s } = makeChain(site);
    const warn = vi.fn();
    const r = new PrevLayerResolverPlugin({
      layers: [a, b, c, s],
      logger: { warn },
    });
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer: '' }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('拿不到导入者');
    // 文案不含可变内容 → 同一形状只报一次（warn 按完整消息去重）
    r.resolveTarget({ request: '@theme-prev/Logo', issuer: '' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('普通告警不进 violations（只有不变量违规才登记）', () => {
    // 「落 m 点是普通告警」由 chain-invariants 的 stub 一节逐条覆盖，
    // 这里只留两侧的分界：同一个实例先普通告警、再违规。
    const warn = vi.fn();
    const fallback: ThemeLayer = {
      name: 'theme-fallback',
      owner: site.layer('fb', { Logo: '' }).owner,
      kind: 'fallback',
      exists: true,
    };
    const outer = site.layer('outer', { Logo: '' });
    // 违规靠**构造参数**伪造（见 `withFixedTarget`），不是事后打桩。
    const r = new (withFixedTarget(PrevLayerResolverPlugin, 1))({
      layers: [fallback, outer],
      logger: { warn },
    });
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer: logo(outer) }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('不变量违规');
  });
});

/**
缺陷回归用例：用例先失败、修完变绿。
钉的是**写错的行为**，不是「当前实现正好这样」，也不是品味。
*/
describe('缺陷回归', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('折叠汇总行不会被 warnOnce 吞掉：文案先被别处说过时仍然告警', () => {
    // 汇总若走 `warn`，去重键是完整消息：文案在别处先被说过就被吞掉、「另有 N 条」永久丢失。
    const logoLayer = site.layer('a-summary', { Logo: '' });
    const { warns, logger } = warnSink();
    const r = new PrevLayerResolverPlugin({ layers: [logoLayer], logger });
    // 前 5 条同文本重复 → 去重集合已存着汇总那句同款文案（`summarize(1)` 拼出来正是它）
    for (let i = 0; i < 5; i += 1)
      r.warnSample(
        'issuer-not-in-any-layer',
        'same message',
        (n) => `另有 ${n} 条已被折叠`,
      );
    expect(warns, '同上一条消息重复 5 次只报一次').toHaveLength(1);
    const folded = warns.length;
    r.warnSample(
      'issuer-not-in-any-layer',
      'same message',
      (n) => `另有 ${n} 条已被折叠`,
    );
    expect(
      warns.slice(folded),
      '汇总必须出现，哪怕它的文本与采样里那条一模一样',
    ).toEqual(['另有 1 条已被折叠']);
  });

  it('折叠汇总按量级补报 1 → 10 / 100 / 1000 …，且门槛按类别各存一份', () => {
    // 汇总里那个数是给读日志的人用的「还有多少条我没看到」。只在第一次超限时报一次的话，
    // 2000 条同类告警最终只报「另有 1 条」，而实际折叠了 1995 条 —— 这个数还是错的。
    // 修法是按 1 → 10 → 100 … 补报（告警 O(log N)），每次报的都是当时真数。
    //
    // 门槛若在实例级共用，跑得最快的那一类会把它推到高位，此后新出现的类别要等到自己
    // 也折叠同样多才报 —— 它的汇总（哪怕只有 1 条）永远不会出现。所以两条一起断言。
    const { warns, logger } = warnSink();
    const r = new PrevLayerResolverPlugin({ layers: [], logger });
    const ladder = (tag: string): string[] =>
      warns.filter((w) => w.startsWith(`${tag}:`));

    for (let i = 0; i < 10005; i += 1)
      r.warnSample('one', `m-${i}`, (n) => `F:${n}`);
    expect(ladder('F')).toEqual(['F:1', 'F:10', 'F:100', 'F:1000', 'F:10000']);
    // 告警次数是 O(log N)：10005 条告警也只有 10 行
    expect(warns.length).toBe(10);

    // 新类别只折叠 6 条也必须有汇总（不被上一类推高的门槛压住）
    for (let i = 0; i < 6; i += 1)
      r.warnSample('cat-b', `b-${i}`, (n) => `B:${n}`);
    expect(ladder('B'), '新类别的折叠汇总必须告警').toEqual(['B:1']);
  });

  it('层栈是构造参数：一次构建一个实例，层栈一次给定', () => {
    // 解析缓存的 key 不含层栈，正是建在「层栈一次算好、之后不变」上。这条性质由
    // **构造时机**保证（`index.mts` 每次构建新建实例），因此这里能断言的只有它自己的
    // 那一半：没给层栈时是空栈，空栈下 `@theme-prev/*` 一个都不改写。
    // 两个默认参数（`layers = []` / `logger = console`）两侧都走到：传 `{}` 走字段默认，
    // 整个不传走外层 `= {}`（`index.mts` 那条真实路径）。
    const r = new PrevLayerResolverPlugin({});
    expect(r.layers, '没给 layers 时是空栈').toEqual([]);
    const bare = new PrevLayerResolverPlugin();
    expect(bare.layers, '整个 options 都不给时也是空栈').toEqual([]);
    expect(bare.logger, 'logger 默认落到 console').toBe(console);
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer: '/x/y.js' }),
    ).toBeNull();
    // 给了层栈则层栈生效（判据取**行为**，不再为测试在生产类型上开一个「读层栈」的出口）
    const a = site.layer('a-recover', { Logo: '' });
    const b = site.layer('b-recover', { Logo: '' });
    const withLayers = new PrevLayerResolverPlugin({ layers: [a, b] });
    expect(
      withLayers.resolveTarget({
        request: '@theme-prev/Logo',
        issuer: path.join(b.owner, 'Logo', 'index.js'),
      })?.target,
    ).toBe(path.join(a.owner, 'Logo', 'index.js'));
  });
});

describe('诊断文案与判等字段的兜底（每一侧都可断言）', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('不变量违规告警里层名缺失时退回「theme layer #N」', () => {
    // `layers[issuerIndex]?.name ?? \`theme layer #${issuerIndex}\`` 的右半支：
    // 层对象缺 name（推导给了半成品）时，告警仍要指明是第几层，否则整条告警无法定位。
    const inner = site.layer('inner-x', { Logo: '' });
    const outer = site.layer('outer-x', { Logo: '' });
    const warn = vi.fn();
    // 构造前替换（见 withFixedTarget 的说明）
    // 导入者在 1（outer），伪造落点也是 1 → 违规；告警里的「层」取的是**导入者**那一层的名字
    const r = new (withFixedTarget(PrevLayerResolverPlugin, 1))({
      layers: [inner, { ...outer, name: undefined } as unknown as ThemeLayer],
      logger: { warn },
    });
    expect(
      r.resolveTarget({ request: '@theme-prev/Logo', issuer: logo(outer) }),
    ).toBeNull();
    expect(String(warn.mock.calls[0]![0])).toContain('theme layer #1');
  });

  it('改写逻辑抛非 Error（字符串 / 对象）时告警里照样带上原因', () => {
    // `error instanceof Error ? error.message : String(error)` 的两半：三者都要能看出原因，
    // 否则「改写炸了」只剩一句「已交回官方解析」。
    const inner = site.layer('inner-y', { Logo: '' });
    const outer = site.layer('outer-y', { Logo: '' });
    for (const thrown of [
      new Error('as-error'),
      'as-string',
      { toString: () => 'as-object' },
    ]) {
      const { warns, logger } = warnSink();
      const r = resolverFor([inner, outer], { logger });
      const tapAsync = vi.fn();
      const doResolve = vi.fn();
      r.apply({
        getHook: () => ({ tapAsync }),
        ensureHook: () => 'x',
        doResolve,
      } as never);
      r.resolveTarget = () => {
        throw thrown;
      };
      const handler = tapAsync.mock.calls[0]![1] as (
        req: unknown,
        ctx: unknown,
        cb: () => void,
      ) => void;
      const callback = vi.fn();
      handler({ request: undefined, context: {} }, {}, callback);
      expect(warns.at(-1), String(thrown)).toContain('改写');
      expect(String(warns.at(-1))).toMatch(/as-error|as-string|as-object/);
    }
  });
});
