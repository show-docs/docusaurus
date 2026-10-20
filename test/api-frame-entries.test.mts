import { describe, expect, it } from 'vitest';

import {
  resolveFrameDistribution,
  type FrameDistribution,
} from '../theme/theme-iframe/lib/api-frame-entries.ts';

const SCALAR = '@show-docs/docusaurus-theme-scalar';
const REDOC = '@show-docs/docusaurus-theme-redoc';
const STOPLIGHT = '@show-docs/docusaurus-theme-stoplight';
const IFRAME = '@show-docs/docusaurus-theme-iframe';

/** 注册表默认的命名空间顺序（前四条）。 */
const registryOrder = [SCALAR, REDOC, STOPLIGHT, IFRAME];

const distributionOf = (
  plugins: unknown[],
  frontMatter?: Record<string, unknown>,
): FrameDistribution => resolveFrameDistribution(plugins, frontMatter);

const namespacesOf = (
  plugins: unknown[],
  frontMatter?: Record<string, unknown>,
): string[] =>
  distributionOf(plugins, frontMatter).entries.map((entry) => entry.namespace);

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

  it('名字格认裸包名、[包名, 选项]、[路径, 选项] 与 {name} 对象四种写法', () => {
    const loaded = [
      { name: SCALAR },
      [REDOC],
      [
        String.raw`D:\code2\test-ci\theme\theme-stoplight\src\index.mts`,
        STOPLIGHT,
      ],
    ];
    // 第三条的路径不是 stoplight 的包名，名字取到的是路径 → 不算 stoplight 装机
    expect(namespacesOf(loaded)).toEqual([SCALAR, REDOC]);
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
          `D:/code2/test-ci/theme/theme-iframe/${entryFile}`,
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

  it('键写了、层没参与判定时交回普通文档页，并说明原因', () => {
    // 没装：只装 scalar + iframe，页面却写了 redoc —— redoc 不参与判定，另两层照判
    const missPlugins = [SCALAR, IFRAME];
    const missFrontMatter = { redoc: '/openapi.yaml' };
    expect(namespacesOf(missPlugins, missFrontMatter)).toEqual([
      SCALAR,
      IFRAME,
    ]);
    expect(
      distributionOf(missPlugins, missFrontMatter).warnings.join('\n'),
    ).toContain('那个插件没装');
    // 装了但被覆盖清单排除
    const excluded = distributionOf(
      [
        [IFRAME, { themeConfig: { apiFrame: { order: [IFRAME] } } }],
        ...registryOrder,
      ],
      { redoc: '/openapi.yaml' },
    );
    expect(excluded.entries.map((entry) => entry.namespace)).toEqual([IFRAME]);
    expect(excluded.warnings.join('\n')).toContain('被站点的覆盖清单排除');
    // 装了、也参与了判定 —— 不该有说明
    expect(
      distributionOf(registryOrder, { redoc: '/openapi.yaml' }).warnings,
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
