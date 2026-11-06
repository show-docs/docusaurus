import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { layerWatchRule } from '../packages/plugin-prev-layer-resolver/src/layer-watch.mts';

import type { ThemeLayer } from './helpers.mts';

/**
「把层目录登记成引用方的上下文依赖」这一条规则的判据。

为什么需要它（不登记就永远吃旧落点），写在 `src/layer-watch.mts` 与
docs/internals.md「层目录的上下文依赖」；这里只钉它的形状：认领哪些文件、把哪些目录交出去。

那份 loader 自己干了什么（源码原样返回 + 逐条登记目录）只有真跑一次构建才看得见，所以不在这里
用一份逻辑替身假装验过 —— 它由真实构建那一轮钉：dev 下往层里新增组件文件，引用方必须重新解析。
这里只钉它没失联：规则点名的 loader 文件名与包内那份 `.cts` 源码成对存在。真跑那一轮现在有自己的门禁 ——
`pnpm verify:context-deps`：两个 bundler 各看「层目录有没有进 `compilation.contextDependencies`」与
「往层里真写一个新组件，引用方会不会被 watcher 重解析」，并带「摘掉这条规则这两趟都不成立」的反向对照。
*/

const SITE = path.join('/', 'site');
const INNER = path.join(SITE, 'node_modules', 'theme-a', 'theme');
const OUTER = path.join(SITE, 'src', 'theme');

function layer(name: string, owner: string, exists = true): ThemeLayer {
  return { exists, kind: 'plugin', name, owner };
}

const layers = [layer('theme-a', INNER), layer('site', OUTER)];

describe('layerWatchRule()：认领哪些文件、交出哪些目录', () => {
  it('层栈为空时不交规则（没有目录可登记）', () => {
    expect(layerWatchRule([])).toBeNull();
  });

  it('不存在的目录既不进 `include`，也不进 loader 的入参', () => {
    const gone = layer('theme-gone', path.join(SITE, 'theme-gone'), false);
    const rule = layerWatchRule([...layers, gone])!;

    expect(rule.use[0]!.options.dirs).toEqual([INNER, OUTER]);
    expect(rule.include(path.join(SITE, 'theme-gone', 'Logo.tsx'))).toBe(false);
  });

  it('层目录里的 JS / TS 系源码认领；层外与其它资源类型不认领', () => {
    const { include, test } = layerWatchRule(layers)!;

    expect(test.test(path.join(OUTER, 'Logo', 'index.tsx'))).toBe(true);
    expect(test.test(path.join(OUTER, 'Logo', 'index.js'))).toBe(true);
    expect(test.test(path.join(OUTER, 'Logo', 'index.mts'))).toBe(true);
    expect(test.test(path.join(OUTER, 'Logo', 'styles.css'))).toBe(false);
    expect(test.test(path.join(OUTER, 'Logo', 'data.json'))).toBe(false);

    expect(include(path.join(OUTER, 'Logo', 'index.tsx'))).toBe(true);
    expect(include(path.join(INNER, 'Logo', 'index.ts'))).toBe(true);
    expect(include(path.join(SITE, 'src', 'pages', 'x.tsx'))).toBe(false);
  });

  it('正斜杠写法一样认领（Windows 上 bundler 两种分隔符都可能交回来）', () => {
    const { include } = layerWatchRule(layers)!;
    expect(include(`${OUTER.replaceAll('\\', '/')}/Logo/index.tsx`)).toBe(true);
  });

  it('彼此是前缀的层目录不互相误命中（`theme` 不认领 `theme-outer` 里的文件）', () => {
    // 层目录嵌套是合法布局（`src/theme` 与 `src/theme/inner`）：前缀必须带尾分隔符才算「在里面」
    const rule = layerWatchRule([
      layer('theme', path.join(SITE, 'theme')),
      layer('theme-outer', path.join(SITE, 'theme-outer')),
    ])!;

    expect(rule.include(path.join(SITE, 'theme-outer', 'A.tsx'))).toBe(true);
    expect(rule.include(path.join(SITE, 'theme-other', 'A.tsx'))).toBe(false);
  });

  /**
  规则点名的那份 loader 由 `import.meta.url` 现拼路径：单测跑在 `src/`、生产跑在 `dist/`，
  两处都不是那份 CommonJS 产物（`.cts` → `.cjs`）所在的位置，所以按**文件名**与包内 `.cts`
  源码成对来判 —— 改名或删源码时这里红，而不是到构建才变成一条 loader 解析失败。
  */
  it('loader 与包内那份 `.cts` 源码成对存在', () => {
    const { use } = layerWatchRule(layers)!;

    expect(path.basename(use[0]!.loader)).toBe('layer-watch-loader.cjs');
    expect(path.isAbsolute(use[0]!.loader)).toBe(true);

    const sourceDir = path.resolve(
      import.meta.dirname,
      '..',
      'packages',
      'plugin-prev-layer-resolver',
      'src',
    );
    expect(fs.existsSync(path.join(sourceDir, 'layer-watch-loader.cts'))).toBe(
      true,
    );
  });

  it('交出去的目录就是层栈的 owner，顺序一致（产地只有一处）', () => {
    const a = layer('theme-a', path.join(SITE, 'a', 'theme'));
    const b = layer('theme-b', path.join(SITE, 'b', 'theme'));

    expect(layerWatchRule([a, b])!.use[0]!.options.dirs).toEqual([
      a.owner,
      b.owner,
    ]);
  });
});
