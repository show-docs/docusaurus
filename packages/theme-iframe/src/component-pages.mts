/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那一列：装了的层各接管自己那把
frontmatter 键，命中后统一挂本层的 `@theme/ApiFramePage`。

「装了哪些层」「覆盖顺序是什么」仍由站点那两份清单与本包的插件选项决定，判据与说明见
`./api-frame-contribute.mts`；这里只把那次计算包成 `loadContent()` 交回的那一格。

`warnings` 不进交回的 content（component-page 只看 `componentPages`）：配置里那两处写歪的
说明由入口在 `loadContent()` 自己打一次，出处仍是本包。
*/

import type { PluginSlots } from '@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots';
import type { ComponentPageDeclaration } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import { contributeApiFramePages } from './api-frame-contribute.mts';

/** 交回的那一列（顺序 = 命中优先级）+ 本包自己打的那些提示。 */
export type ApiFrameComponentPages = {
  componentPages: readonly ComponentPageDeclaration[];
  warnings: readonly string[];
};

/** 按站点的覆盖清单与装机情况算出本层要交的那一列。 */
export function apiFrameComponentPages(
  declared: PluginSlots,
  order?: readonly string[],
): ApiFrameComponentPages {
  const { pages, warnings } = contributeApiFramePages(declared, order);

  return { componentPages: pages, warnings };
}
