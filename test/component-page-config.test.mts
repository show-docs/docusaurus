import { describe, expect, it } from 'vitest';

import { normalizePages } from '../packages/theme-component-page/src/config.mts';

/**
## 站点配置里那一列清单怎么变成条目

`normalizePages` 是配置期唯一一道形状关：这里放过的每一格，都会原样铺进浏览器读得到的生成模块。
红在这里的每一种形状都点名到 `pages[下标].哪一格` —— 让站点作者改配置时看到的是「第几条、
哪一格、拿到的是什么」，而不是构建期一句 `Module not found`。

本层的入口（`src/index.mts`）只把选项里那一格交进来，所以这些用例同时是「入口调用即红」的那一格。
*/

const page = { key: 'report', component: '@theme/ReportPage' };

describe('normalizePages：整列通过的样子', () => {
  it('没写 pages 与写了空列都是空清单（装了本层却一条没配是合法的）', () => {
    expect(normalizePages(undefined)).toEqual([]);
    expect(normalizePages([])).toEqual([]);
  });

  it('一条最小配置：判法默认 boolean，静态入参缺席', () => {
    expect(normalizePages([page])).toEqual([
      {
        entry: { key: 'report', match: 'boolean', props: undefined },
        specifier: '@theme/ReportPage',
      },
    ]);
  });

  it('判法与静态入参都写上：原样带走那一格', () => {
    expect(
      normalizePages([
        {
          ...page,
          match: 'value',
          props: { height: '480', nested: { a: 1 } },
        },
      ]),
    ).toEqual([
      {
        entry: {
          key: 'report',
          match: 'value',
          props: { height: '480', nested: { a: 1 } },
        },
        specifier: '@theme/ReportPage',
      },
    ]);
  });

  it('顺序原样保留：那一串就是命中优先级', () => {
    const [first, second] = normalizePages([
      { key: 'a', component: '@theme/A' },
      { key: 'b', component: '@theme/B' },
    ]);

    expect([first?.entry.key, second?.entry.key]).toEqual(['a', 'b']);
  });
});

describe('normalizePages：每一种写歪都点名到那一格', () => {
  const red = (declared: unknown, message: RegExp): void => {
    expect(() => normalizePages(declared)).toThrow(message);
  };

  it('清单本身不是数组', () => {
    red('pages', /pages 要一个数组，拿到的是 string/);
    red(null, /拿到的是 null/);
    red({}, /拿到的是 object/);
  });

  it('某一条不是对象', () => {
    red(['@theme/A'], /pages\[0\] 要一个对象，拿到的是 string/);
    red([null], /pages\[0\] 要一个对象，拿到的是 null/);
    red([[]], /pages\[0\] 要一个对象，拿到的是 数组/);
  });

  it('key 与 component 各要一个非空串', () => {
    red([{}], /pages\[0\]\.key 要一个字符串，拿到的是 undefined/);
    red([{ ...page, key: '' }], /pages\[0\]\.key 不能是空串/);
    red(
      [{ key: 'report' }],
      /pages\[0\]\.component 要一个字符串，拿到的是 undefined/,
    );
    red([{ ...page, component: '' }], /pages\[0\]\.component 不能是空串/);
  });

  it('两条用了同一把键：一把键只能有一条', () => {
    red(
      [page, { ...page, component: '@theme/Other' }],
      /key「report」和前面某一条撞了/,
    );
  });

  it('match 只认那两种判法', () => {
    red(
      [{ ...page, match: 42 }],
      /pages\[0\]\.match 只认 'boolean' \/ 'value'，拿到的是 number/,
    );
    red(
      [{ ...page, match: 'url' }],
      /pages\[0\]\.match 只认 'boolean' \/ 'value'，拿到的是 string/,
    );
  });

  it('props 要么缺席，要么一个普通对象', () => {
    red(
      [{ ...page, props: '480' }],
      /pages\[0\]\.props 要一个普通对象，拿到的是 string/,
    );
    red(
      [{ ...page, props: null }],
      /pages\[0\]\.props 要一个普通对象，拿到的是 null/,
    );
    red(
      [{ ...page, props: ['a'] }],
      /pages\[0\]\.props 要一个普通对象，拿到的是 数组/,
    );
  });

  it('props 深处那种留不进生成模块的值，点名到具体哪一格', () => {
    // 函数与 undefined 会静默消失，NaN 会写成 null，所以这些都在配置期红，红话带完整路径。
    red(
      [{ ...page, props: { onClick() {} } }],
      /pages\[0\]\.props\.onClick 是 function，进不了生成模块/,
    );
    red(
      [{ ...page, props: { a: { b: [undefined] } } }],
      /pages\[0\]\.props\.a\.b\[0\] 是 undefined，进不了生成模块/,
    );
    red(
      [{ ...page, props: { hidden: Symbol('x') } }],
      /pages\[0\]\.props\.hidden 是 symbol，进不了生成模块/,
    );
    red(
      [{ ...page, props: { ratio: NaN } }],
      /pages\[0\]\.props\.ratio 是 NaN，进不了生成模块/,
    );
    red(
      [{ ...page, props: { ratio: Infinity } }],
      /pages\[0\]\.props\.ratio 是 Infinity，进不了生成模块/,
    );
  });

  it('props 深处那些写出去会变形的对象同样红', () => {
    red(
      [{ ...page, props: { since: new Date(0) } }],
      /pages\[0\]\.props\.since 是另一种对象，进不了生成模块/,
    );
    red(
      [{ ...page, props: { tags: new Set(['a']) } }],
      /pages\[0\]\.props\.tags 是另一种对象，进不了生成模块/,
    );
  });

  it('props 深处自己绕回自己：红在来路那一步，不是等 JSON 抛', () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;

    red(
      [{ ...page, props: loop }],
      /pages\[0\]\.props\.self 绕回了自己，进不了生成模块/,
    );
  });

  it('普通对象与数组的每种嵌套都放过（含空的那一格与没有原型的对象）', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.deep = 1;

    expect(
      normalizePages([
        {
          ...page,
          props: {
            text: 'a',
            count: 0,
            on: true,
            none: null,
            list: [1, 'two', { three: [false] }],
            emptyObject: {},
            emptyList: [],
            bare,
          },
        },
      ])[0]?.entry.props?.list,
    ).toEqual([1, 'two', { three: [false] }]);
  });
});
