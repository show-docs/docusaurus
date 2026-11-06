import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { PrevLayerResolveTapPlugin } from '../packages/plugin-prev-layer-resolver/src/resolve-tap.mts';
import { PrevLayerResolverPlugin } from '../packages/plugin-prev-layer-resolver/src/resolver.mts';

import { makeFixtureSite } from './helpers.mts';

/**
rspack 那一支的接线：模块工厂解析前那一格的改写与它的能力自检。

为什么这一支不能用 `resolve.plugins`（rspack 不消费它，`apply()` 一次都不会被调用），
见 `src/resolve-tap.mts` 文件头与仓库根 `proposal-prev-layer-rspack.md`。
判据本身（`resolveTarget`）与 webpack 一支是同一份，它的用例在 `test/resolve.test.mts` /
`test/resolver.test.mts`，这里只钉「接得上、改得对、接不上会响」。
*/

/** 处理者形状（官方那一份收 `resolveData`，测试里由用例决定交回什么） */
type Handler = (arg: unknown) => unknown;

/**
假 tapable hook：只实现本包用到的 `tap`，外加一条按官方 **bail** 语义驱动一次的能力
—— 任一处理者返回真值即停并交回那个真值。返回值本身就是要钉的东西
（改写只能靠就地改 `request`，返回真值等于接管这次解析）。
*/
class FakeHook {
  taps: { fn: Handler; name: string }[] = [];

  tap(name: string, fn: Handler): void {
    this.taps.push({ fn, name });
  }

  call(arg: unknown): unknown {
    let result: unknown;
    for (const { fn } of this.taps) {
      result = fn(arg);
      if (result) return result;
    }
    return result;
  }
}

interface FakeBundler {
  compiler: { hooks: { normalModuleFactory?: FakeHook } };
  normalModuleFactory: FakeHook;
  beforeResolve: FakeHook;
}

/**
造一份「compiler → 模块工厂 → beforeResolve」的假链。
`hasNormalModuleFactory: false` 就是「compiler 上没那一格」；工厂自己没有 `beforeResolve`
那种情形由用例直接把空工厂交回 tap，不需要参数。
*/
function fakeBundler({ hasNormalModuleFactory = true } = {}): FakeBundler {
  const normalModuleFactory = new FakeHook();
  const compiler: FakeBundler['compiler'] = { hooks: {} };
  if (hasNormalModuleFactory) {
    compiler.hooks.normalModuleFactory = normalModuleFactory;
  }
  return { beforeResolve: new FakeHook(), compiler, normalModuleFactory };
}

/** 把假链跑到「beforeResolve 已挂上」那一步（官方就是在这一步把工厂交给插件） */
function apply(plugin: PrevLayerResolveTapPlugin, bundler: FakeBundler): void {
  plugin.apply(bundler.compiler as never);
  bundler.normalModuleFactory.call({
    hooks: { beforeResolve: bundler.beforeResolve },
  });
}

