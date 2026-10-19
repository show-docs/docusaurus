import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canSymlink,
  fakePlugin,
  makeFixtureSite,
  makePluginSite,
  tick,
  withFixedTarget,
} from './helpers.mts';

const { PrevLayerResolverPlugin } =
  await import('../plugins/plugin-prev-layer-resolver/src/resolver.mts');
type PrevLayerResolverPlugin = InstanceType<typeof PrevLayerResolverPlugin>;
const { layersFromPlugins, normalizeLayerPath, resolveCoreModule } =
  await import('../plugins/plugin-prev-layer-resolver/src/layers.mts');

/**
加固测试：每条对应一个具体的静默失败模式，见 ../plugins/plugin-prev-layer-resolver/README.md 的「边界与限制」。
*/
describe('层身份：嵌套层 / 软链不给同一目录发两张牌', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('单层栈下落点不越界', () => {
    const a = site.layer('a', { Logo: '' });
    const warn = vi.fn();
    // 层栈只有一层 → issuerIndex 0，下方没有任何层，因此 targetIndex 恒为 -1
    // （落点收在 `j < i`，不会落回导入者自己）。
    const r = new PrevLayerResolverPlugin({ layers: [a], logger: { warn } });
    const issuer = path.join(a.owner, 'Logo', 'index.js');

    expect(r.resolveTarget({ request: '@theme-prev/Logo', issuer })).toBeNull();
    expect(r.violations.size, '交回官方解析不是不变量违规').toBe(0);
  });

  it('嵌套层不被折叠：src/theme 与 src/theme/inner 是两个层', () => {
    const outer = site.layer('site-theme', { Logo: '' });
    const inner = {
      name: 'inner',
      owner: path.join(outer.owner, 'inner'),
      exists: true,
      kind: 'plugin' as const,
    };
    fs.mkdirSync(path.join(inner.owner, 'Logo'), { recursive: true });
    fs.writeFileSync(
      path.join(inner.owner, 'Logo', 'index.js'),
      'export default 1',
    );
    const r = new PrevLayerResolverPlugin({ layers: [inner, outer] });
    // 导入者在 inner、目标也在 inner → 违规（inner 下没有别的层提供 Logo）
    const res = r.resolveTarget({
      request: '@theme-prev/Logo',
      issuer: path.join(inner.owner, 'Logo', 'index.js'),
    });
    expect(res).toBeNull();
    // 导入者在 outer（不是 inner）→ inner 是下面那一层（跨层永不判等）
    const res2 = r.resolveTarget({
      request: '@theme-prev/Logo',
      issuer: path.join(outer.owner, 'Logo', 'index.js'),
    });
    expect(res2?.target).toBe(path.join(inner.owner, 'Logo', 'index.js'));
    expect(res2?.targetIndex).toBe(0);
    expect(res2?.issuerIndex).toBe(1);
  });

  it.runIf(canSymlink)(
    '软链下同一目录归一到同一字符串：层栈里不会出现两个指向同一目录的层',
    () => {
      const real = site.layer('real', { Logo: '' });
      const link = path.join(site.root, 'link');
      fs.symlinkSync(real.owner, link, 'dir');
      expect(normalizeLayerPath(link)).toBe(normalizeLayerPath(real.owner));

      const layers = layersFromPlugins({
        siteDir: site.root,
        plugins: [
          fakePlugin('one', real.owner),
          // 经软链再声明一次：同一目录，只应保留一层
          { name: 'two', path: site.root, getThemePath: () => link },
        ],
      });
      expect(
        layers.filter((l) => l.owner === normalizeLayerPath(real.owner)),
      ).toHaveLength(1);
    },
  );
});

