import { describe, expect, it } from 'vitest';

import { isolateRendererCss } from '../packages/theme-iframe/lib/isolate-renderer-css.ts';

type Rule = Record<string, unknown>;

/** 官方 `base.js` 里那几条跟这一格有关的规则（形状照抄，值不重要）。 */
const officialRules = (): Rule[] => [
  // `rules[0]` 那条 `...`：项目内所有规则都排在它**之后**，它自己不去匹配文件。
  { oneOf: [] },
  { test: /\.mdx?$/, use: [{ loader: 'mdx-loader' }] },
  {
    test: /\.css$/i,
    exclude: /\.module\.css$/i,
    use: [{ loader: 'css-loader' }],
  },
  { test: /\.module\.css$/i, use: [{ loader: 'css-loader' }] },
];

const configWith = (rules: Rule[]) =>
  ({ module: { rules } }) as unknown as Parameters<
    typeof isolateRendererCss
  >[0];

const CSS = {
  file: /[\\/]pkg[\\/]style\.css$/i,
  probe: '/n/node_modules/pkg/style.css',
};

describe('isolateRendererCss()', () => {
  it('资源规则追加在项目规则之后（插在最前面会被那条 `...` 挡住，根本不命中）', () => {
    const config = configWith(officialRules());
    isolateRendererCss(config, CSS);

    const rules = config.module!.rules as Rule[];
    expect(rules.at(-1)).toMatchObject({ type: 'asset/resource' });
    expect(rules.at(-1)).toMatchObject({ test: CSS.file });
    // 前四条原样还在，位置没动
    expect(rules[0]).toMatchObject({ oneOf: [] });
  });

  it('把这份文件从带 loader 的规则里摘出去，其余规则不动', () => {
    const config = configWith(officialRules());
    isolateRendererCss(config, CSS);

    const [css, cssModule] = (config.module!.rules as Rule[]).slice(2, 4);
    expect(css!.exclude).toEqual([/\.module\.css$/i, CSS.file]);
    expect(cssModule!.exclude).toBeUndefined();
  });

  it('带 `g` 标志的规则照样认得出来（`test` 会推进 lastIndex，不能直接复用）', () => {
    const g = /\.css$/gi;
    // 先跑一次把 lastIndex 推到末尾：直接拿这条正则去试，下一次会是 false
    expect(g.test('/n/node_modules/pkg/style.css')).toBe(true);
    expect(g.test('/n/node_modules/pkg/style.css')).toBe(false);

    const rules: Rule[] = [{ test: g, use: [{ loader: 'css-loader' }] }];
    const config = configWith(rules);

    isolateRendererCss(config, CSS);
    expect(rules[0]!.exclude).toBe(CSS.file);
  });

  it('没有 `module.rules` 的配置原样放过（不抛）', () => {
    const config = {} as Parameters<typeof isolateRendererCss>[0];
    expect(() => {
      isolateRendererCss(config, CSS);
    }).not.toThrow();
  });
});
