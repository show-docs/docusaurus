import {
  assertPrevLayerResolverInstalled,
  declaredNamespaces,
  slotIsNamespace,
} from '@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots';

import type { LoadContext } from '@docusaurus/types';

/**
本层那一族主题层的安装前提：链式覆盖的别名（由解析器插件提供，那条检查住在它自己的包里，
这里只是转过去）、以及部分层要的共享外壳、清单套壳与压缩器。

这些包都按 `peerDependencies` 发给站点 —— 它们必须是**站点自己装、自己注册**的那一份，
不能由主题包各自带一份副本。正常路径上缺了它们，webpack 会停在 `Module not found` /
`Module parse failed`，报错点离真正的原因隔着一整个构建；所以各层在 `loadContent()` 里
先查一遍，缺什么就当场点名。

住在 `src/` 而不是 `lib/`：这一份只在配置期（Node）跑，由 `tsc` 编进 `dist/`，包出口用
`./prerequisites` 交给别的主题包；本包入口也引这一份，不必绕回自己那份未编译的 `lib/`。
*/

/** 共享外壳所在的包；视图三层与 API 三层还要求它注册成插件。 */
export const IFRAME_PLUGIN = '@show-docs/docusaurus-theme-iframe';

/** 判清单后挂上各层交出的那几页的套壳；交条目的层都要求它注册成插件。 */
export const COMPONENT_PAGE_PLUGIN =
  '@show-docs/docusaurus-theme-component-page';

export type ThemePrerequisites = {
  /** 本包的包名，只用于报错时点名。 */
  namespace: string;
  /**
  是否必须**注册** `theme-iframe`：视图三层要它发布那份共享外壳，API 三层要它提供外层框与
  路由；查看器与复制按钮只在构建期引它的一条纯函数，装上了就够。

  「谁来编那份外壳」不在这一格：未编译的 `lib/*.tsx` 由
  `@show-docs/docusaurus-plugin-prev-layer-resolver` 按 `@show-docs` 这个 scope 统一认领
  （判据见它的 `src/source-js-rule.mts`）。
  */
  iframe?: boolean;
  /**
  是否必须**注册** `component-page`：本层交出的那几页由它那份 `DocItem` 判清单后挂上来，
  缺了它，条目永远不会被用到 —— 页面看着正常，框 / 视图却不出现。
  */
  componentPage?: boolean;
  /**
  是否必须用 lightningcss 压缩 CSS：`viewerjs` 那份样式表写的是原生嵌套，Docusaurus
  默认的 cssnano + clean-css 会把它压坏（子规则并进父选择器、括号总账为负）。
  */
  lightningCssMinimizer?: boolean;
};

type SiteFuture = LoadContext['siteConfig']['future'];

/** `future.faster` 被 Docusaurus 补全后的那一格。 */
type FasterSlot = SiteFuture['faster'];

/**
改名前（`future.experimental_faster`）写下的同一开关：现行类型里没有这一格，
站点写下的形状也不确定（`true` 简写或部分对象），所以判据与 `faster` 共用。
*/
type LegacyFasterSlot = { experimental_faster?: boolean | Partial<FasterSlot> };

/**
读站点是否用 lightningcss 压缩 CSS。

`faster` 在前：插件拿到 `LoadContext` 时它已被 Docusaurus 补全成完整对象，所以那一格读到的是
每个键的布尔值，而不是站点写下的 `true` / 部分对象。只有它整个缺席（改名前的站点只写
`experimental_faster`）才落到第二处读；布尔值那一臂是 `true` 简写没被补全时的形状，
两处共用同一条判据。
*/
function lightningCssMinimizerOn(future: SiteFuture | undefined): boolean {
  const slot: boolean | Partial<FasterSlot> | undefined =
    future?.faster ??
    (future as LegacyFasterSlot | undefined)?.experimental_faster;
  return typeof slot === 'boolean'
    ? slot
    : Boolean(slot?.lightningCssMinimizer);
}

/**
在 `loadContent()` 阶段检查安装契约。

读的是**站点配置**里那两份原始清单（`siteConfig.plugins` / `siteConfig.themes`），不是
`context.plugins` —— `LoadContext` 没有那个字段。原始清单也正好是站点作者写下的形状：
裸包名、`[包名, 选项]`、`require.resolve()` 出来的路径都认得（认法住在解析器包，
见它的 `plugin-slots`）。
*/
export function assertThemePrerequisites(
  context: LoadContext,
  {
    namespace,
    iframe = false,
    componentPage = false,
    lightningCssMinimizer = false,
  }: ThemePrerequisites,
): void {
  const declared = {
    plugins: context.siteConfig.plugins,
    themes: context.siteConfig.themes,
  };

  assertPrevLayerResolverInstalled(namespace, declared);

  const installed = (name: string): boolean =>
    declaredNamespaces(declared).some((slot) => slotIsNamespace(slot, name));

  if (iframe && !installed(IFRAME_PLUGIN)) {
    throw new Error(
      `${namespace} 需要同时注册 ${IFRAME_PLUGIN}：本层的共享外壳由它发布并编译。` +
        `请先 \`pnpm add ${IFRAME_PLUGIN}\`，再把它加进 \`plugins\`（顺序在本层之前后均可）。`,
    );
  }

  if (componentPage && !installed(COMPONENT_PAGE_PLUGIN)) {
    throw new Error(
      `${namespace} 需要同时注册 ${COMPONENT_PAGE_PLUGIN}：本层交出的那几页由它那份 \`DocItem\` 判清单后挂上来。` +
        `请先 \`pnpm add ${COMPONENT_PAGE_PLUGIN}\`，再把它加进 \`plugins\`（一个实例即可）。`,
    );
  }

  if (
    lightningCssMinimizer &&
    !lightningCssMinimizerOn(context.siteConfig.future)
  ) {
    throw new Error(
      `${namespace} 要求站点用 lightningcss 压缩 CSS：viewerjs 的样式表写的是原生嵌套，` +
        `默认的 cssnano + clean-css 会把它压坏（子规则并进父选择器、括号失衡）。` +
        `请在 docusaurus.config.mjs 里打开 \`future.faster.lightningCssMinimizer: true\` ` +
        `（或 \`future.faster: true\`；改名前的老写法 \`future.experimental_faster\` 也认，` +
        `但新版 Docusaurus 的配置校验把它判成「已改名」并直接报错，请优先写 \`future.faster\`）。`,
    );
  }
}
