/**
「这一页整页交给一个组件」的**命中判据与落空告警**：配置期（`../src/` 校验清单、铺出生成模块）
与浏览器期（`../theme/DocItem/index.tsx` 判键、组装入参）引的是这同一份，那两条判法因此
不会在编译边界两侧各写一遍。

条目的形状不在这里，在 `../types/component-page.d.ts`（两侧共用那一份；为什么单独占一格，
记在那份的头上）。这一份只放函数与转出的类型：不引 React、不引 DOM，和
`theme-iframe/lib/api-frame-registry.ts` 同一个约束（配置期那份类型检查没有 DOM）。

清单的**顺序 = 优先级**：一页同时写中两条键时，排在前面那条赢（和那族 iframe 框同一口径）。
这一族没有「装没装」那一格 —— 清单就挂在本包的插件选项上，本包装了整列才参与判定，所以
`theme-iframe` 那套装机过滤在这里不存在，判定只看键写没写、写得对不对形状。
*/

import type {
  ComponentPageEntry,
  ComponentPageMatch,
  ComponentPageValue,
} from '../types/component-page.ts';

export type {
  ComponentPageEntry,
  ComponentPageMatch,
  ComponentPageProps,
  ComponentPageValue,
} from '../types/component-page.ts';

/**
这一条在某一页上命不命中：命中交回那把键写下的值，落空交回 `undefined`。

「写了这把键」与「这条命中」是两件事，后者还看形状（`boolean` 那臂只认真布尔 `true`；
`value` 那臂要非空串）—— 写歪了不静默，理由见下面 `componentPageWarnings`。
*/
export function matchComponentPage(
  entry: ComponentPageEntry,
  frontMatter: Record<string, unknown> | undefined,
): ComponentPageValue | undefined {
  const written = frontMatter?.[entry.key];

  if (entry.match === 'value') {
    return typeof written === 'string' && written !== '' ? written : undefined;
  }

  return written === true ? true : undefined;
}

/** 一条判法的说法，用在告警里：它要的是哪一种形状。 */
function expectedShape(match: ComponentPageMatch): string {
  return match === 'value' ? '一串非空文本' : '真布尔 `true`';
}

/**
这一页上那些「键写了却没命中」与「不止一条命中」的说明。

为什么不能静默：命中不了就交回普通文档页，页面看着一切正常，坏的是站点作者的那次配置。
两种落空各给一条：

- 键写了但形状不对（`boolean` 那条写了串文本、`value` 那条写了 `true`）；
- 清单里几条同时命中（通常是同一页上写了不止一把键），只用排在最前那条。

页面地址带在每条里：同一毛病的两页各打一条，不带地址就会把后面那页吞掉。
*/
export function componentPageWarnings(
  entries: readonly ComponentPageEntry[],
  frontMatter: Record<string, unknown> | undefined,
  pagePath?: string,
): readonly string[] {
  const warnings: string[] = [];
  const page = pagePath ?? '这一页';
  const hits: ComponentPageEntry[] = [];

  for (const entry of entries) {
    if (frontMatter?.[entry.key] === undefined) {
      continue;
    }

    if (matchComponentPage(entry, frontMatter) === undefined) {
      warnings.push(
        `${page} 写了 \`${entry.key}:\`，但清单里这一条按 \`${entry.match}\` 判，要的是${expectedShape(entry.match)}，这一条不参与，交回普通文档页。`,
      );

      continue;
    }

    hits.push(entry);
  }

  if (hits.length > 1) {
    warnings.push(
      `${page} 同时命中清单里 ${hits.length} 条（${hits.map((entry) => `\`${entry.key}:\``).join(' / ')}），按清单顺序只用排在最前那一条，其余被忽略 —— 一页写两把键通常是手误。`,
    );
  }

  return warnings;
}

/** 每种文本只打一次：同一页反复渲染都会重算出同一条，逐页刷屏没有增量信息。 */
const shownWarnings = new Set<string>();

/** 把落空原因打到控制台：`DocItem` 只在开发模式调这一格，构建产物里不打。 */
export function warnComponentPages(warnings: readonly string[]): void {
  for (const warning of warnings) {
    if (shownWarnings.has(warning)) {
      continue;
    }

    shownWarnings.add(warning);
    console.warn(`[theme-component-page] ${warning}`);
  }
}
