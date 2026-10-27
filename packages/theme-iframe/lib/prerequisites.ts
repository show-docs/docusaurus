import type { LoadContext } from '@docusaurus/types';

import { declaredNamespaces, slotIsNamespace } from './api-frame-entries.ts';

/**
所有主题层共同的两条安装前提：`@theme-prev/*` 的别名、以及部分层要的共享外壳。

这两个包都按 `peerDependencies` 发给站点 —— 它们必须是**站点自己装、自己注册**的那一份，
不能由主题包各自带一份副本。正常路径上缺了它们，webpack 会停在 `Module not found` /
`Module parse failed`，报错点离真正的原因隔着一整个构建；所以各层在 `loadContent()` 里
先查一遍，缺什么就当场点名。
*/

/** 链式覆盖的别名由这条插件提供；没有它，所有主题的 `@theme-prev/*` 都解析不到。 */
export const RESOLVER_PLUGIN =
  '@show-docs/docusaurus-plugin-prev-layer-resolver';

/** 共享外壳所在的包；视图三层与 API 三层还要求它注册成插件。 */
export const IFRAME_PLUGIN = '@show-docs/docusaurus-theme-iframe';

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
  是否必须用 lightningcss 压缩 CSS：`viewerjs` 那份样式表写的是原生嵌套，Docusaurus
  默认的 cssnano + clean-css 会把它压坏（子规则并进父选择器、括号总账为负）。
  */
  lightningCssMinimizer?: boolean;
};

/**
在 `loadContent()` 阶段检查安装契约。

读的是**站点配置**里那两份原始清单（`siteConfig.plugins` / `siteConfig.themes`），不是
`context.plugins` —— `LoadContext` 没有那个字段。原始清单也正好是站点作者写下的形状：
裸包名、`[包名, 选项]`、`require.resolve()` 出来的路径都认得（认法同装机判定，
见 `api-frame-entries.ts` 的 `slotIsNamespace`）。
*/
export function assertThemePrerequisites(
  context: LoadContext,
  {
    namespace,
    iframe = false,
    lightningCssMinimizer = false,
  }: ThemePrerequisites,
): void {
  const declared = declaredNamespaces({
    plugins: context.siteConfig.plugins,
    themes: context.siteConfig.themes,
  });
  const installed = (name: string): boolean =>
    declared.some((slot) => slotIsNamespace(slot, name));

  if (!installed(RESOLVER_PLUGIN)) {
    throw new Error(
      `${namespace} 需要 ${RESOLVER_PLUGIN}：所有主题的 \`@theme-prev/*\` 都由它提供别名。` +
        `请先 \`pnpm add ${RESOLVER_PLUGIN}\`，再把它加进 \`plugins\`（一个实例即可）。`,
    );
  }

  if (iframe && !installed(IFRAME_PLUGIN)) {
    throw new Error(
      `${namespace} 需要同时注册 ${IFRAME_PLUGIN}：本层的共享外壳由它发布并编译。` +
        `请先 \`pnpm add ${IFRAME_PLUGIN}\`，再把它加进 \`plugins\`（顺序在本层之前后均可）。`,
    );
  }

  // `future.faster` 在插件拿到 `LoadContext` 时已经被 Docusaurus 补全成完整对象，
  // 所以这一格读到的是布尔值，不是站点写下的 `true` / 部分对象。
  if (
    lightningCssMinimizer &&
    !context.siteConfig.future?.faster?.lightningCssMinimizer
  ) {
    throw new Error(
      `${namespace} 要求站点用 lightningcss 压缩 CSS：viewerjs 的样式表写的是原生嵌套，` +
        `默认的 cssnano + clean-css 会把它压坏（子规则并进父选择器、括号失衡）。` +
        `请在 docusaurus.config.mjs 里打开 \`future.faster.lightningCssMinimizer: true\` ` +
        `（或 \`future.faster: true\`）。`,
    );
  }
}