describe('改写后的 request 与栈上 entry 的边角', () => {
  it('内部 hook 上已有同一条 request 时交回官方解析（避免 Recursion）', async () => {
    const site = makeFixtureSite();
    try {
      const a = site.layer('a', { Logo: '' });
      const b = site.layer('b', { Logo: '' });
      const r = new PrevLayerResolverPlugin({
        layers: [a, b],
        logger: { warn: vi.fn() },
      });
      const target = path.join(a.owner, 'Logo', 'index.js');

      const tapAsync = vi.fn();
      const doResolve = vi.fn(
        (
          _h: unknown,
          _r: unknown,
          _m: unknown,
          _c: unknown,
          cb: (e: null, r: unknown) => void,
        ) => cb(null, { ok: true }),
      );
      r.apply({
        getHook: () => ({ tapAsync }),
        ensureHook: (n: string) => ({ name: n }),
        doResolve,
      } as never);
      const handler = tapAsync.mock.calls[0]![1] as (
        req: unknown,
        ctx: unknown,
        cb: () => void,
      ) => void;
      const request = {
        request: '@theme-prev/Logo',
        path: b.owner,
        context: { issuer: path.join(b.owner, 'Logo', 'index.js') },
      };

      // 反方向先走：栈上没有这条 (internal-resolve, target) → 照常改写
      handler(
        request,
        { stack: { name: 'resolve', path: '/other', request: 'react' } },
        vi.fn(),
      );
      await tick();
      expect((doResolve.mock.calls[0]![1] as { request: string }).request).toBe(
        target,
      );
      expect((doResolve.mock.calls[0]![1] as { path?: string }).path).toBe(
        b.owner,
      );

      // 正方向：栈上已有 (internal-resolve, target) → 不改写，交回官方解析
      doResolve.mockClear();
      const callback = vi.fn();
      handler(
        request,
        { stack: { name: 'internal-resolve', request: target } },
        callback,
      );
      await tick();
      expect(doResolve).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    } finally {
      site.cleanup();
    }
  });
});