describe('rspack 那一支：解析前改写 request', () => {
  const site = makeFixtureSite();
  const inner = site.layer('theme-inner', { Logo: '' });
  const outer = site.layer('theme-outer', { Logo: '' });
  const issuer = path.join(outer.owner, 'Logo', 'index.js');

  function makePlugin(): [
    PrevLayerResolveTapPlugin,
    { warn: ReturnType<typeof vi.fn> },
  ] {
    const warn = vi.fn();
    const resolver = new PrevLayerResolverPlugin({
      layers: [inner, outer],
      logger: { warn },
    });
    return [new PrevLayerResolveTapPlugin(resolver), { warn }];
  }

  it('`@theme-prev/Logo` 改成下面那一层的文件', () => {
    const [plugin] = makePlugin();
    const bundler = fakeBundler();
    apply(plugin, bundler);

    const data = { contextInfo: { issuer }, request: '@theme-prev/Logo' };
    bundler.beforeResolve.call(data);

    expect(data.request).toBe(path.join(inner.owner, 'Logo', 'index.js'));
  });

  /**
  返回真值 = 接管这次解析（bail hook 的语义），那样后续 loader / 规则全都不再跑，
  比不改写更坏。这里钉的是「只改 `request`，交回 `undefined`」。
  */
  it('处理者不返回真值（不接管这次解析）', () => {
    const [plugin] = makePlugin();
    const bundler = fakeBundler();
    apply(plugin, bundler);

    expect(
      bundler.beforeResolve.call({
        contextInfo: { issuer },
        request: '@theme-prev/Logo',
      }),
    ).toBeFalsy();
  });

  it('官方别名与其它 specifier 一个字段都不动', () => {
    const [plugin, { warn }] = makePlugin();
    const bundler = fakeBundler();
    apply(plugin, bundler);

    for (const request of [
      './Logo',
      '@theme/Logo',
      '@theme-original/Logo',
      '@theme-init/Logo',
      'react/jsx-runtime',
      undefined,
    ]) {
      const data: { contextInfo: { issuer: string }; request?: string } = {
        contextInfo: { issuer },
        request,
      };
      bundler.beforeResolve.call(data);
      expect(data.request).toBe(request);
    }
    // 上游哪天交回来的不是对象（漂移的形状之一），这一格同样只是不动
    expect(() => bundler.beforeResolve.call(undefined)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('导入者写在层外时不动 request，但会响（这一族不该写在层外）', () => {
    const [plugin, { warn }] = makePlugin();
    const bundler = fakeBundler();
    apply(plugin, bundler);

    const data = {
      contextInfo: { issuer: path.join(site.root, 'src', 'pages', 'x.js') },
      request: '@theme-prev/Logo',
    };
    bundler.beforeResolve.call(data);

    expect(data.request).toBe('@theme-prev/Logo');
    expect(
      warn.mock.calls.some((c) =>
        String(c[0]).includes('导入者不在任何主题层内'),
      ),
    ).toBe(true);
  });

  it('拿不到 issuer 时不动 request，并点出「上游形状漂了」', () => {
    const [plugin, { warn }] = makePlugin();
    const bundler = fakeBundler();
    apply(plugin, bundler);

    const data = { contextInfo: {}, request: '@theme-prev/Logo' };
    bundler.beforeResolve.call(data);

    expect(data.request).toBe('@theme-prev/Logo');
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('拿不到导入者')),
    ).toBe(true);
  });
});

describe('两支同一把尺子：同一条源码必须给出同一个落点', () => {
  /**
  这组用例是审计之后补的，钉的不是判据本身（那份在 `test/resolve.test.mts` /
  `test/resolver.test.mts`），钉的是**两支交回判据的字符串长得不一样**这件事：
  rspack 的解析前那一格收到的是带行内 loader 前缀的整串（`!!<loader>!@theme-prev/Logo`），
  webpack 那一支的 resolver 收到的是 enhanced-resolve 已经切掉前缀之后那一段。
  只看各自单测的话，这两套接线会各自绿着、却对同一行源码给出不同结果。

  所以这里对每一形状跑两支，再比落点：webpack 那一支改写出的绝对路径，必须逐字符等于
  rspack 那一支在同一串里改写出的那一段（前缀原样留在原位，行内 loader 不能被弄丢）。
  */
  const site = makeFixtureSite();
  const inner = site.layer('theme-inner', { Logo: '' });
  const outer = site.layer('theme-outer', { Logo: '' });
  const issuer = path.join(outer.owner, 'Logo', 'index.js');
  const landing = path.join(inner.owner, 'Logo', 'index.js');
  const LOADER_PREFIX = '!!/loaders/passthru.cjs!';

  /** webpack 那一支：把 request 交给 `apply()` 挂在 `resolve` 上的处理者，取改写后的那一段 */
  function webpackLanding(request: string): string | null {
    const tapAsync = vi.fn();
    const doResolve = vi.fn(
      (
        _hook: unknown,
        req: { request?: string },
        _msg: unknown,
        _ctx: unknown,
        cb: (e: null, r: unknown) => void,
      ) => cb(null, { path: req.request }),
    );
    new PrevLayerResolverPlugin({ layers: [inner, outer] }).apply({
      getHook: (name: string) => ({ name, tapAsync }),
      doResolve,
    } as never);

    const handler = tapAsync.mock.calls[0]![1] as (
      req: unknown,
      ctx: unknown,
      cb: (e: unknown, r?: unknown) => void,
    ) => void;
    // 真实 webpack 形态：`contextInfo` 由上游挂成 `request.context`
    handler({ context: { issuer }, request }, {}, vi.fn());

    // 没改写 = `callback()` 直接交回官方，`doResolve` 一次都不会被调用
    return doResolve.mock.calls.length === 0
      ? null
      : (doResolve.mock.calls[0]![1] as { request: string }).request;
  }

  /** rspack 那一支：把整串交给解析前那一格，取就地改完之后的整串 */
  function tapLanding(request: string): string {
    const bundler = fakeBundler();
    apply(
      new PrevLayerResolveTapPlugin(
        new PrevLayerResolverPlugin({ layers: [inner, outer] }),
      ),
      bundler,
    );
    const data = { contextInfo: { issuer }, request };
    bundler.beforeResolve.call(data);
    return data.request;
  }

  it.each([
    ['裸串', '@theme-prev/Logo'],
    ['行内 loader（`!!` 紧急模式）', `${LOADER_PREFIX}@theme-prev/Logo`],
    ['行内 loader 带 query', `${LOADER_PREFIX}@theme-prev/Logo?raw`],
  ])('%s：两支落点一致', (_label, request) => {
    const cut = request.lastIndexOf('!') + 1;
    const patched = tapLanding(request);
    const bare = webpackLanding(request.slice(cut));

    expect(bare).not.toBeNull();
    // rspack 那一支改写出的那一段，与 webpack 那一支对同一条请求改写出的结果，必须是同一个字符串
    expect(patched.slice(cut)).toBe(bare);
    // 前缀一个字都不能动：整串替换会把用户点名的那份行内 loader 弄丢
    expect(patched.slice(0, cut)).toBe(request.slice(0, cut));
  });

  it('裸串与行内 loader 都落到下面那一层（前缀不参与判据）', () => {
    expect(tapLanding('@theme-prev/Logo')).toBe(landing);
    expect(tapLanding(`${LOADER_PREFIX}@theme-prev/Logo`)).toBe(
      `${LOADER_PREFIX}${landing}`,
    );
  });

  it('前缀之后不是我们的 specifier 时整串不动（路径里带 `!` 也不会误改）', () => {
    for (const request of [
      `${LOADER_PREFIX}./Logo`,
      `${LOADER_PREFIX}@theme/Logo`,
      // 组件名里没有 `!`，所以「最后一个 `!` 之后」永远不可能是我们的 specifier 以外的东西
      '@theme-prev/Logo!extra',
    ]) {
      expect(tapLanding(request)).toBe(request);
    }
  });

  afterAll(() => site.cleanup());
});

describe('rspack 那一支：hook 不在就响，不静默', () => {
  /**
  这次的根因形状就是「我们 tap 的东西在这个 bundler 里不存在，而全程没人说话」。
  两格自检各钉一条：文案点名是哪一格、`@theme-prev/*` 整体禁用（交回官方解析 = 真实的
  Module not found），且不抛 —— 构建该照常走完，让那条 module-not-found 去指认现场。
  */
  const layers = [
    { exists: true, kind: 'plugin', name: 'a', owner: '/' },
    { exists: true, kind: 'plugin', name: 'b', owner: '/b' },
  ] as const;

  function makePlugin(warn: (...args: unknown[]) => void) {
    return new PrevLayerResolveTapPlugin(
      new PrevLayerResolverPlugin({ layers: [...layers], logger: { warn } }),
    );
  }

  it('compiler 上没有 `normalModuleFactory` ⇒ 响一次并整体禁用', () => {
    const warn = vi.fn();
    const bundler = fakeBundler({ hasNormalModuleFactory: false });

    expect(() =>
      makePlugin(warn).apply(bundler.compiler as never),
    ).not.toThrow();

    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('compiler.hooks');
    expect(message).toContain('beforeResolve');
    expect(message).toContain('已整体禁用');
  });

  it('模块工厂上没有 `beforeResolve` ⇒ 响一次并整体禁用', () => {
    const warn = vi.fn();
    const plugin = makePlugin(warn);
    const compiler: { hooks: { normalModuleFactory: FakeHook } } = {
      hooks: { normalModuleFactory: new FakeHook() },
    };
    plugin.apply(compiler as never);
    // 工厂交回来时 `hooks.beforeResolve` 缺失
    compiler.hooks.normalModuleFactory.call({ hooks: {} });

    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('normalModuleFactory.hooks');
    expect(message).toContain('已整体禁用');
  });

  it('同一实例只响一次（两类漂移各响一次，不刷屏）', () => {
    const warn = vi.fn();
    const plugin = makePlugin(warn);
    const noNmf = fakeBundler({ hasNormalModuleFactory: false });

    plugin.apply(noNmf.compiler as never);
    plugin.apply(noNmf.compiler as never);

    expect(warn.mock.calls.length).toBe(1);
  });

  it('判据自己抛了 ⇒ request 不动、响，而不是把异常交给 bundler', () => {
    // 抛的形状不止 `new Error`：三种都要在告警里看出原因，否则「改写炸了」只剩一句「已交回官方解析」。
    // 与 webpack 那一支的同名用例（`test/resolver.test.mts`「改写逻辑抛非 Error」）同一把尺子。
    for (const thrown of [
      new Error('as-error'),
      'as-string',
      { toString: () => 'as-object' },
    ]) {
      const warn = vi.fn();
      const resolver = new PrevLayerResolverPlugin({
        layers: [...layers],
        logger: { warn },
      });
      vi.spyOn(resolver, 'resolveTarget').mockImplementation(() => {
        throw thrown;
      });
      const bundler = fakeBundler();
      const plugin = new PrevLayerResolveTapPlugin(resolver);
      apply(plugin, bundler);

      const data = {
        contextInfo: { issuer: '/x' },
        request: '@theme-prev/Logo',
      };
      expect(() => bundler.beforeResolve.call(data)).not.toThrow();

      expect(data.request).toBe('@theme-prev/Logo');
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain('改写 @theme-prev/Logo 时抛错');
      expect(message).toContain(
        thrown instanceof Error ? 'as-error' : String(thrown),
      );
    }
  });
});
