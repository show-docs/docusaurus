import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  declaredNamespaces,
  frameKeyWritten,
  frameSpecUrl,
  matchApiFrameEntry,
  resolveFrameDistribution,
  warnFrameDistribution,
  type FrameDistribution,
} from '../packages/theme-iframe/lib/api-frame-entries.ts';
import {
  apiFrameByNamespace,
  type ApiFrameEntry,
  type ApiFrameEntryInternal,
} from '../packages/theme-iframe/lib/api-frame-registry.ts';

const SCALAR = '@show-docs/docusaurus-theme-scalar';
const REDOC = '@show-docs/docusaurus-theme-redoc';
const STOPLIGHT = '@show-docs/docusaurus-theme-stoplight';
const IFRAME = '@show-docs/docusaurus-theme-iframe';

/** 注册表默认的命名空间顺序（前四条）。 */
const registryOrder = [SCALAR, REDOC, STOPLIGHT, IFRAME];

const distributionOf = (
  plugins: unknown[],
  frontMatter?: Record<string, unknown>,
  pagePath?: string,
): FrameDistribution =>
  resolveFrameDistribution({ plugins }, frontMatter, pagePath);

const namespacesOf = (
  plugins: unknown[],
  frontMatter?: Record<string, unknown>,
): string[] =>
  distributionOf(plugins, frontMatter).entries.map((entry) => entry.namespace);

describe('declaredNamespaces：两份清单合起来报名字', () => {
  it('两份都缺时是空数组；认不出名字的槽位略过', () => {
    expect(declaredNamespaces({})).toEqual([]);
    expect(
      declaredNamespaces({
        plugins: ['a', ['b', { x: 1 }], () => undefined, {}, { name: 3 }],
      }),
    ).toEqual(['a', 'b']);
  });
});

