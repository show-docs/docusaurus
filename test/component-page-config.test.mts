import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import {
  normalizeContribution,
  normalizeSiteColumn,
  normalizeSiteRules,
  RESERVED_EXPORT_KEYS,
  RESERVED_FRONTMATTER_KEYS,
} from '../packages/theme-component-page/src/config.mts';

/**
## 站点那一列与包交回的那两列怎么变成条目

`config.mts` 是配置期唯一一道形状关：这里放过的每一格，都会原样铺进浏览器读得到的生成模块，
`render: 'iframe'` 的那几条还要再跨一次 postMessage。红在这里的每一种形状都点名到
`rules[下标].哪一格` / `components[下标].哪一格` —— 让站点作者改配置时看到的是「第几条、
哪一格、拿到的是什么」，而不是构建期一句 `Module not found`。

入口（`src/index.mts`）只把站点选项里那两格交进来（`normalizeSiteColumn`），各包交回的整格由
`src/contribute.mts` 送进 `normalizeContribution`，所以这些用例同时是「入口调用即红」的那一格。
两列**合成**一张表（引用 / 覆写 / 关掉三种臂、重名与抢键、剩余默认规则按键名排在后面）
由 `test/component-page-contrib.test.mts` 钉。
*/

/** 站点自己写的一条完整规则：`component` 那一格是**登记名**，不是模块说明符。 */
const rule = { key: 'report', component: 'site/report' };

/**
规则臂：`normalizeSiteRules` 交回的三种臂（规则 / 引用 / 关掉）里，这一族用例只吃规则那一种。
臂不对就是它自己该红，所以这里直接点名，而不是靠属性访问撞出一句 TypeError。
*/
const firstRule = (
  items: ReturnType<typeof normalizeSiteRules>,
): Extract<(typeof items)[number], { kind: 'rule' }>['rule'] => {
  const [item] = items;
  if (item?.kind !== 'rule') {
    throw new TypeError(
      `那一条该是规则臂，拿到的是「${String(item?.kind)}」臂`,
    );
  }

  return item.rule;
};

describe('normalizeSiteRules：整列通过的样子', () => {
  it('没写 rules 与写了空列都是空清单（装了本层却一条没配是合法的）', () => {
    expect(normalizeSiteRules(undefined)).toEqual([]);
    expect(normalizeSiteRules([])).toEqual([]);
  });

  it('一条最小规则：判法默认 boolean，落点默认 page，读法默认 auto，静态入参缺席', () => {
    expect(normalizeSiteRules([rule])).toEqual([
      {
        kind: 'rule',
        rule: {
          key: 'report',
          component: 'site/report',
          id: 'site/report',
          match: 'boolean',
          source: 'auto',
          render: 'page',
          props: undefined,
        },
      },
    ]);
  });

  it('判法、读法、落点与静态入参都写上：原样带走每一格', () => {
    expect(
      firstRule(
        normalizeSiteRules([
          {
            ...rule,
            match: 'value',
            source: 'frontMatter',
            render: 'iframe',
            props: { height: '480', nested: { a: 1 } },
          },
        ]),
      ),
    ).toMatchObject({
      match: 'value',
      source: 'frontMatter',
      render: 'iframe',
      props: { height: '480', nested: { a: 1 } },
    });
  });

  it('一串键名是一条引用，`enabled: false` 是一条禁用：两种臂都不带规则内容', () => {
    expect(normalizeSiteRules(['scalar'])).toEqual([
      { kind: 'reference', key: 'scalar' },
    ]);
    expect(normalizeSiteRules([{ key: 'redoc', enabled: false }])).toEqual([
      { kind: 'disabled', key: 'redoc' },
    ]);
  });

  it('options / any 两种判法原样通过（「开关带选项」、「三种形状都认」）', () => {
    for (const match of ['options', 'any'] as const) {
      expect(firstRule(normalizeSiteRules([{ ...rule, match }])).match).toBe(
        match,
      );
    }
  });

  it('顺序原样保留：那一串就是命中优先级', () => {
    const items = normalizeSiteRules([
      { key: 'a', component: 'x' },
      { key: 'b', component: 'y' },
    ]);

    expect(
      items.map((item) => (item.kind === 'rule' ? item.rule.key : item.kind)),
    ).toEqual(['a', 'b']);
  });
});