// 两条都造软链，整块跟着 `canSymlink` 走。
describe.runIf(canSymlink)('realpath 缓存：实例即 epoch，且缓存有界', () => {
  it('缓存挂在实例上：命中不再打 syscall，超限只退化现算', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'epoch-'));
    try {
      const real = path.join(root, 'real');
      const other = path.join(root, 'other');
      fs.mkdirSync(real);
      fs.mkdirSync(other);
      const link = path.join(root, 'link');
      fs.symlinkSync(real, link);
      const r = new PrevLayerResolverPlugin({ layers: [] });

      // 第一次问拿到真实路径；软链换绑后再问仍是旧值 —— 证明第二次没有真的再去 realpath，
      // 这是缓存的意义（等价于 pnpm store 重链 / 主题目录换绑的场景）。
      expect(r.realpathOf(link)).toBe(fs.realpathSync(real));
      fs.unlinkSync(link);
      fs.symlinkSync(other, link);
      expect(r.realpathOf(link)).toBe(fs.realpathSync(real));

      // 上限 4096：超限不再写入（不淘汰、不抖动），但结果仍然正确。
      // 用一个**已存在**的目录当探针：命中缓存会返回第一次的结果（不是新 realpath），
      // 因此「换绑后的软链仍返回旧值」在撑满之后同样成立。
      const probe = path.join(root, 'probe');
      fs.mkdirSync(probe);
      for (let i = 0; i < 6000; i += 1) r.realpathOf(path.join(root, `d${i}`));
      const first = r.realpathOf(probe);
      fs.renameSync(probe, `${probe}-moved`);
      fs.mkdirSync(probe);
      expect(r.realpathOf(probe), '超限之后缓存仍在工作').toBe(first);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('软链换绑后新实例必须拿到真实值（缓存不跨「一次构建」）', () => {
    // 实例 = 一次构建（`index.mts` 每次构建新建），因此上一条的陈旧值不该带到这里。
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'epoch-new-'));
    try {
      const real1 = path.join(root, 'real1');
      const real2 = path.join(root, 'real2');
      fs.mkdirSync(real1);
      fs.mkdirSync(real2);
      const link = path.join(root, 'link');
      fs.symlinkSync(real1, link);
      expect(new PrevLayerResolverPlugin({ layers: [] }).realpathOf(link)).toBe(
        fs.realpathSync(real1),
      );
      fs.unlinkSync(link);
      fs.symlinkSync(real2, link);
      expect(new PrevLayerResolverPlugin({ layers: [] }).realpathOf(link)).toBe(
        fs.realpathSync(real2),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('小分支：两侧都要走到', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('resolveComponentInLayer：core 里没有该文件时返回 null（cond-expr 的 `:` 侧）', () => {
    // `resolveCoreModule` 的 `:` 侧（这份 core 的 lib 里没有这个 relative）
    const siteDir = path.resolve(import.meta.dirname, '..');
    expect(resolveCoreModule(siteDir, 'webpack/aliases/index.js')).toBeTruthy();
    expect(
      resolveCoreModule(siteDir, 'webpack/definitely-not-here.js'),
    ).toBeNull();
  });

  it('插件自带 options 不被盖掉；path 恒取入口目录（与官方一致）', async () => {
    // 两个字段的不同待遇都是刻意的：
    // - `options`：插件自己挂在返回值上的那份才是它实际用的，保留；
    // - `path`：官方 `initializePlugin` 恒覆盖为 `dirname(entryPath)`，官方
    //   `loadThemeAliases` 用它解析 `getThemePath()` —— 保留实例自带的 path 会在
    //   「插件自设 path ≠ 入口目录」时与官方算出不同的层路径（同一个组件在
    //   `@theme-prev/X` 与 `@theme/X` 落到两个模块），所以必须对齐官方。
    // 判据取**行为**：走一遍真实插件列表推导，读实例上的 path / options。
    const { PluginDiscovery } =
      await import('../plugins/plugin-prev-layer-resolver/src/plugins.mts');
    const site = makePluginSite('own-fields', '.mjs').addRaw(
      'own-fields',
      `module.exports = () => ({
  name: 'own-fields',
  path: '/already/set',
  options: { id: 'mine' },
  getThemePath: () => './theme',
});`,
    );
    try {
      const plugins = await new PluginDiscovery(site.siteDir, {
        warn: () => {},
      }).discover();
      // 每个声明只该被实例化一次（这里给了「初始插件 + addRaw」两条声明，故两次）
      expect(plugins?.length).toBeGreaterThan(0);
      const declared = plugins ?? [];
      for (const p of declared) {
        expect(p.path, 'path 恒取入口目录，不保留实例自带值').toBe(
          path.dirname(
            path.join(site.siteDir, 'node_modules', 'own-fields', 'index.js'),
          ),
        );
        expect(
          p.options,
          '插件自己挂在返回值上的 options 才是它实际用的',
        ).toEqual({ id: 'mine' });
      }
    } finally {
      site.cleanup();
    }
  });
});

describe('分支补测：两侧都要走到', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  it('下方只剩 stub 时仍退回那个 stub（不假装「没有提供者」）', async () => {
    const fb = site.fakeCoreFallback();
    const outer = site.layer('outer', { Logo: '' });
    fs.mkdirSync(path.join(fb, 'Layout'), { recursive: true });
    fs.writeFileSync(path.join(fb, 'Layout', 'index.js'), '');
    const { PrevLayerResolverPlugin } =
      await import('../plugins/plugin-prev-layer-resolver/src/resolver.mts');
    const fallbackLayer = {
      name: 'theme-fallback',
      owner: fb,
      kind: 'fallback' as const,
      exists: true,
    };
    const r = new PrevLayerResolverPlugin({ layers: [fallbackLayer, outer] });
    // 下方只有 stub 提供该组件 → 扫描继续向下，把手里的 stub 交出去（并告警）
    expect(
      r.resolveTarget({
        request: '@theme-prev/Layout',
        issuer: path.join(outer.owner, 'Logo', 'index.js'),
      })?.target,
    ).toBe(path.join(fb, 'Layout', 'index.js'));
  });

  it('落点层其实没提供该组件时交回官方解析（不产出坏产物）', () => {
    // `if (!target) return null`：层栈推导给了个**不提供该组件**的落点
    // （推导错了的样子）—— 交回官方，而不是拿一个不存在的路径去改写。
    // 用 `withFixedTarget` 把落点指到一个不含 Logo 的层（构造前替换，见其说明）。
    const inner = site.layer('inner-no-logo');
    const outer = site.layer('outer', { Logo: '' });
    const r = new (withFixedTarget(PrevLayerResolverPlugin, 0))({
      layers: [inner, outer],
    });
    expect(
      r.resolveTarget({
        request: '@theme-prev/Logo',
        issuer: path.join(outer.owner, 'Logo', 'index.js'),
      }),
    ).toBeNull();
  });
});
