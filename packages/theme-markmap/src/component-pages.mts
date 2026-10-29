/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那几页（约定见它的 README）。

`markmap` 那把键的判法是 `options`：写 `true` 或一个选项对象都算命中 —— 后者既是开关，
也是交给 `deriveOptions()` 的那份选项（`components/markmap.tsx` 从导图数据里读它）；
写 `false` / 空值不算。命中后整页交给本包主题层那份 `theme/MarkmapPage`。

组件写的是 `@theme/MarkmapPage` 而不是硬路径：站点在 `src/theme/MarkmapPage` 放一份就覆写掉它，
与站点自己那一列同一条口径。

**配置期代码**：跑在 Node 里，不引 React、不引 DOM；条目形状引 component-page 那份共享声明，
不在这里抄第二份。
*/

import type { ComponentPageDeclaration } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

/** 本层接管的唯一一把键。 */
export const MARKMAP_COMPONENT_PAGES: readonly ComponentPageDeclaration[] = [
  {
    key: 'markmap',
    match: 'options',
    component: '@theme/MarkmapPage',
  },
];
