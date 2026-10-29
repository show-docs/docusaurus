import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { apiFrameComponentPages } from './component-pages.mts';
import { assertThemePrerequisites } from './prerequisites.mts';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本包的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-iframe';

/**
本层的插件选项。顺序与启用范围写在 `themeConfig.apiFrame.order` 里：顺序即优先级、列出的即
启用范围（装机过滤照样生效）。口径见 `docs/iframe-protocol.md`。
*/
export type ApiFrameThemeOptions = {
  themeConfig?: { apiFrame?: { order?: readonly string[] } };
};

/**
本层的入口：`getThemePath()` 挂本包那一层（里面只有 `ApiFramePage` 与它依赖的框），
`contentLoaded` 按注册表注册三条 API 层的框内页面由各包自己完成，这里只做两件事 ——
`loadContent()` 把装了的那几层交给 component-page，以及在本层缺前提时当场点名。

「谁来判哪一页归哪一层」不在浏览器侧了：本包把装了的层按注册表顺序放进 `loadContent()`
交回的 `{ componentPages }`，由 `@show-docs/docusaurus-theme-component-page` 生成的清单判命中、
再把页交给本层的 `theme/ApiFramePage`（说法见 `src/api-frame-contribute.mts`）。于是本层的前提
多了一个：component-page 必须装着且注册了 —— 缺了它，那几页永远不会被交给本层，页面看着正常
但框不出现。

主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus 项目会用自己
的 babel 编译它们。本包要编译的只有这一份入口。「谁来编」归
`@show-docs/docusaurus-plugin-prev-layer-resolver`（它按 `@show-docs` 这个 scope 认领
`node_modules` 里的 TS 源码），本包不自己补 babel 规则。
*/
export default function theme(
  context: LoadContext,
  options: ApiFrameThemeOptions = {},
): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 两条前提都在这里点名：正常路径上缺了它们，症状都在打包那一步（`@theme-prev/DocItem`
      // 解析失败 / 那几页没人判），报错点离真正的原因隔着一整个构建。判据住在
      // `./prerequisites.mts`（包出口 `./prerequisites`），与各视图层引的是同一份。
      assertThemePrerequisites(context, {
        namespace: NAMESPACE,
        componentPage: true,
      });

      const contribution = apiFrameComponentPages(
        {
          plugins: context.siteConfig.plugins,
          themes: context.siteConfig.themes,
        },
        options.themeConfig?.apiFrame?.order,
      );

      // 配置级那两条（覆盖拼错、列了没装的层）说一次就够：每翻一页重算没有增量信息。
      for (const warning of contribution.warnings) {
        console.warn(`[theme-iframe] ${warning}`);
      }

      return {
        componentPages: contribution.componentPages,
      } satisfies ComponentPageContent;
    },
    // 主题层与 `components/` 是源码，站在包根上，不经 tsc：由用它们的站点编译。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 「装了的层各接管哪把键」那一列由上面的 `loadContent()` 交回，见 `./component-pages.mts`。
  };
}
