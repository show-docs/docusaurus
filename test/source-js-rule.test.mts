import { describe, expect, it } from 'vitest';

import { needsSiteJsRule } from '../theme/theme-iframe/lib/api-frame-source-js-rule.ts';

const packageRoot = '/repo/theme/theme-markmap';

describe('needsSiteJsRule()', () => {
  it('工作区里链到包根的源码不认领：官方那条 babel 规则本来就会编译它们', () => {
    expect(
      needsSiteJsRule(packageRoot, `${packageRoot}/theme/DocItem/index.tsx`),
    ).toBe(false);
    expect(needsSiteJsRule(packageRoot, `${packageRoot}/components/x.ts`)).toBe(
      false,
    );
  });

  it('装进 node_modules 之后才认领：官方按 excludeJS 把整个 node_modules 排除在外', () => {
    const installed = `/site/node_modules/@show-docs/docusaurus-theme-markmap`;
    expect(
      needsSiteJsRule(installed, `${installed}/theme/DocItem/index.tsx`),
    ).toBe(true);
    expect(needsSiteJsRule(installed, `${installed}/components/x.tsx`)).toBe(
      true,
    );
  });

  it('node_modules 里那份 docusaurus*.js 仍归官方，不重复认领', () => {
    expect(
      needsSiteJsRule(
        packageRoot,
        '/site/node_modules/docusaurus-theme-classic/lib/index.js',
      ),
    ).toBe(false);
  });

  it('包根之外的文件一律不碰', () => {
    expect(
      needsSiteJsRule(packageRoot, '/repo/src/theme/DocItem/index.tsx'),
    ).toBe(false);
    expect(
      needsSiteJsRule(packageRoot, `${packageRoot}/../theme-erd/x.tsx`),
    ).toBe(false);
  });

  it('非 .ts/.tsx 不认领（同一条规则里的 md、css 交给别的规则）', () => {
    expect(needsSiteJsRule(packageRoot, `${packageRoot}/styles/x.css`)).toBe(
      false,
    );
    expect(needsSiteJsRule(packageRoot, `${packageRoot}/loader/x.mjs`)).toBe(
      false,
    );
  });
});
