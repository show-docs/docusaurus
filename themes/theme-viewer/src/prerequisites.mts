import { assertPrevLayerResolverInstalled } from '@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots';

import type { LoadContext } from '@docusaurus/types';

/**
本包的两条安装前提，都住在这一个包里：解析器插件那条由它自己的 `./plugin-slots` 出口说
（这里只是把站点那两份清单递过去），lightningcss 那条只有这一家用得到。

「宿主必须用 lightningcss 压缩 CSS」这一条以前挂在机制层 `theme-component-page` 的
`./prerequisites` 里，作为各层共用的一个开关 —— 但它从头到尾只有本包按过：判据说的是
`viewerjs` 那一份样式表的形状（写的是 CSS 原生嵌套，默认的 cssnano + clean-css 会把它压坏），
换个渲染器就是另一句话。按仓库那条「只收已经有两个消费者的机制」，它该留在用它的这一层，
于是本包不再为了这一句去依赖机制层。

口径与实测记在 `docs/internals.md` 的「第三方那份样式表」一节。
*/
export const NAMESPACE = '@show-docs/docusaurus-theme-viewer';

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
在 `loadContent()` 阶段检查本包的安装前提。

读的是**站点配置**里那两份原始清单（`siteConfig.plugins` / `siteConfig.themes`），不是
`context.plugins` —— `LoadContext` 没有那个字段。缺了解析器那条，要等整个构建才炸在
`Module parse failed`（本包的 `theme/` 是随包发布的未编译 TS 源码）；没开那个压缩器，症状是
查看器整层透明 —— 两处都在配置期点名比事后猜省一整轮构建。
*/
export function assertViewerPrerequisites(context: LoadContext): void {
  assertPrevLayerResolverInstalled(NAMESPACE, {
    plugins: context.siteConfig.plugins,
    themes: context.siteConfig.themes,
  });

  if (!lightningCssMinimizerOn(context.siteConfig.future)) {
    throw new Error(
      `${NAMESPACE} 要求站点用 lightningcss 压缩 CSS：viewerjs 的样式表写的是原生嵌套，` +
        `默认的 cssnano + clean-css 会把它压坏（子规则并进父选择器、括号失衡）。` +
        `请在 docusaurus.config.mjs 里打开 \`future.faster.lightningCssMinimizer: true\` ` +
        `（或 \`future.faster: true\`；改名前的老写法 \`future.experimental_faster\` 也认，` +
        `但新版 Docusaurus 的配置校验把它判成「已改名」并直接报错，请优先写 \`future.faster\`）。`,
    );
  }
}
