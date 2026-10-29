import { describe, expect, it } from 'vitest';

import {
  needsShowDocsSourceRule,
  showDocsSourceRule,
} from '../packages/plugin-prev-layer-resolver/src/source-js-rule.mts';

/** `loader` 给个哨兵，方便断言它按 isServer 取。 */
const utilsWith = (isServer: boolean) =>
  ({
    getJSLoader: () => ({ loader: `js-loader:${isServer}` }),
  }) as never;

describe('needsShowDocsSourceRule()：这条规则认领哪些文件', () => {
  it('node_modules/@show-docs/ 下那份未编译的 TS 源码认领', () => {
    // 官方那条 babel 规则把整个 node_modules 排除在外（`excludeJS` 只给 `docusaurus*.js[x]`
    // 开例外），装机之后包里随包发布的 `.ts` / `.tsx` 没人编 —— 这一格归这条规则。
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/theme/MarkmapPage/index.tsx',
      ),
    ).toBe(true);
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/components/x.ts',
      ),
    ).toBe(true);
  });

  it('工作区里的源码不认领：pnpm 的软链把它解析到 node_modules 之外，官方那条本来就在编', () => {
    // 再命中一次就是同一份文件跑两遍 babel。
    expect(
      needsShowDocsSourceRule(
        '/repo/packages/theme-markmap/theme/MarkmapPage/index.tsx',
      ),
    ).toBe(false);
    expect(
      needsShowDocsSourceRule('/repo/packages/theme-markmap/components/x.ts'),
    ).toBe(false);
  });

  it('别家的 scope 不认领：这一族只发在 @show-docs 下', () => {
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/docusaurus-theme-classic/src/theme/Foo/index.tsx',
      ),
    ).toBe(false);
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/@other-scope/docusaurus-theme-x/theme/DocItem/index.tsx',
      ),
    ).toBe(false);
  });

  it('声明文件不认领：`.d.ts` 也以 `.ts` 结尾', () => {
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/src/types.d.ts',
      ),
    ).toBe(false);
  });

  it('非 .ts/.tsx 不认领（md、css 归别的规则）', () => {
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/styles/x.css',
      ),
    ).toBe(false);
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/loader/x.mjs',
      ),
    ).toBe(false);
  });

  it('`.mts` / `.cts` 不认领：官方那条规则的 test 同样不含这两类', () => {
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/src/index.mts',
      ),
    ).toBe(false);
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/src/index.cts',
      ),
    ).toBe(false);
  });

  it('分隔符两种都认：Windows 的 `\\` 与 posix 的 `/`', () => {
    expect(
      needsShowDocsSourceRule(
        String.raw`C:\site\node_modules\@show-docs\docusaurus-theme-markmap\theme\MarkmapPage\index.tsx`,
      ),
    ).toBe(true);
  });

  it('pnpm 的隔离布局也认：`node_modules/@show-docs/` 那一段照样在', () => {
    expect(
      needsShowDocsSourceRule(
        '/site/node_modules/.pnpm/@show-docs+docusaurus-theme-markmap@1.0.0/node_modules/@show-docs/docusaurus-theme-markmap/theme/MarkmapPage/index.tsx',
      ),
    ).toBe(true);
  });

  it('只有目录名像、路径里没有 node_modules 那一段的不认领', () => {
    expect(
      needsShowDocsSourceRule(
        '/repo/packages/@show-docs/theme-markmap/theme/MarkmapPage/index.tsx',
      ),
    ).toBe(false);
  });
});

describe('showDocsSourceRule()：规则那几格的形状', () => {
  it('test 只收 .ts / .tsx，include 走上面那条判据，use 是官方给的 loader', () => {
    const rule = showDocsSourceRule(utilsWith(false), false);

    expect(rule.test.test('index.tsx')).toBe(true);
    expect(rule.test.test('index.ts')).toBe(true);
    expect(rule.test.test('index.js')).toBe(false);
    expect(rule.test.test('index.mjs')).toBe(false);

    expect(
      rule.include(
        '/site/node_modules/@show-docs/docusaurus-theme-markmap/theme/MarkmapPage/index.tsx',
      ),
    ).toBe(true);
    expect(
      rule.include('/repo/packages/theme-markmap/theme/MarkmapPage/index.tsx'),
    ).toBe(false);

    expect(rule.use).toEqual([{ loader: 'js-loader:false' }]);
  });

  it('loader 按 isServer 取：客户端与服务端各一份', () => {
    expect(showDocsSourceRule(utilsWith(true), true).use).toEqual([
      { loader: 'js-loader:true' },
    ]);
    expect(showDocsSourceRule(utilsWith(false), false).use).toEqual([
      { loader: 'js-loader:false' },
    ]);
  });
});
