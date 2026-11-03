import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  needsShowDocsSourceRule,
  showDocsSourceRule,
  siteBabelConfigPath,
} from '../packages/plugin-compile-source/src/source-js-rule.mts';

import { mkdtempReal } from './helpers.mts';

/**
那条规则的判据与形状 —— 规则住在 `@show-docs/docusaurus-plugin-compile-source`，
**只有那一处**（护栏见 `test/view-layer-copies.test.mts`「TS 源码的编译规则只有一处」）。
入口是否真的交出它，钉在 `test/package-entries.test.mts`。
*/

/**
`loader` 给个哨兵（方便断言它按 isServer 取），同时记下 `getJSLoader` **收到的入参**
—— 「官方那条规则传的那格 babelOptions，这里也传了」只能这样钉。
*/
function utilsWith(isServer: boolean) {
  const calls: unknown[] = [];
  return {
    calls,
    utils: {
      getJSLoader: (options: unknown) => {
        calls.push(options);
        return { loader: `js-loader:${isServer}` };
      },
    } as never,
  };
}

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
    const { utils } = utilsWith(false);
    const rule = showDocsSourceRule(utils, false);

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
    expect(showDocsSourceRule(utilsWith(true).utils, true).use).toEqual([
      { loader: 'js-loader:true' },
    ]);
    expect(showDocsSourceRule(utilsWith(false).utils, false).use).toEqual([
      { loader: 'js-loader:false' },
    ]);
  });

  it('官方那条 JS 规则传的 babelOptions 必须一起传（否则这一族与站点源码两套编译）', () => {
    // 官方那条规则是 `createJsLoader({ isServer, babelOptions: await
    // getCustomBabelConfigFilePath(siteDir) })`（core `lib/webpack/base.js`）。少了 babelOptions
    // 时 `getBabelOptions` 退回 `{ babelrc: false, configFile: false }` + 默认 preset，
    // 于是站点按自己的 `babel.config.js` 编、这一族的源码按默认配置编 —— 差异只在产物里，
    // 构建照绿。
    const client = utilsWith(false);
    showDocsSourceRule(client.utils, false, '/site/babel.config.js');
    expect(client.calls).toEqual([
      { isServer: false, babelOptions: '/site/babel.config.js' },
    ]);

    // 站点没有自定义配置时官方给的是 `undefined`，这里也必须原样是 undefined（不是空串、不是路径）
    const server = utilsWith(true);
    showDocsSourceRule(server.utils, true);
    expect(server.calls[0]).toEqual({
      isServer: true,
      babelOptions: undefined,
    });
  });
});

/**
`siteBabelConfigPath()`：交出去的是**官方那个函数的结果**，判据不自己抄一遍。

过去这一跳要先「从 core 的位置」require `@docusaurus/babel`（它是 core 的依赖，站点根不声明它），
夹具因此得造一份假 core、还只能留在仓库树里上溯。现在本包按自己的依赖清单直接引那一个公开 API，
夹具就只是「有 / 没有 `babel.config.js` 的两个目录」；而官方那个函数是
`join(siteDir, 'babel.config.js')` 加一次存在性检查，纯按 `siteDir` 算。
*/
describe('siteBabelConfigPath()：与官方同源的 babel 配置路径', () => {
  function siteWithBabelConfig(withBabelConfig: boolean): {
    siteDir: string;
    cleanup: () => void;
  } {
    const siteDir = mkdtempReal(path.join(os.tmpdir(), 'babel-rule-site-'));
    if (withBabelConfig) {
      fs.writeFileSync(
        path.join(siteDir, 'babel.config.js'),
        'module.exports = {};\n',
      );
    }
    return {
      siteDir,
      cleanup: () => fs.rmSync(siteDir, { recursive: true, force: true }),
    };
  }

  it('站点有 babel.config.js 时给出它的路径（走的是官方那个函数）', async () => {
    const site = siteWithBabelConfig(true);
    try {
      expect(await siteBabelConfigPath(site.siteDir)).toBe(
        path.join(site.siteDir, 'babel.config.js'),
      );
    } finally {
      site.cleanup();
    }
  });

  it('站点没有时返回 undefined（与官方那条 JS 规则拿到的是同一个值）', async () => {
    const site = siteWithBabelConfig(false);
    try {
      expect(await siteBabelConfigPath(site.siteDir)).toBeUndefined();
    } finally {
      site.cleanup();
    }
  });
});
