import { pluginIsRegistered } from '@show-docs/docusaurus-plugin-prev-layer-resolver/registered-plugins';

import type { LoadContext } from '@docusaurus/types';

/**
交规则给这一格的那一条安装前提：「要把命中的整页换掉就得把本层注册成插件」。缺了它，规则永远
不会被用到 —— 页面看着正常，框 / 视图却不出现。

这一格必须按 `peerDependencies` 发给站点：它得是**站点自己装、自己注册**的那一份，不能由主题包
各自带一份副本。报错点本来在「某个页面安静地少了一格」，隔着一整个构建，所以各层在
`loadContent()` 里先查一遍、缺了当场点名。

另两条不在这一格：「谁来编随包发布的未编译 TS 源码」归
`@show-docs/docusaurus-plugin-compile-source`，各包只在 `peerDependencies` 里点名它，配置期不查；
解析器插件那一条也不查 —— 这一族各层的层里写的都是官方别名 `@theme-init/X`，真写
`@theme-prev/*` 的是站点的 `src/theme` 与 `tools/theme-*` 那几层，要查那一格的层自己引解析器包
那一句（`assertPrevLayerResolverInstalled`）。哪些层用哪一把别名由 `test/specifier-usage.test.mts`
钉着。

住在 `src/` 而不是 `lib/`：这一份只在配置期（Node）跑，由 `tsc` 编进 `dist/`，包出口用
`./prerequisites` 交给别的主题包；本包入口不引它（它自己的那条前提在解析器包那个出口里，
在入口里直接查）。

**交回的是 `Promise`**：站点可以把必需的插件写在 preset 里，那一份只有官方合并之后才看得见
（判据与代价都在解析器包的 `./registered-plugins`）。各层的 `loadContent()` 因此要把它交回官方等 ——
`loadContent` 里别的活照旧同步地干完，别让这一跳插到「必须在读走之前装上」的那些动作前面。
*/

/** 判清单、把命中的整页换成规则里那个组件的那一层；交规则与组件的层都要求它注册成插件。 */
export const COMPONENT_PAGE_PLUGIN =
  '@show-docs/docusaurus-theme-component-page';

/**
在 `loadContent()` 阶段检查「本层交规则要用的那一格注册了没有」。

`namespace` 是本包的包名，只用于报错时点名。读的是站点那两份原始清单（`siteConfig.plugins` /
`siteConfig.themes`），原始清单认不出时再问官方那一份（preset 展开之后的）—— 只看原始清单会把
一个把插件写在 preset 里的站点判死。
*/
export async function assertThemePrerequisites(
  context: LoadContext,
  namespace: string,
): Promise<void> {
  if (!(await pluginIsRegistered(context, COMPONENT_PAGE_PLUGIN))) {
    throw new Error(
      `${namespace} 需要同时注册 ${COMPONENT_PAGE_PLUGIN}：本层交出的那几页由它那份 \`DocItem\` 判表后挂上来。` +
        `请先 \`pnpm add ${COMPONENT_PAGE_PLUGIN}\`，再把它加进 \`plugins\`（一个实例即可；写进某个 preset 的 \`plugins\` / \`themes\` 里也算）。`,
    );
  }
}
