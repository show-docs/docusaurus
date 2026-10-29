import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  normalizePages,
  RESERVED_FRONTMATTER_KEYS,
} from '../packages/theme-component-page/src/config.mts';

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

  it('options 判法原样通过（「开关，开关上还可以带选项」那一种写法）', () => {
    expect(
      normalizePages([{ ...page, match: 'options' }])[0]!.entry.match,
    ).toBe('options');
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

  it('官方 frontmatter 那一组键名一把都不放过：两种判法都红', () => {
    for (const key of RESERVED_FRONTMATTER_KEYS) {
      red(
        [{ key, component: '@theme/A' }],
        new RegExp(
          String.raw`pages\[0\]\.key「${key}」是官方文档页 frontmatter 的那一组键名之一`,
        ),
      );
      red(
        [{ key, component: '@theme/A', match: 'value' }],
        new RegExp(
          String.raw`pages\[0\]\.key「${key}」是官方文档页 frontmatter`,
        ),
      );
    }
  });

  it('包交出的那一列撞了官方键名：报错点名到是哪个包', () => {
    expect(() =>
      normalizePages([{ key: 'title', component: '@theme/A' }], {
        column: 'pages（@x 交出的）',
      }),
    ).toThrow(/pages（@x 交出的）\[0\]\.key「title」是官方文档页 frontmatter/);
  });

  it('自己的键名撞不上那一组就放过：前缀像官方也算自己的', () => {
    expect(
      normalizePages([{ key: 'report_title', component: '@theme/A' }]).length,
    ).toBe(1);
    expect(
      normalizePages([{ key: 'componentPage', component: '@theme/A' }]).length,
    ).toBe(1);
  });

  it('component 只有 `false` 那一种布尔放过，`true` 仍按「要一个字符串」红', () => {
    expect(
      normalizePages([{ key: 'embed', component: false }], {
        siteColumn: true,
      })[0]!.specifier,
    ).toBe(false);
    red(
      [{ key: 'embed', component: true }],
      /\.component 要一个字符串，拿到的是 boolean/,
    );
  });

  it('component 不许写成 @theme/DocItem：那正是本层接管的那一格，会 import 回自己', () => {
    // 站点与包交出的那一列都认这一条：生成的注册表里那条静态 import 会解析回本层自己的
    // `DocItem`，命中那一页就递归渲染。
    red(
      [{ ...page, component: '@theme/DocItem' }],
      /pages\[0\]（键「report」）的 component 是 @theme\/DocItem：那正是本层接管的那一格/u,
    );
    expect(() =>
      normalizePages([{ ...page, component: '@theme/DocItem' }], {
        column: 'pages（@x 交出的）',
      }),
    ).toThrow(/pages（@x 交出的）\[0\]（键「report」）/u);
  });

  it('关掉一把键那一种记号只出得自站点那一列：包交出的写了就红', () => {
    expect(() =>
      normalizePages([{ key: 'embed', component: false }], {
        column: 'pages（@x 交出的）',
      }),
    ).toThrow(
      /pages（@x 交出的）\[0\]\.component 是 false：关掉一把键只有站点那一列写得算/,
    );
  });

  it('同一把键既开又关：撞键那一条先红，不留两种说法并存', () => {
    expect(() =>
      normalizePages(
        [
          { key: 'embed', component: '@theme/A' },
          { key: 'embed', component: false },
        ],
        { siteColumn: true },
      ),
    ).toThrow(/pages\[1\]\.key「embed」和前面某一条撞了/);
  });

  it('match 只认那三种判法', () => {
    red(
      [{ ...page, match: 42 }],
      /pages\[0\]\.match 只认 'boolean' \/ 'value' \/ 'options'，拿到的是 number/,
    );
    red(
      [{ ...page, match: 'url' }],
      /pages\[0\]\.match 只认 'boolean' \/ 'value' \/ 'options'，拿到的是 string/,
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

/**
上面那条护栏里那份名单，是从装的这个 Docusaurus 里抄来的 —— 抄来的东西会漂。
这一条不测行为，只把名单对回它抄的那一份：升级 Docusaurus 时官方多加一把键名，这里就红，
提醒去看那条护栏是不是漏了一格（而不是等某个站点用新键名把整站正文换掉）。
*/
describe('保留键名单与装的这份 Docusaurus 对齐', () => {
  it('schema 里的每一把官方键名都在名单里，名单里也没有多余的那一把', () => {
    const require = createRequire(import.meta.url);
    const { DocFrontMatterSchema } =
      require('@docusaurus/plugin-content-docs/lib/frontMatter.js') as {
        DocFrontMatterSchema: {
          describe(): { keys?: Record<string, unknown> };
        };
      };

    // 按码位排，不按 locale：这一组键名都带下划线，locale 会把下划线吞掉再比，顺序与另一侧不一致。
    const byCodeUnit = (a: string, b: string): number =>
      a < b ? -1 : a > b ? 1 : 0;

    expect(RESERVED_FRONTMATTER_KEYS.toSorted(byCodeUnit)).toEqual(
      Object.keys(DocFrontMatterSchema.describe().keys ?? {}).toSorted(
        byCodeUnit,
      ),
    );
  });
});
