import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixtureSite, withFixedTarget } from './helpers.mjs';
const { PrevLayerResolverPlugin } =
  await import('../plugins/plugin-prev-layer-resolver/src/resolver.mjs');

/**
链式覆盖的**不变量**测试。

不针对某一个具体层数，而是对随机（但确定化）生成的层栈穷举断言：

1. 落点不越界：任何层请求 `@theme-prev/X` 的目标都严格在导入者下方；
2. 单调性：越靠外的层，落点越靠外（或相同），严格来说落点下标 `< 导入者下标`；
3. 每层落点就是「紧邻下面那一层」；
4. 顶层请求最终会终止：从最外层逐层下降必然走到链底，不会成环。
*/
describe('链式覆盖不变量', () => {
  let site: ReturnType<typeof makeFixtureSite>;
  beforeEach(() => {
    site = makeFixtureSite();
    // realpath 缓存在 resolver 实例里（每个实例一份），而下面的用例都是新建实例 ——
    // 上一层留下的投影不会带到下一层（层归属按 realpath 前缀判定，命中即判错层）。
  });
  afterEach(() => site.cleanup());

  /**
  生成「组件覆盖面」各不相同的多层链，覆盖各种空洞情形
  */
  const COVERAGE_CASES = [
    ['Logo'],
    ['Logo', 'Logo', 'Logo'],
    ['Logo', 'Logo', 'Logo', 'Logo'],
    ['Logo', 'OnlyInner'],
    ['Logo', 'Logo', 'OnlyInner'],
    ['OnlyOuter', 'Logo', 'Logo'],
  ];

  it.each(COVERAGE_CASES.map((c: string[], i: number) => [i + 1, c] as const))(
    '第 %i 组覆盖面：落点不越界 + 逐层下降可终止',
    (_caseIndex, coverage) => {
      const layers = coverage.map((components: string, i: number) => {
        const names =
          components === 'Logo' ? { Logo: '' } : { Logo: '', [components]: '' };
        // 层名必须唯一：形态完全相同的两层会共用同一个临时目录
        return site.layer(`layer-${i}-${components}`, names);
      });
      const resolver = new PrevLayerResolverPlugin({ layers });

      /**
      该层下方最近的 Logo 提供者（没有则为 -1）
      */
      const nearestBelow = (i: number): number => {
        for (let j = i - 1; j >= 0; j -= 1) {
          if (fs.existsSync(path.join(layers[j]!.owner, 'Logo', 'index.js')))
            return j;
        }
        return -1;
      };

      for (const [i, layer] of layers.entries()) {
        const issuer = path.join(layer!.owner, 'Logo', 'index.js');
        const spec = `@theme-prev/Logo from layer-${i}`;
        const resolved = resolver.resolveTarget({
          request: '@theme-prev/Logo',
          issuer,
        });
        if (!resolved) continue;
        // ① 不会解析到自己
        expect(resolved.target, spec).not.toBe(issuer);
        // ② 落点严格在导入者下方
        expect(resolved.targetIndex, spec).toBeLessThan(i);
        expect(resolved.targetIndex, spec).toBeGreaterThanOrEqual(0);
        // ③ 落点就是「紧邻下面那一层」：下面那层没有该组件时继续向下，不停在空层上
        expect(resolved.targetIndex, `layer-${i}`).toBe(nearestBelow(i));
      }
    },
  );

  it('加长链条不影响已有层的落点（新增层只影响它上面的层）', () => {
    const a = site.layer('a', { Logo: '' });
    const b = site.layer('b', { Logo: '' });
    const at = (l: typeof a): string => path.join(l.owner, 'Logo', 'index.js');
    const layers = [a, b];
    const before = new PrevLayerResolverPlugin({ layers });
    expect(
      before.resolveTarget({ request: '@theme-prev/Logo', issuer: at(b) })
        ?.target,
    ).toBe(at(a));

    const c = site.layer('c', { Logo: '' });
    const after = new PrevLayerResolverPlugin({ layers: [...layers, c] });
    expect(
      after.resolveTarget({ request: '@theme-prev/Logo', issuer: at(b) })
        ?.target,
    ).toBe(at(a));
  });

  /**
  不变量违规的**唯一判据**是 `targetIndex >= issuerIndex`：等于自己与指到上方都属
  「落点越界」，同样破坏模块图无环，处理方式必须一样。
  
  两个方向都枚举，而不是只枚举「等于自己」：只钉 `==` 的话，「落点在上方」就既没人测、
  也没人处理。这里不依赖 specifier 的任何变体，只把 `findTargetLayerIndex` 的返回值换掉。
  */
  it.each([
    ['落点 == 导入者（自己）', 1],
    ['落点 > 导入者（指到上方）', 2],
  ])('不变量违规走注入的 logger 并登记 violations：%s', (_label, badTarget) => {
    const warn = vi.fn();
    const inner = site.layer('inner', { Logo: '' });
    const outer = site.layer('outer', { Logo: '' });
    const resolver = new (withFixedTarget(PrevLayerResolverPlugin, badTarget))({
      layers: [inner, outer],
      logger: { warn },
    });
    const res = resolver.resolveTarget({
      request: '@theme-prev/Logo',
      issuer: path.join(outer.owner, 'Logo', 'index.js'),
    });
    expect(res, '违规时不该改写任何请求').toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('不变量违规');
    expect(resolver.violations.size).toBe(1);
  });
});
