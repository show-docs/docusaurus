import { describe, expect, it } from 'vitest';

import type { LoadContext } from '@docusaurus/types';

import viewerTheme from '../themes/theme-viewer/src/index.mts';
import { assertViewerPrerequisites } from '../themes/theme-viewer/src/prerequisites.mts';

/**
## 各层 `loadContent()` 里那一条安装前提

这里从**调用方**那一侧钉检查器：缺什么、报错里点谁的名、什么时候放行。判清单本身的形状
（四种写法、按包目录段认路径）在 `test/plugin-slots.test.mts`，「插件写在 preset 里也算装上」
那条的判据与夹具在 `test/registered-plugins.test.mts`。

这一族曾经还有一条「要交规则得装上机制层」，住在机制层的 `./prerequisites` 出口里、由各层入口
调用；机制层不依赖解析器包之后，那一条连同它的判据一起删了（后果与理由记在机制层入口的文件头），
现在只剩下面这一条 —— 它说的是 `viewerjs` 那一份样式表的形状，只有这一家用得到，因此住在
`theme-viewer` 自己的 `src/prerequisites.mts` 里。它只看站点自己写下的 `future`，是同步的；
入口有没有真的查这一句，由下面那组从入口那一侧钉：漏掉那一跳，这句检查就变成一条没人接的
断言，构建照绿。
*/

/** 只造两份原始插件清单与 `future.faster`：检查器不读别的（`LoadContext` 本身没有 `plugins` 字段）。 */
const contextWith = (
  plugins: unknown[],
  themes: unknown[] = [],
  faster: Record<string, boolean> = {},
): LoadContext =>
  ({
    siteConfig: { plugins, themes, future: { faster } },
  }) as unknown as LoadContext;

/**
只造 `future` 那一整格：老站点的 `experimental_faster`、以及两处都没写的形状，
都不在 `contextWith` 那个 `faster` 参数能表达的范围内。
*/
const contextWithFuture = (future: unknown): LoadContext =>
  ({
    siteConfig: { plugins: [], themes: [], future },
  }) as unknown as LoadContext;

/**
「宿主必须用 lightningcss」那一条住在 `theme-viewer` 自己的 `src/prerequisites.mts` 里：
它说的是 `viewerjs` 那一份样式表的形状，只有这一家用得到。
*/
describe('theme-viewer 的安装前提：没开那个压缩器就当场点名', () => {
  const VIEWER = '@show-docs/docusaurus-theme-viewer';

  it('没开时报出本包的名字与那一格配置', () => {
    expect(() => assertViewerPrerequisites(contextWith([]))).toThrow(
      new RegExp(String.raw`${VIEWER}[\s\S]*lightningCssMinimizer`),
    );
  });

  it('开了就放行', () => {
    expect(() =>
      assertViewerPrerequisites(
        contextWith([], [], { lightningCssMinimizer: true }),
      ),
    ).not.toThrow();
  });

  it('老写法 `future.experimental_faster` 也认：开了就放行，没开照样报', () => {
    // 改名前的 Docusaurus 只补全 `experimental_faster`，`faster` 那一格整个缺席；
    // 只读 `faster` 会把这类站点误判成「没开压缩器」。
    expect(() =>
      assertViewerPrerequisites(
        contextWithFuture({ experimental_faster: true }),
      ),
    ).not.toThrow();

    expect(() =>
      assertViewerPrerequisites(
        contextWithFuture({
          experimental_faster: { lightningCssMinimizer: true },
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertViewerPrerequisites(
        contextWithFuture({
          experimental_faster: { lightningCssMinimizer: false },
        }),
      ),
    ).toThrow(/lightningCssMinimizer/);
  });

  it('两处都没写时报错；`faster` 在场时它赢（老写法只是缺席时的兜底）', () => {
    expect(() => assertViewerPrerequisites(contextWithFuture({}))).toThrow(
      /lightningCssMinimizer/,
    );

    expect(() =>
      assertViewerPrerequisites(
        contextWithFuture({
          faster: true,
          experimental_faster: { lightningCssMinimizer: false },
        }),
      ),
    ).not.toThrow();
  });
});

describe('theme-viewer 入口：那一条安装前提接进 loadContent', () => {
  const load = (faster: Record<string, boolean>) => {
    const plugin = viewerTheme(contextWith([], [], faster));
    return () => (plugin.loadContent as () => void)();
  };

  it('站点没开 lightningcss 就报错，开了才放行', () => {
    // 光有用例钉住 helper 不够：入口漏传这一格，检查器形同虚设，构建照样绿。
    expect(load({})).toThrow(/lightningCssMinimizer/);
    expect(load({ lightningCssMinimizer: true })).not.toThrow();
  });
});