describe('resolveFrameDistribution：判定清单的分发', () => {
  it('无覆盖时按注册表顺序，且只留装了的层', () => {
    expect(namespacesOf(registryOrder)).toEqual(registryOrder);
    // 没装的层不参与 —— 旧行为是照样命中、渲染出指向不存在路由的框
    expect(namespacesOf([SCALAR, REDOC, IFRAME])).toEqual([
      SCALAR,
      REDOC,
      IFRAME,
    ]);
    expect(namespacesOf([])).toEqual([]);
  });

  it('themes 里声明的层也算装机，覆盖选项也从 themes 槽位读', () => {
    // 只写 themes、不写 plugins：两份清单合并后才是真实插件表
    expect(
      resolveFrameDistribution(
        { themes: [SCALAR, IFRAME] },
        undefined,
      ).entries.map((entry) => entry.namespace),
    ).toEqual([SCALAR, IFRAME]);
    // 覆盖清单挂在 themes 里的 iframe 槽位上一样生效
    expect(
      resolveFrameDistribution(
        {
          themes: [
            [IFRAME, { themeConfig: { apiFrame: { order: [REDOC] } } }],
            REDOC,
            SCALAR,
          ],
        },
        undefined,
      ).entries.map((entry) => entry.namespace),
    ).toEqual([REDOC]);
    // 只给 plugins、不给 themes 时退回空清单（也是 `?? []` 的另一条分支）
    expect(
      resolveFrameDistribution(
        { plugins: registryOrder },
        undefined,
      ).entries.map((entry) => entry.namespace),
    ).toEqual(registryOrder);
  });

  it('名字格认裸包名、[包名, 选项]、[路径, 选项] 与 {name} 对象四种写法；路径按包目录段认层', () => {
    const loaded = [
      { name: SCALAR },
      [REDOC],
      [String.raw`D:\code2\test-ci\theme\theme-stoplight\src\index.mts`, {}],
    ];
    // 三条都算装机：包名相等，或路径落在该包的目录段内（与覆盖槽位认法同一条规则，
    // 不再出现「本层认路径、API 层只认包名」的不对称）
    expect(namespacesOf(loaded)).toEqual([SCALAR, REDOC, STOPLIGHT]);
    // 目录段不属于任何一条层的照旧不算装机
    expect(namespacesOf(['/somewhere/else/dist/index.mjs'])).toEqual([]);
    // 相邻目录不误认：`docusaurus-theme-iframe` 那一段不是 `theme-iframe`
    expect(
      namespacesOf([
        String.raw`D:\work\node_modules\@show-docs\docusaurus-theme-iframe\dist\index.mjs`,
      ]),
    ).toEqual([IFRAME]);
    expect(
      namespacesOf([
        String.raw`D:\work\packages\docusaurus-theme-iframe2\dist\index.mjs`,
      ]),
    ).toEqual([]);
  });

  it('覆盖清单换顺序、只判列出的，且同样查装机', () => {
    const override = [REDOC, SCALAR, IFRAME];
    expect(
      namespacesOf([
        [IFRAME, { themeConfig: { apiFrame: { order: override } } }],
        SCALAR,
        REDOC,
        IFRAME,
      ]),
    ).toEqual(override);
    // 列了没装的层**不**照判：装机过滤对覆盖同样生效，并留下一条说明
    const partial = distributionOf([
      [IFRAME, { themeConfig: { apiFrame: { order: [REDOC, SCALAR] } } }],
      REDOC,
    ]);
    expect(partial.entries.map((entry) => entry.namespace)).toEqual([REDOC]);
    expect(partial.warnings.join('\n')).toContain(SCALAR);
  });

  it('覆盖里认不出的命名空间被丢掉并留下一条说明', () => {
    const dist = distributionOf([
      [IFRAME, { themeConfig: { apiFrame: { order: ['no-such', REDOC] } } }],
      SCALAR,
      REDOC,
      IFRAME,
    ]);
    expect(dist.entries.map((entry) => entry.namespace)).toEqual([REDOC]);
    expect(dist.warnings.join('\n')).toContain('no-such');
  });

  it('本层按包目录内的路径声明时（dist 或 src 入口），选项照样取到', () => {
    for (const entryFile of ['dist/index.mjs', 'src/index.mts']) {
      const plugins = [
        [
          `D:/code2/test-ci/packages/theme-iframe/${entryFile}`,
          { themeConfig: { apiFrame: { order: [REDOC] } } },
        ],
        SCALAR,
        REDOC,
      ];
      expect(namespacesOf(plugins)).toEqual([REDOC]);
    }
  });

  it('空数组覆盖有独立语义：这一族全部不判', () => {
    expect(
      namespacesOf([
        [IFRAME, { themeConfig: { apiFrame: { order: [] } } }],
        SCALAR,
      ]),
    ).toEqual([]);
  });

  it('名字格读不出名字的畸形项一律当「不是层」，不抛', () => {
    const loaded = [
      [42, { themeConfig: { apiFrame: { order: [REDOC] } } }],
      null,
      42,
      {},
      { name: undefined },
      SCALAR,
      IFRAME,
    ];
    expect(namespacesOf(loaded)).toEqual([SCALAR, IFRAME]);
    // 覆盖挂在这种读不出名字的槽位上：认不出本层，用默认顺序并留下一条说明（不静默）
    const dist = distributionOf(loaded, undefined);
    expect(dist.entries.map((entry) => entry.namespace)).toEqual([
      SCALAR,
      IFRAME,
    ]);
    expect(dist.warnings.join('\n')).toContain('覆盖未生效');
  });

  it('覆盖清单里重复的层只判一次', () => {
    expect(
      namespacesOf([
        [
          IFRAME,
          { themeConfig: { apiFrame: { order: [REDOC, REDOC, SCALAR] } } },
        ],
        ...registryOrder,
      ]),
    ).toEqual([REDOC, SCALAR]);
  });

  it('键写了、层没参与判定时交回普通文档页，并说明原因', () => {
    // 没装：只装 scalar + iframe，页面却写了 redoc —— redoc 不参与判定，另两层照判。
    // 页面级的消息带页面地址：DocItem 的去重按文本判等，不带地址会吞掉后面同毛病的页。
    const missPlugins = [SCALAR, IFRAME];
    const missFrontMatter = { redoc: true, oas3: '/openapi.yaml' };
    expect(namespacesOf(missPlugins, missFrontMatter)).toEqual([
      SCALAR,
      IFRAME,
    ]);
    expect(
      distributionOf(missPlugins, missFrontMatter, '/docs/a').warnings.join(
        '\n',
      ),
    ).toContain('/docs/a 写了 `redoc: true`');
    expect(
      distributionOf(missPlugins, missFrontMatter, '/docs/a').warnings.join(
        '\n',
      ),
    ).toContain('那个插件没装');
    // 同一毛病换个页面，消息文本不同 —— 去重不会把第二页吞掉
    expect(
      distributionOf(missPlugins, missFrontMatter, '/docs/b').warnings,
    ).not.toEqual(
      distributionOf(missPlugins, missFrontMatter, '/docs/a').warnings,
    );
    // 装了但被覆盖清单排除
    const excluded = distributionOf(
      [
        [IFRAME, { themeConfig: { apiFrame: { order: [IFRAME] } } }],
        ...registryOrder,
      ],
      { redoc: true, oas3: '/openapi.yaml' },
    );
    expect(excluded.entries.map((entry) => entry.namespace)).toEqual([IFRAME]);
    expect(excluded.warnings.join('\n')).toContain('被站点的覆盖清单排除');
    // 装了、也参与了判定 —— 不该有说明
    expect(
      distributionOf(registryOrder, { redoc: true, oas3: '/openapi.yaml' })
        .warnings,
    ).toEqual([]);
    // 布尔键写 `false` = 明确不接这一页：安静地交回普通文档页
    expect(distributionOf([SCALAR, IFRAME], { redoc: false }).warnings).toEqual(
      [],
    );
    // 但 spec 地址还悬着（没有哪一层渲染它）—— 那一条仍要给说明
    expect(
      distributionOf([SCALAR, IFRAME], {
        redoc: false,
        oas3: '/openapi.yaml',
      }).warnings.join('\n'),
    ).toContain('spec 地址得配一把布尔键');
    // 拿不到页面地址时（非路由调用）用不带地址的说法，而不是拼出 `undefined`
    expect(
      distributionOf([SCALAR, IFRAME], {
        redoc: true,
        oas3: '/openapi.yaml',
      }).warnings.join('\n'),
    ).toContain('这一页 写了 `redoc: true`');
  });

  it('外层那把键（`iframe:`）写了、层却没参与判定时也给一条说明', () => {
    // 只装了 scalar，页面却写了 `iframe:` —— 那一层不参与判定，页面交回普通文档页
    const dist = distributionOf([SCALAR], { iframe: '/404' }, '/docs/a');
    expect(dist.warnings.join('\n')).toContain('/docs/a 写了 `iframe:`');
    expect(dist.warnings.join('\n')).toContain('那个插件没装');
  });

  it('键写了却没给 spec 地址：出不了框，给一条说明', () => {
    const dist = distributionOf(registryOrder, { scalar: true }, '/docs/a');
    expect(dist.warnings.join('\n')).toContain(
      '/docs/a 写了 `scalar: true`，但没有 `oas3:`',
    );
    expect(dist.warnings.join('\n')).toContain('这一层不出框');
    // spec 地址给了空串同样算没有
    expect(
      distributionOf(registryOrder, { scalar: true, oas3: '' }).warnings.join(
        '\n',
      ),
    ).toContain('但没有 `oas3:`');
  });

  it('布尔键写成了别的形状（老写法把地址写进 `scalar:`）：那一层不参与判定', () => {
    const dist = distributionOf(
      registryOrder,
      { scalar: '/openapi.yaml' },
      '/docs/a',
    );
    expect(dist.warnings.join('\n')).toContain(
      '/docs/a 写了 `scalar:`，但这一族的键只认布尔 `true`',
    );
    // 值是别的类型（数字、空串）同样落空
    expect(
      distributionOf(registryOrder, { scalar: 1 }).warnings.join('\n'),
    ).toContain('只认布尔 `true`');
    expect(
      distributionOf(registryOrder, { scalar: '' }).warnings.join('\n'),
    ).toContain('只认布尔 `true`');
  });

  it('只给 spec 地址、没写用哪一层渲染：那一格没用，给一条说明', () => {
    const dist = distributionOf(registryOrder, { oas3: '/openapi.yaml' });
    expect(dist.warnings.join('\n')).toContain('写了 `oas3:`');
    expect(dist.warnings.join('\n')).toContain(
      'spec 地址得配一把布尔键指明用哪一层渲染',
    );
    // 布尔键写了就安静了
    expect(
      distributionOf(registryOrder, {
        oas3: '/openapi.yaml',
        stoplight: true,
      }).warnings,
    ).toEqual([]);
  });

  it('覆盖挂在一个认不出是本层的槽位上时不静默：用默认顺序并留下一条说明', () => {
    const dist = distributionOf(
      [
        [
          '/somewhere/else/dist/index.mjs',
          { themeConfig: { apiFrame: { order: [REDOC] } } },
        ],
        ...registryOrder,
      ],
      undefined,
    );
    expect(dist.entries.map((entry) => entry.namespace)).toEqual(registryOrder);
    expect(dist.warnings.join('\n')).toContain('覆盖未生效');
  });
});

