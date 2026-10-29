import { describe, expect, it } from 'vitest';

import { contributeApiFramePages } from '../packages/theme-iframe/src/api-frame-contribute.mts';

/**
## 本层交给 component-page 的那一列

判定搬回配置期之后，这一格是「哪一层接管哪一页」的唯一来源：装了的层各交一条，登记顺序就是
命中顺序（越靠外越先判）。站点给的覆盖清单（`{ themeConfig: { apiFrame: { order } } }`）
换顺序、取子集；写歪的两类（拼错的名字、列了没装的层）进 `warnings`，由入口在
`loadContent()` 打一次。

「哪一层装了没有」这一步读的是站点原始 `plugins` / `themes` 两份清单 —— 这里既有裸包名，
也有路径形式与 `themes:` 那一份。
*/

const SCALAR = '@show-docs/docusaurus-theme-scalar';
const REDOC = '@show-docs/docusaurus-theme-redoc';
const STOPLIGHT = '@show-docs/docusaurus-theme-stoplight';
const IFRAME = '@show-docs/docusaurus-theme-iframe';

const declaredWith = (
  plugins: readonly unknown[],
  themes: readonly unknown[] = [],
) => ({ plugins, themes });

const keysOf = (pages: { key: string }[]): string[] =>
  pages.map((page) => page.key);

describe('contributeApiFramePages：装了的层按注册表顺序各交一页', () => {
  it('四条都装：顺序照注册表（写进 `plugins` 的顺序不算数）', () => {
    const { pages, warnings } = contributeApiFramePages(
      declaredWith([IFRAME, STOPLIGHT, REDOC, SCALAR]),
    );

    expect(keysOf(pages)).toEqual(['scalar', 'redoc', 'stoplight', 'iframe']);
    expect(warnings).toEqual([]);
  });

  it('每条交出的形状：三条 internal 判布尔、iframe 那条判地址值，组件同一份', () => {
    const { pages } = contributeApiFramePages(
      declaredWith([SCALAR, REDOC, STOPLIGHT, IFRAME]),
    );

    expect(pages).toEqual([
      {
        key: 'scalar',
        match: 'boolean',
        component: '@theme/ApiFramePage',
        props: { namespace: SCALAR },
      },
      {
        key: 'redoc',
        match: 'boolean',
        component: '@theme/ApiFramePage',
        props: { namespace: REDOC },
      },
      {
        key: 'stoplight',
        match: 'boolean',
        component: '@theme/ApiFramePage',
        props: { namespace: STOPLIGHT },
      },
      {
        key: 'iframe',
        match: 'value',
        component: '@theme/ApiFramePage',
        props: { namespace: IFRAME },
      },
    ]);
  });

  it('没装的层安静跳过（默认状态不是配置错误，不留提示）', () => {
    const { pages, warnings } = contributeApiFramePages(declaredWith([REDOC]));

    expect(keysOf(pages)).toEqual(['redoc']);
    expect(warnings).toEqual([]);
  });

  it('`themes:` 里声明的层也算装（两份清单合起来判）', () => {
    const { pages } = contributeApiFramePages(declaredWith([REDOC], [SCALAR]));

    expect(keysOf(pages)).toEqual(['scalar', 'redoc']);
  });

  it('路径形式与 `[路径, 选项]` 形式都认（按包目录判，不钉入口文件名）', () => {
    const { pages } = contributeApiFramePages(
      declaredWith([
        '/site/node_modules/@show-docs/docusaurus-theme-stoplight/src/index.mts',
        ['/repo/packages/theme-iframe/lib/index.mjs', {}],
      ]),
    );

    expect(keysOf(pages)).toEqual(['stoplight', 'iframe']);
  });
});

describe('contributeApiFramePages：站点的覆盖清单', () => {
  it('换顺序、取子集都由它定（注册表顺序不再生效）', () => {
    const { pages, warnings } = contributeApiFramePages(
      declaredWith([SCALAR, REDOC, STOPLIGHT, IFRAME]),
      [IFRAME, STOPLIGHT, SCALAR],
    );

    expect(keysOf(pages)).toEqual(['iframe', 'stoplight', 'scalar']);
    expect(warnings).toEqual([]);
  });

  it('列了没装的层：跳过并点名（装机过滤对覆盖同样生效）', () => {
    const { pages, warnings } = contributeApiFramePages(declaredWith([REDOC]), [
      REDOC,
      STOPLIGHT,
    ]);

    expect(keysOf(pages)).toEqual(['redoc']);
    expect(warnings).toEqual([
      '覆盖清单里的 `@show-docs/docusaurus-theme-stoplight` 没装（`plugins` 里没有这个名字），装机过滤对覆盖同样生效，这一层不参与判定。',
    ]);
  });

  it('拼错的名字：丢掉这一项并点名（不是静默少一层）', () => {
    const { pages, warnings } = contributeApiFramePages(declaredWith([REDOC]), [
      REDOC,
      '@show-docs/docusaurus-theme-reedoc',
    ]);

    expect(keysOf(pages)).toEqual(['redoc']);
    expect(warnings).toEqual([
      '覆盖清单里的 `@show-docs/docusaurus-theme-reedoc` 不在注册表内（拼错？），这一项被丢掉。',
    ]);
  });

  it('重复的层只交一次 —— 同一把键交两条会撞成「两个包抢一把键」', () => {
    const { pages, warnings } = contributeApiFramePages(
      declaredWith([SCALAR, REDOC]),
      [REDOC, REDOC, SCALAR],
    );

    expect(keysOf(pages)).toEqual(['redoc', 'scalar']);
    expect(warnings).toEqual([]);
  });

  it('空清单：一页都不交，也不留提示（站点自己关掉全部框）', () => {
    expect(contributeApiFramePages(declaredWith([SCALAR, REDOC]), [])).toEqual({
      pages: [],
      warnings: [],
    });
  });
});
