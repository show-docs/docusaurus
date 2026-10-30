import {
  assertPrevLayerResolverInstalled,
  declaredNamespaces,
  slotIsNamespace,
} from '@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots';

import type { LoadContext } from '@docusaurus/types';

/**
交规则给这一格的层那两条安装前提：链式覆盖的别名（由解析器插件提供，那条检查住在它自己的包里，
这里只是转过去），以及「要把命中的整页换掉就得把本层注册成插件」。

这些包都按 `peerDependencies` 发给站点 —— 它们必须是**站点自己装、自己注册**的那一份，
不能由主题包各自带一份副本。正常路径上缺了它们，webpack 会停在 `Module not found` /
`Module parse failed`，报错点离真正的原因隔着一整个构建；所以各层在 `loadContent()` 里
先查一遍，缺什么就当场点名。

这一份原来住在 `theme-iframe` 里，于是「想用这句检查」得先依赖那一族框。现在它住在机制层：
谁交规则、谁引公共外壳，都引同一份判据。**不交规则的层不必引它** —— 只看站点配置、
或只覆写官方那几格的主题包（`themes/` 那一族）直接引解析器包那一句就够。

住在 `src/` 而不是 `lib/`：这一份只在配置期（Node）跑，由 `tsc` 编进 `dist/`，包出口用
`./prerequisites` 交给别的主题包；本包入口不引它（它自己的前提只有解析器那一个，在入口里
直接查）。
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
  `@show-docs/docusaurus-plugin-prev-layer-resolver` 按 `@show-docs` 这个 scope 统一认领
  （判据见它的 `src/source-js-rule.mts`）。
  */
  componentPage?: boolean;
};

/**
在 `loadContent()` 阶段检查安装契约。

读的是**站点配置**里那两份原始清单（`siteConfig.plugins` / `siteConfig.themes`），不是
`context.plugins` —— `LoadContext` 没有那个字段。原始清单也正好是站点作者写下的形状：
裸包名、`[包名, 选项]`、`require.resolve()` 出来的路径都认得（认法住在解析器包，
见它的 `plugin-slots`）。
*/
export function assertThemePrerequisites(
  context: LoadContext,
  { namespace, componentPage = false }: ThemePrerequisites,
): void {
  const declared = {
    plugins: context.siteConfig.plugins,
    themes: context.siteConfig.themes,
  };

  assertPrevLayerResolverInstalled(namespace, declared);

  if (
    componentPage &&
    declaredNamespaces(declared).every(
      (slot) => !slotIsNamespace(slot, COMPONENT_PAGE_PLUGIN),
    )
  ) {
    throw new Error(
      `${namespace} 需要同时注册 ${COMPONENT_PAGE_PLUGIN}：本层交出的那几页由它那份 \`DocItem\` 判表后挂上来。` +
        `请先 \`pnpm add ${COMPONENT_PAGE_PLUGIN}\`，再把它加进 \`plugins\`（一个实例即可）。`,
    );
  }
}