describe('normalizeSiteRules：每一种写歪都点名到那一格', () => {
  const red = (declared: unknown, message: RegExp): void => {
    expect(() => normalizeSiteRules(declared)).toThrow(message);
  };

  it('清单本身不是数组', () => {
    red('rules', /rules 要一个数组，拿到的是 string/);
    red(null, /要一个数组，拿到的是 null/);
    red({}, /要一个数组，拿到的是 object/);
  });

  it('某一条既不是字符串也不是对象', () => {
    red(
      [42],
      /rules\[0\] 要一个字符串（引用一条默认规则）或一个对象，拿到的是 number/,
    );
    red(
      [[]],
      /rules\[0\] 要一个字符串（引用一条默认规则）或一个对象，拿到的是 数组/,
    );
    red(
      [null],
      /rules\[0\] 要一个字符串（引用一条默认规则）或一个对象，拿到的是 null/,
    );
  });

  it('引用那一串不能是空文本', () => {
    red([''], /rules\[0\] 是一串空文本：引用一条默认规则要写那把键的名字/);
  });

  it('key 与 component 各要一个非空串', () => {
    red([{}], /rules\[0\]\.key 要一个字符串，拿到的是 undefined/);
    red([{ ...rule, key: '' }], /rules\[0\]\.key 不能是空串/);
    red(
      [{ key: 'report' }],
      /rules\[0\]\.component 要一个字符串，拿到的是 undefined/,
    );
    red([{ key: 'report', component: '' }], /rules\[0\]\.component 不能是空串/);
  });

  it('同一把键在这一列里只算一条账：引用、覆写、禁用混着写也红', () => {
    red(
      [rule, { ...rule, component: 'site/Other' }],
      /键「report」在这份 rules 里出现了不止一次/,
    );
    red(
      ['report', rule],
      /rules\[1\] 的键「report」在这份 rules 里出现了不止一次/,
    );
    red(
      [{ key: 'report', enabled: false }, 'report'],
      /rules\[1\] 的键「report」在这份 rules 里出现了不止一次/,
    );
  });

  it('官方 frontmatter 那一组键名一把都不放过：完整规则与禁用两种臂都红', () => {
    for (const key of RESERVED_FRONTMATTER_KEYS) {
      red(
        [{ key, component: 'site/A' }],
        new RegExp(
          String.raw`rules\[0\]\.key「${key}」是官方文档页 frontmatter 的那一组键名之一`,
        ),
      );
      // 禁用那一臂写的也是键名，同样过这道（引用那一臂是一串键名，红在合成那张表那一步：
      // 没有任何包会交出官方键名那条默认规则，见 `test/component-page-contrib.test.mts`）。
      red(
        [{ key, enabled: false }],
        new RegExp(
          String.raw`rules\[0\]\.key「${key}」是官方文档页 frontmatter`,
        ),
      );
    }
  });

  it('Docusaurus 给每份 MDX 模块注入的那五个导出名同样不许当键', () => {
    // 判据除了 frontmatter 也读模块上的同名导出：拿 `metadata` 当键，`any` 会在整站每一页命中。
    for (const key of RESERVED_EXPORT_KEYS) {
      red(
        [{ key, component: 'site/A' }],
        new RegExp(
          String.raw`rules\[0\]\.key「${key}」是 Docusaurus 给每份 MDX 模块注入的导出名之一`,
        ),
      );
    }

    // 两份名单各管一处来源，不该重叠：叠上了报错就会指错那一句。
    expect(
      RESERVED_EXPORT_KEYS.filter((key) =>
        RESERVED_FRONTMATTER_KEYS.includes(key),
      ),
    ).toEqual([]);
  });

  it('自己的键名撞不上那两组就放过：前缀像官方也算自己的', () => {
    expect(
      normalizeSiteRules([{ key: 'report_title', component: 'site/A' }]),
    ).toHaveLength(1);
    expect(
      normalizeSiteRules([{ key: 'componentPage', component: 'site/A' }]),
    ).toHaveLength(1);
  });

  it('match 只认那四种判法', () => {
    red(
      [{ ...rule, match: 42 }],
      /rules\[0\]\.match 只认 'boolean' \/ 'value' \/ 'options' \/ 'any'，拿到的是 number/,
    );
    red(
      [{ ...rule, match: 'url' }],
      /rules\[0\]\.match 只认 'boolean' \/ 'value' \/ 'options' \/ 'any'，拿到的是 string/,
    );
  });

  it('source 只认那两种读法，render 只认那两种落点', () => {
    red(
      [{ ...rule, source: 'module' }],
      /rules\[0\]\.source 只认 'auto' \/ 'frontMatter'，拿到的是 string/,
    );
    red(
      [{ ...rule, render: 'modal' }],
      /rules\[0\]\.render 只认 'page' \/ 'iframe'，拿到的是 string/,
    );
  });

  it('props 要么缺席，要么一个普通对象', () => {
    red(
      [{ ...rule, props: '480' }],
      /rules\[0\]\.props 要一个普通对象，拿到的是 string/,
    );
    red(
      [{ ...rule, props: null }],
      /rules\[0\]\.props 要一个普通对象，拿到的是 null/,
    );
    red(
      [{ ...rule, props: ['a'] }],
      /rules\[0\]\.props 要一个普通对象，拿到的是 数组/,
    );
  });

  it('props 深处那种留不进生成模块的值，点名到具体哪一格', () => {
    // 函数与 undefined 会静默消失，NaN 会写成 null，所以这些都在配置期红，红话带完整路径。
    red(
      [{ ...rule, props: { onClick() {} } }],
      /rules\[0\]\.props\.onClick 是 function，进不了生成模块/,
    );
    red(
      [{ ...rule, props: { a: { b: [undefined] } } }],
      /rules\[0\]\.props\.a\.b\[0\] 是 undefined，进不了生成模块/,
    );
    red(
      [{ ...rule, props: { hidden: Symbol('x') } }],
      /rules\[0\]\.props\.hidden 是 symbol，进不了生成模块/,
    );
    red(
      [{ ...rule, props: { ratio: NaN } }],
      /rules\[0\]\.props\.ratio 是 NaN，进不了生成模块/,
    );
    red(
      [{ ...rule, props: { ratio: Infinity } }],
      /rules\[0\]\.props\.ratio 是 Infinity，进不了生成模块/,
    );
  });

  it('props 深处那些写出去会变形的对象同样红', () => {
    red(
      [{ ...rule, props: { since: new Date(0) } }],
      /rules\[0\]\.props\.since 是另一种对象，进不了生成模块/,
    );
    red(
      [{ ...rule, props: { tags: new Set(['a']) } }],
      /rules\[0\]\.props\.tags 是另一种对象，进不了生成模块/,
    );
  });

  it('props 深处自己绕回自己：红在来路那一步，不是等 JSON 抛', () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;

    red(
      [{ ...rule, props: loop }],
      /rules\[0\]\.props\.self 绕回了自己，进不了生成模块/,
    );
  });

  it('普通对象与数组的每种嵌套都放过（含空的那一格与没有原型的对象）', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.deep = 1;

    expect(
      firstRule(
        normalizeSiteRules([
          {
            ...rule,
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
        ]),
      ).props?.list,
    ).toEqual([1, 'two', { three: [false] }]);
  });
});

