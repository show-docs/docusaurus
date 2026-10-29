import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  componentPageProps,
  componentPageWarnings,
  matchComponentPage,
  warnComponentPages,
  type ComponentPageEntry,
} from '../packages/theme-component-page/lib/component-page.ts';

/**
## 那一层怎么判键、什么时候给话

判据住在 `lib/component-page.ts`，配置期与浏览器期引同一份：`theme/DocItem` 里不抄第二套规则，
所以这里钉的就是页面真命不命中那一件事。`theme/` 那层本身由 e2e 钉（分工见 `test/README.md`）。

清单顺序 = 优先级：一页同时命中两条时只用排在最前那条，而「写了键却没命中」绝不能静默 ——
静默的症状是页面看着正常、配置没生效。
*/

const booleanEntry: ComponentPageEntry = {
  key: 'report',
  match: 'boolean',
};

const valueEntry: ComponentPageEntry = { key: 'embed', match: 'value' };

describe('matchComponentPage：boolean 那臂只认真布尔 true', () => {
  it('true 命中，其余形状都落空', () => {
    expect(matchComponentPage(booleanEntry, { report: true })).toBe(true);

    for (const written of ['true', 1, {}, undefined, null, false]) {
      expect(
        matchComponentPage(booleanEntry, { report: written }),
      ).toBeUndefined();
    }
  });

  it('这一页没有 frontmatter 时落空（不是抛）', () => {
    expect(matchComponentPage(booleanEntry, undefined)).toBeUndefined();
  });
});

describe('matchComponentPage：value 那臂要一串非空文本', () => {
  it('命中的那串文本交回来', () => {
    expect(matchComponentPage(valueEntry, { embed: '/board/1' })).toBe(
      '/board/1',
    );
  });

  it('空串与非字符串都落空', () => {
    for (const written of ['', true, 42, {}]) {
      expect(
        matchComponentPage(valueEntry, { embed: written }),
      ).toBeUndefined();
    }
  });
});

describe('componentPageProps：配置那格垫底，本页那三份盖在上面', () => {
  it('同名的键以本页那三份为准（配置盖不掉本页事实）', () => {
    const entry: ComponentPageEntry = {
      key: 'embed',
      match: 'value',
      props: {
        frontMatter: '假的',
        value: '假的',
        content: '假的',
        height: '480',
      },
    };

    expect(
      componentPageProps(entry, '/board/1', { embed: '/board/1' }, undefined),
    ).toEqual({
      frontMatter: { embed: '/board/1' },
      value: '/board/1',
      height: '480',
    });
  });

  it('不冲突的那些键原样并进来；props 缺席时只有那三份', () => {
    expect(
      componentPageProps(
        { key: 'report', match: 'boolean', props: { title: '报表' } },
        true,
        { report: true },
        'MDX',
      ),
    ).toEqual({
      frontMatter: { report: true },
      value: true,
      content: 'MDX',
      title: '报表',
    });

    expect(
      componentPageProps(
        { key: 'report', match: 'boolean' },
        true,
        { report: true },
        'MDX',
      ),
    ).toEqual({ frontMatter: { report: true }, value: true, content: 'MDX' });
  });

  it('这一页没写 frontmatter 时交一个空对象，而不是 undefined', () => {
    expect(
      componentPageProps(
        { key: 'report', match: 'boolean' },
        true,
        undefined,
        undefined,
      ),
    ).toEqual({ frontMatter: {}, value: true });
  });

  it('配置那格不是复制出来的：改入参不影响条目', () => {
    const props = { height: '480' };
    const entry: ComponentPageEntry = { key: 'embed', match: 'value', props };

    const result = componentPageProps(entry, '/b', { embed: '/b' }, undefined);
    result.height = '600';

    expect(props).toEqual({ height: '480' });
  });
});

describe('componentPageWarnings：写了键却没命中要给一条', () => {
  it('这把键没写：一句都不说（这一层等于透明）', () => {
    expect(componentPageWarnings([booleanEntry], { title: 'x' })).toEqual([]);
    expect(componentPageWarnings([booleanEntry], undefined)).toEqual([]);
  });

  it('boolean 那条写了串文本：点名键名、这条判法与它要的的形状', () => {
    expect(
      componentPageWarnings([booleanEntry], { report: '/x' }, '/docs/a'),
    ).toEqual([
      '/docs/a 写了 `report:`，但清单里这一条按 `boolean` 判，要的是真布尔 `true`，这一条不参与，交回普通文档页。',
    ]);
  });

  it('value 那条写了 true：说的是另一种形状，页面地址缺时用一个通用说法', () => {
    expect(componentPageWarnings([valueEntry], { embed: true })).toEqual([
      '这一页 写了 `embed:`，但清单里这一条按 `value` 判，要的是一串非空文本，这一条不参与，交回普通文档页。',
    ]);
  });

  it('一页同时命中两条：只用排在最前那条，其余点名', () => {
    expect(
      componentPageWarnings(
        [booleanEntry, valueEntry],
        { report: true, embed: '/board/1' },
        '/docs/b',
      ),
    ).toEqual([
      '/docs/b 同时命中清单里 2 条（`report:` / `embed:`），按清单顺序只用排在最前那一条，其余被忽略 —— 一页写两把键通常是手误。',
    ]);
  });

  it('只命中一条时不给那条话', () => {
    expect(
      componentPageWarnings([booleanEntry, valueEntry], { report: true }),
    ).toEqual([]);
  });
});

describe('warnComponentPages：每种文本只打一次', () => {
  const spy = vi.spyOn(console, 'warn');

  afterEach(() => {
    spy.mockClear();
  });

  it('第一遍打，第二遍同一条不再打（同一页反复渲染会重算出同一条）', () => {
    const unique = `/docs/only-${Date.now()}`;
    const warnings = componentPageWarnings(
      [booleanEntry],
      { report: 1 },
      unique,
    );

    warnComponentPages(warnings);
    warnComponentPages(warnings);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(`[theme-component-page] ${warnings[0]}`);
  });

  it('两条不同的都打', () => {
    const unique = `/docs/both-${Date.now()}`;

    warnComponentPages([`${unique}-a`, `${unique}-b`]);

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
