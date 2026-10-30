/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那一页（约定见它的 README）。

`dbml_json` 是 `dbml-loader` 写进编译结果的那条命名导出（`.dbml` 解析出来的模型），也是本层
唯一能用来判断「这一页是不是关系图页」的信号：它不是作者写的 frontmatter，所以这里靠的是
component-page 那条读法 —— 先看 frontmatter 的同名键，没有再看 MDX 模块上的同名导出。

判法是 `any`：那个导出恒是一个对象，`any` 本来就认对象（`boolean` / `value` 都判不了对象）。
命中后整页交给本包主题层那份 `theme/ErdPage`。

组件写的是 `@theme/ErdPage` 而不是硬路径：站点在 `src/theme/ErdPage` 放一份就覆写掉它，
与站点自己那一列同一条口径。

**配置期代码**：跑在 Node 里，不引 React、不引 DOM；条目形状引 component-page 那份共享声明，
不在这里抄第二份。
*/

import type { ComponentPageDeclaration } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

/** 本层接管的唯一一把键：loader 写出来那条导出的名字。 */
export const ERD_COMPONENT_PAGES: readonly ComponentPageDeclaration[] = [
  {
    key: 'dbml_json',
    match: 'any',
    component: '@theme/ErdPage',
  },
];