describe('normalizeSiteColumn 的 components 那一格：登记名 + 说明符', () => {
  const column = (components: unknown) =>
    normalizeSiteColumn(components, []).components;

  it('没写与写了空列都是空登记表', () => {
    expect(normalizeSiteColumn(undefined, undefined)).toEqual({
      components: [],
      rules: [],
    });
    expect(column([])).toEqual([]);
  });

  it('一条登记：原样带走登记名与说明符', () => {
    expect(
      column([{ id: 'site/report', component: '@theme/ReportPage' }]),
    ).toEqual([{ id: 'site/report', specifier: '@theme/ReportPage' }]);
  });

  it('id 与 component 各要一个非空串，同一列里登记名不能重复', () => {
    expect(() => column([{}])).toThrow(
      /站点配置\.components\[0\]\.id 要一个字符串，拿到的是 undefined/,
    );
    expect(() => column([{ id: 'a' }])).toThrow(
      /站点配置\.components\[0\]\.component 要一个字符串，拿到的是 undefined/,
    );
    expect(() =>
      column([
        { id: 'a', component: '@theme/A' },
        { id: 'a', component: '@theme/B' },
      ]),
    ).toThrow(/站点配置\.components\[1\]\.id「a」和同一列里前面某一条撞了/);
  });

  it('说明符不许写成 @theme/DocItem：那正是本层接管的那一格，会 import 回自己', () => {
    // 生成的注册表里那条静态 import 会解析回本层自己的 `DocItem`，命中那一页就递归渲染。
    expect(() => column([{ id: 'a', component: '@theme/DocItem' }])).toThrow(
      /站点配置\.components\[0\]（登记名「a」）的 component 是 @theme\/DocItem：那正是本层接管的那一格/u,
    );
  });

  it('组件那一格不是数组 / 某一条不是对象都点名到那一格', () => {
    expect(() => column('components')).toThrow(
      /站点配置\.components 要一个数组，拿到的是 string/,
    );
    expect(() => column(['@theme/A'])).toThrow(
      /站点配置\.components\[0\] 要一个对象，拿到的是 string/,
    );
  });
});

