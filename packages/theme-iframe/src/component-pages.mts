/**
「整页交给一个框」这一族的每一条层各交自己那一页：

- 三条 API 层（`scalar` / `redoc` / `stoplight`）的 `loadContent()` 由 `lib/api-frame-theme.mts`
  的工厂代交 —— 它们只调一次工厂，交出什么跟着注册表那条 `internal` 条目走；
- 本层（`iframe:` 那条 `external` 条目）在这里交自己那一页，由 `src/index.mts` 的
  `loadContent()` 交回。

交出去的形状只有一种：`key` = 注册表里那把 frontmatter 键、`match` 按 `kind` 分（`internal`
只认布尔 `true`、`external` 认非空地址）、组件统一是本层的 `@theme/ApiFramePage`、`props.namespace`
告诉它赢的是哪一条。

**判定先后不再在这里算**：component-page 把各包交来的条目按站点 `plugins` 的声明顺序接起来，
排在前面那条先判。所以「装了没有」不必再扫一遍站点清单 —— 没装的包不会跑 `loadContent()`，
自然也不会交页；没有单独的「覆盖顺序」选项，想换先后就调 `plugins` 里那几项的
位置。

**配置期代码**：跑在 Node 里（这份 `.mts` 被入口 `tsc` 编译，也被 `lib/api-frame-theme.mts`
经 jiti 直接吃源码），不引 React、不引 DOM。条目形状引 component-page 那份共享声明，不在这里
抄第二份。
*/

import type { ComponentPageDeclaration } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import { IFRAME_ENTRY, type ApiFrameEntry } from './api-frame-registry.ts';

/**
接管这些页的那个组件：本包主题层里那一份（`theme/ApiFramePage/index.tsx`）。写别名而不是硬路径，
站点在 `src/theme/ApiFramePage` 放一份就覆写掉它 —— 与站点自己那一列同一条口径。
*/
const PAGE_COMPONENT = '@theme/ApiFramePage';

/** 一条层交给 component-page 的那一页：键怎么判命中、命中后挂哪个组件、组件拿到哪个命名空间。 */
export function framePageOf(entry: ApiFrameEntry): ComponentPageDeclaration {
  return {
    key: entry.frontmatterKey,
    match: entry.kind === 'internal' ? 'boolean' : 'value',
    component: PAGE_COMPONENT,
    props: { namespace: entry.namespace },
  };
}

/** 本层自己交出的那一列：只有 `iframe:` 这一页。 */
export const IFRAME_COMPONENT_PAGES: readonly ComponentPageDeclaration[] = [
  framePageOf(IFRAME_ENTRY),
];