describe('matchApiFrameEntry：一层在某一页上命不命中', () => {
  const entryOf = (namespace: string) =>
    apiFrameByNamespace(namespace) as ApiFrameEntry;

  it('内层：键写 `true` 且 `oas3` 给了地址才命中，交回 spec 地址', () => {
    const scalar = entryOf(SCALAR);
    expect(matchApiFrameEntry(scalar, { scalar: true, oas3: '/x.yaml' })).toBe(
      '/x.yaml',
    );
    // 键没写、值不是布尔、spec 缺失 —— 三种都不命中
    expect(matchApiFrameEntry(scalar, { oas3: '/x.yaml' })).toBeUndefined();
    expect(
      matchApiFrameEntry(scalar, { scalar: '/x.yaml', oas3: '/x.yaml' }),
    ).toBeUndefined();
    expect(matchApiFrameEntry(scalar, { scalar: true })).toBeUndefined();
  });

  it('外层：键给一个非空地址就命中，交回那个地址', () => {
    const iframe = entryOf(IFRAME);
    expect(matchApiFrameEntry(iframe, { iframe: '/404' })).toBe('/404');
    expect(matchApiFrameEntry(iframe, { iframe: '' })).toBeUndefined();
    expect(matchApiFrameEntry(iframe, { iframe: true })).toBeUndefined();
    expect(matchApiFrameEntry(iframe, {})).toBeUndefined();
  });

  it('frameKeyWritten / frameSpecUrl：只看形状，不看命中', () => {
    const scalar = entryOf(SCALAR);
    expect(frameKeyWritten(scalar, { scalar: true })).toBe(true);
    expect(frameKeyWritten(scalar, { scalar: false })).toBe(false);
    expect(frameKeyWritten(scalar, { scalar: '/x.yaml' })).toBe(false);
    expect(frameKeyWritten(scalar, {})).toBe(false);
    expect(
      frameSpecUrl(scalar as ApiFrameEntryInternal, { oas3: '/x.yaml' }),
    ).toBe('/x.yaml');
    expect(frameSpecUrl(scalar as ApiFrameEntryInternal, { oas3: '' })).toBe(
      undefined,
    );
    expect(frameSpecUrl(scalar as ApiFrameEntryInternal, {})).toBe(undefined);
  });
});

describe('warnFrameDistribution：开发模式把落空原因打到控制台', () => {
  // 去重那张表是**模块级**的（一份站点进程里只打一次），所以每条消息都带本次独有的编号，
  // 用例之间不会互相吃掉。vitest 每个测试文件一个 worker，跨文件也不会串。
  let seq = 0;
  const unique = (label: string): string => `warning-${seq++}-${label}`;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('每条各打一次，前缀是本包的包名', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = unique('a');
    const second = unique('b');

    warnFrameDistribution([first, second]);

    expect(warn.mock.calls).toEqual([
      [`[theme-iframe] ${first}`],
      [`[theme-iframe] ${second}`],
    ]);
  });

  it('同一条文本反复进来只打第一次（配置级的说明每翻一页都会重算出来）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repeated = unique('same');

    warnFrameDistribution([repeated]);
    warnFrameDistribution([repeated, repeated]);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('空清单什么都不打', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnFrameDistribution([]);

    expect(warn).not.toHaveBeenCalled();
  });
});
