/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那一页（约定见它的 README）。

`diff` 那把键的判法是 `any`：本层自己的读法（`src/loader/diff-decision.mts`）把 `true`、
一串路径与 `{old, new}` 都认成「开了」，`false` / `null` / 空值都算没开 —— `any` 是同一口径的
那一种判法（`true`、非空文本、选项对象都命中）。命中后整页交给本包主题层那份
`theme/DiffPage`。

组件写的是 `@theme/DiffPage` 而不是硬路径：站点在 `src/theme/DiffPage` 放一份就覆写掉它，
与站点自己那一列同一条口径。

**配置期代码**：跑在 Node 里，不引 React、不引 DOM；条目形状引 component-page 那份共享声明，
不在这里抄第二份。
*/

import type { ComponentPageDeclaration } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

/** 本层接管的唯一一把键。 */
export const DIFF_COMPONENT_PAGES: readonly ComponentPageDeclaration[] = [
  {
    key: 'diff',
    match: 'any',
    component: '@theme/DiffPage',
  },
];
