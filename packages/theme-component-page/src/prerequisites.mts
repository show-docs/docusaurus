import {
  assertPrevLayerResolverInstalled,
  pluginIsRegistered,
} from '@show-docs/docusaurus-plugin-prev-layer-resolver/registered-plugins';

import type { LoadContext } from '@docusaurus/types';

/**
交规则给这一格的层那两条安装前提：链式覆盖的别名（由解析器插件提供，那条检查住在它自己的包里，
这里只是把上下文递过去），以及「要把命中的整页换掉就得把本层注册成插件」。

这些包都按 `peerDependencies` 发给站点 —— 它们必须是**站点自己装、自己注册**的那一份，
不能由主题包各自带一份副本。正常路径上缺了它们，一个是 webpack 停在 `Module not found`（那把
别名没人给），一个是页面看着正常但那一格不出现，两处报错点都离真正的原因隔着一整个构建；
所以各层在 `loadContent()` 里先查一遍，缺什么就当场点名。「谁来编随包发布的未编译 TS 源码」
不在这一格：那条 babel 规则归 `@show-docs/docusaurus-plugin-compile-source`，各包只在
`peerDependencies` 里点名它，配置期不查。

这一份原来住在 `theme-iframe` 里，于是「想用这句检查」得先依赖那一族框。现在它住在机制层：
谁交规则、谁引公共外壳，都引同一份判据。**不交规则的层不必引它** —— 只看站点配置、
或只覆写官方那几格的主题包（`themes/` 那一族）直接引解析器包那一句就够。

住在 `src/` 而不是 `lib/`：这一份只在配置期（Node）跑，由 `tsc` 编进 `dist/`，包出口用
`./prerequisites` 交给别的主题包；本包入口不引它（它自己的两条前提都在解析器包那个出口里，
在入口里直接查）。

**交回的是 `Promise`**：站点可以把必需的插件写在 preset 里，那一份只有官方合并之后才看得见
（判据与代价都在解析器包的 `./registered-plugins`）。各层的 `loadContent()` 因此要把它交回官方等 ——
`loadContent` 里别的活照旧同步地干完，别让这一跳插到「必须在读走之前装上」的那些动作前面。
*/

/** 判清单、把命中的整页换成规则里那个组件的那一层；交规则与组件的层都要求它注册成插件。 */
export const COMPONENT_PAGE_PLUGIN =
  '@show-docs/docusaurus-theme-component-page';

export type ThemePrerequisites = {
  /** 本包的包名，只用于报错时点名。 */
  namespace: string;
  /**
  是否必须**注册** `component-page`：本层交出的那几页由它那份 `DocItem` 判表后挂上来，
  缺了它，规则永远不会被用到 —— 页面看着正常，框 / 视图却不出现。

  「谁来编本包那几份未编译的 `lib/*.tsx`」不在这一格：它们由
  `@show-docs/docusaurus-plugin-compile-source` 按 `@show-docs` 这个 scope 统一认领
  （判据见它的 `src/source-js-rule.mts`）。
  */
  componentPage?: boolean;
};

/**
在 `loadContent()` 阶段检查安装契约。

读的是站点那两份原始清单（`siteConfig.plugins` / `siteConfig.themes`），原始清单认不出时再问
官方那一份（preset 展开之后的）—— 只看原始清单会把一个把插件写在 preset 里的站点判死。
缺 component-page 那一条由这里自己点名，缺解析器那一条由解析器包自己点名（消息住在它那里）。
*/
export async function assertThemePrerequisites(
  context: LoadContext,
  { namespace, componentPage = false }: ThemePrerequisites,
): Promise<void> {
  await assertPrevLayerResolverInstalled(context, namespace);

  if (
    componentPage &&
    !(await pluginIsRegistered(context, COMPONENT_PAGE_PLUGIN))
  ) {
    throw new Error(
      `${namespace} 需要同时注册 ${COMPONENT_PAGE_PLUGIN}：本层交出的那几页由它那份 \`DocItem\` 判表后挂上来。` +
        `请先 \`pnpm add ${COMPONENT_PAGE_PLUGIN}\`，再把它加进 \`plugins\`（一个实例即可；写进某个 preset 的 \`plugins\` / \`themes\` 里也算）。`,
    );
  }
}
