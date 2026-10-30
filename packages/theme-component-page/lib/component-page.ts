/**
「这一页整页交给一个组件」的**命中判据与落空告警**：配置期（`../src/` 校验清单、铺出生成模块）
与浏览器期（`../theme/DocItem/index.tsx` 判键、组装入参）引的是这同一份，那几种判法因此
不会在编译边界两侧各写一遍。

条目的形状不在这里，在 `../types/component-page.d.ts`（两侧共用那一份；为什么单独占一格，
记在那份的头上）。这一份只放函数与转出的类型：不引 React、不引 DOM，和
`theme-iframe/src/api-frame-registry.ts` 同一个约束（配置期那份类型检查没有 DOM）。

**值有两处来源**：作者写在 frontmatter 里的那一格，以及 MDX 模块上的同名命名导出
（`dbml_json` 这种编译期由 loader 产出的值由 `ComponentCreator` 挂到 default 组件上）。
两处同名时 frontmatter 赢 —— 那是手写的那一格，导出是编译产物。**判法只有一种**：写在哪一份
不影响 `match` 的语义，所以清单不必为「信号从哪来」多写一格。

清单的**顺序 = 优先级**：一页同时写中两条键时，排在前面那条赢（和那族 iframe 框同一口径）。
这一族没有「装没装」那一格 —— 清单由站点与交出条目的包给，本包装了整列才参与判定；
「哪一层装了才交页」是交出方的事（各包在自己的 `loadContent()` 里交，没装的包不会跑它），
机制层只看键写没写、写得对不对形状。
*/

import type {
  ComponentPageEntry,
  ComponentPageFacts,
  ComponentPageMatch,
  ComponentPageProps,
  ComponentPageValue,
} from '../types/component-page.ts';

export type {
  ComponentPageContent,
  ComponentPageDeclaration,
  ComponentPageEntry,
  ComponentPageFacts,
  ComponentPageMatch,
  ComponentPageProps,
  ComponentPageValue,
} from '../types/component-page.ts';

/**
这一页上那把键写下的东西：先 frontmatter 的自有键，再 MDX 模块的自有键，都没有算没写。

两处都走 `Object.hasOwn`：原型上摸得到的名字（`toString` / `constructor`）不算「写了这一格」，
否则一把顺便撞上的键名会在每一页都命中。模块那一侧不是对象 / 函数时（非文档页）直接算没写。
*/
function writtenValue(
  key: string,
  { frontMatter, content }: ComponentPageFacts,
): unknown {
  if (frontMatter !== undefined && Object.hasOwn(frontMatter, key)) {
    return frontMatter[key];
  }

  if (
    content === null ||
    content === undefined ||
    (typeof content !== 'object' && typeof content !== 'function')
  ) {
    return undefined;
  }

  return Object.hasOwn(content, key)
    ? (content as Record<string, unknown>)[key]
    : undefined;
}

/**
这一条在某一页上命不命中：命中交回那把键写下的值，落空交回 `undefined`。

「写了这把键」与「这条命中」是两件事，后者还看形状（`boolean` 那臂只认真布尔 `true`；
`value` 那臂要非空串；`options` 那臂要 `true` 或一个选项对象；`any` 那臂三者都认）——
写歪了不静默，理由见下面 `componentPageWarnings`。
*/
export function matchComponentPage(
  entry: ComponentPageEntry,
  facts: ComponentPageFacts,
): ComponentPageValue | undefined {
  const written = writtenValue(entry.key, facts);

  if (entry.match === 'value') {
    return typeof written === 'string' && written !== '' ? written : undefined;
  }

  // `options` 与 `any` 都认选项对象；`any` 只是多认一串非空文本（见下面的分支）。
  if (
    (entry.match === 'options' || entry.match === 'any') &&
    typeof written === 'object' &&
    written !== null &&
    !Array.isArray(written)
  ) {
    return written as Record<string, unknown>;
  }

  if (entry.match === 'any' && typeof written === 'string' && written !== '') {
    return written;
  }

  return written === true ? true : undefined;
}

/**
组装交进那个组件的入参：配置里 `props` 那一格垫底，本页那三份（`frontMatter` / `value` /
`content`）盖在上面。

次序只在这里定一次，`../theme/DocItem` 里不写第二份 spread —— 于是「配置里同名那一格被本页
事实盖掉」这条由这里的用例钉着，而不是靠 JSX 里两行的先后。理由：那三份是**这一页的事实**，
配置写的是**每一页共用的入参**，前者赢才说得通（`props: { frontMatter: 42 }` 那种配置盖掉本页
frontmatter，组件收到的就是一个假的本页数据）。

`frontMatter` 没写时交一个空对象：组件那一侧不必每处判 `undefined`。
*/
export function componentPageProps(
  entry: ComponentPageEntry,
  value: ComponentPageValue,
  frontMatter: Record<string, unknown> | undefined,
  content: unknown,
): ComponentPageProps {
  return {
    ...entry.props,
    frontMatter: frontMatter ?? {},
    value,
    content,
  };
}

/** 一条判法的说法，用在告警里：它要的是哪一种形状。 */
function expectedShape(match: ComponentPageMatch): string {
  if (match === 'value') {
    return '一串非空文本';
  }

  if (match === 'any') {
    return '真布尔 `true`、一串非空文本或一个选项对象';
  }

  return match === 'options' ? '真布尔 `true` 或一个选项对象' : '真布尔 `true`';
}

/**
这一页上那些「键写了却没命中」与「不止一条命中」的说明。

为什么不能静默：命中不了就交回普通文档页，页面看着一切正常，坏的是站点作者的那次配置。
两种落空各给一条：

- 键写了但形状不合判法（`boolean` 那条写了串文本、`value` 那条写了 `true`、`options` 那条
  写了数组或 `null`、`any` 那条写了数字或数组）；两处来源一视同仁 —— 值从模块导出那份来的
  也一样点名。
- 清单里几条同时命中（通常是同一页上写了不止一把键），只用排在最前那条。

页面地址带在每条里：同一毛病的两页各打一条，不带地址就会把后面那页吞掉。
*/
export function componentPageWarnings(
  entries: readonly ComponentPageEntry[],
  facts: ComponentPageFacts,
  pagePath?: string,
): readonly string[] {
  const warnings: string[] = [];
  const page = pagePath ?? '这一页';
  const hits: ComponentPageEntry[] = [];

  for (const entry of entries) {
    if (writtenValue(entry.key, facts) === undefined) {
      continue;
    }

    if (matchComponentPage(entry, facts) === undefined) {
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
