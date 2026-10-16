import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixtureSite, type ThemeLayer } from './helpers.mts';

const { PrevLayerResolverPlugin } =
  await import('../plugins/plugin-prev-layer-resolver/src/resolver.mts');
// enhanced-resolve 现在是我们自己的 devDependency（类型也来自它），直接用真实模块；
// 解析失败时整组跳过，避免把「依赖缺失」伪装成测试失败。
const enhancedResolve = await import('enhanced-resolve').catch(() => null);

/**
用真实 enhanced-resolve 跑一遍完整链路：
校验我们的 resolver plugin 在「真实 resolver + 真实文件系统」下
也能把 `@theme-prev/X` 解析成「下面那一层」的文件，
而不是只在 mock 里成立。
*/
const d = enhancedResolve ? describe : describe.skip;

d('enhanced-resolve 端到端解析', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
  });
  afterEach(() => site.cleanup());

  function makeResolver(layers: ThemeLayer[]) {
    if (!enhancedResolve) throw new Error('enhanced-resolve 不可用');
    const resolver = enhancedResolve.ResolverFactory.createResolver({
      fileSystem: fs,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    });
    new PrevLayerResolverPlugin({ layers }).apply(resolver);
    return resolver;
  }

  /** 走真实 resolver 的一次请求：`{ issuer }` 是 webpack 交给我们那一份形态 */
  const ask = (
    resolver: ReturnType<typeof makeResolver>,
    dir: string,
    request = '@theme-prev/Logo',
  ) =>
    new Promise((resolve, reject) => {
      resolver.resolve(
        { issuer: path.join(dir, 'Logo', 'index.js') },
        dir,
        request,
        {},
        (err, result) => (err ? reject(err) : resolve(result)),
      );
    });

  it('从最外层请求 @theme-prev/Logo → 解析到下一层的真实文件', async () => {
    const a = site.layer('a', { Logo: 'export default "a"' });
    const b = site.layer('b', { Logo: 'export default "b"' });
    const c = site.layer('c', { Logo: 'export default "c"' });
    const s = site.siteLayer({ Logo: 'export default "site"' });
    const resolver = makeResolver([a, b, c, s]);

    // 四层链逐层下降：每一层都拿到紧邻下面那一层（真实 resolver + 真实文件系统）
    expect(await ask(resolver, s.owner)).toBe(
      path.join(c.owner, 'Logo', 'index.js'),
    );
    expect(await ask(resolver, c.owner)).toBe(
      path.join(b.owner, 'Logo', 'index.js'),
    );
    expect(await ask(resolver, b.owner)).toBe(
      path.join(a.owner, 'Logo', 'index.js'),
    );
    // query 随改写一起返回（官方别名对 `@theme/Logo?raw` 就是这个行为）
    expect(await ask(resolver, s.owner, '@theme-prev/Logo?raw')).toBe(
      `${path.join(c.owner, 'Logo', 'index.js')}?raw`,
    );
  });

  it('最内层请求时交给官方解析 → 真实的 Module not found（而非越界改写）', async () => {
    const a = site.layer('a', { Logo: 'export default "a"' });
    const b = site.layer('b', { Logo: 'export default "b"' });
    // 在 a 层内部请求「下面那一层」——没有下一层，必须报错而不是解析到自己
    await expect(ask(makeResolver([a, b]), a.owner)).rejects.toThrow();
  });

  it('官方别名在真实 resolver 下仍解析到全局赢家（未被改写）', async () => {
    if (!enhancedResolve) throw new Error('enhanced-resolve 不可用');
    const a = site.layer('a', { Logo: 'export default "a"' });
    const s = site.siteLayer({ Logo: 'export default "site"' });
    const resolver = enhancedResolve.ResolverFactory.createResolver({
      fileSystem: fs,
      extensions: ['.js'],
      alias: {
        '@theme/Logo': path.join(s.owner, 'Logo', 'index.js'),
        '@theme-original/Logo': path.join(s.owner, 'Logo', 'index.js'),
      },
    });
    new PrevLayerResolverPlugin({ layers: [a, s] }).apply(resolver as never);

    expect(await ask(resolver, a.owner, '@theme-original/Logo')).toBe(
      path.join(s.owner, 'Logo', 'index.js'),
    );
  });

  it('不支持的 specifier 前缀完全不受影响', async () => {
    const a = site.layer('a', { Logo: '' });
    const s = site.siteLayer({ Logo: '' });
    await expect(
      ask(makeResolver([a, s]), s.owner, '@theme-original/Nope'),
    ).rejects.toThrow();
  });
});