describe('normalizeContribution：包交回的那两列按同一条校验', () => {
  const contribution = (declared: unknown) =>
    normalizeContribution(declared, 'componentPage（@x 交出的）');

  it('两格都收，形状与站点那一列同一条校验', () => {
    expect(
      contribution({
        components: [{ id: 'redoc', component: '@theme/RedocView' }],
        rules: [{ key: 'redoc', component: 'redoc', render: 'iframe' }],
      }),
    ).toEqual({
      components: [{ id: 'redoc', specifier: '@theme/RedocView' }],
      rules: [
        {
          key: 'redoc',
          component: 'redoc',
          id: 'redoc',
          match: 'boolean',
          source: 'auto',
          render: 'iframe',
          props: undefined,
        },
      ],
    });
  });

  it('只交组件不交规则是合法的（规则由站点自己写）', () => {
    expect(
      contribution({ components: [{ id: 'a', component: '@theme/A' }] }),
    ).toEqual({
      components: [{ id: 'a', specifier: '@theme/A' }],
      rules: [],
    });
    expect(
      contribution({ rules: [{ key: 'a', component: 'a' }] }).components,
    ).toEqual([]);
  });

  it('报错里的列名带上「谁交的」，撞官方键名时点得出包名', () => {
    expect(() =>
      contribution({ rules: [{ key: 'title', component: 'a' }] }),
    ).toThrow(
      /componentPage（@x 交出的）\.rules\[0\]\.key「title」是官方文档页 frontmatter/,
    );
  });

  it('同一包内撞键按重复报（同源不是豁免理由）', () => {
    expect(() =>
      contribution({
        rules: [
          { key: 'a', component: 'x' },
          { key: 'a', component: 'y' },
        ],
      }),
    ).toThrow(
      /componentPage（@x 交出的）\.rules\[1\]\.key「a」和同一列里前面某一条撞了/,
    );
  });

  it('整格不是对象：点名到哪一格都说不出口，就先点名整格', () => {
    expect(() => contribution('componentPage')).toThrow(
      /componentPage（@x 交出的） 要一个对象（`\{ components, rules \}`），拿到的是 string/,
    );
  });

  it('包交出的那一列不认站点那两种臂：引用与「关掉一把键」都红', () => {
    // 包不能替站点决定「这把键不生效」，也不能引用一把别处的默认规则。
    expect(() => contribution({ rules: ['redoc'] })).toThrow(
      /componentPage（@x 交出的）\.rules\[0\] 要一个对象，拿到的是 string/,
    );
    expect(() =>
      contribution({
        rules: [{ key: 'redoc', component: 'redoc', enabled: false }],
      }),
    ).toThrow(
      /componentPage（@x 交出的）\.rules\[0\] 写了 `enabled`：关掉一把键/,
    );
  });

  it('包交出的规则里 `component` 写成布尔也红（关掉一把键只有站点那一列写得算）', () => {
    expect(() =>
      contribution({ rules: [{ key: 'a', component: false }] }),
    ).toThrow(
      /componentPage（@x 交出的）\.rules\[0\]\.component 要一个字符串，拿到的是 boolean/,
    );
  });
});

/**
上面那两条护栏里那份名单，是从装的这个 Docusaurus 里抄来的 —— 抄来的东西会漂。
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
