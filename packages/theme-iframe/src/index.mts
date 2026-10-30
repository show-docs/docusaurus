import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { IFRAME_COMPONENT_PAGES } from './component-pages.mts';
import { assertThemePrerequisites } from './prerequisites.mts';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本包的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-iframe';

/**
本层的入口：`getThemePath()` 挂本包那一层（里面只有 `ApiFramePage` 与它依赖的框），框内那三条
页面由各 API 包自己的入口经 `contentLoaded` 注册，这里只做两件事 —— `loadContent()` 把本层
自己的 `iframe:` 那一页交给 component-page，以及在本层缺前提时当场点名。

「整页交给一个框」这一族不再由本层替三条 API 层交页：它们在自己的 `loadContent()` 里各交各的
（工厂 `lib/api-frame-theme.mts` 代交），顺序 = 站点 `plugins` 里的声明顺序。本层因此只认得
自己那把键，也不再扫站点那两份清单。component-page 仍是本层的前提：缺了它，`iframe:` 那几页
永远不会被交出去，页面看着正常但框不出现。

主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus 项目会用自己
的 babel 编译它们。本包要编译的只有这一份入口。「谁来编」归
`@show-docs/docusaurus-plugin-prev-layer-resolver`（它按 `@show-docs` 这个 scope 认领
`node_modules` 里的 TS 源码），本包不自己补 babel 规则。
*/
export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 两条前提都在这里点名：正常路径上缺了它们，症状都在打包那一步（外壳那份 TS 源码没人
      // 认领 / 那几页没人判），报错点离真正的原因隔着一整个构建。判据住在
      // `./prerequisites.mts`（包出口 `./prerequisites`），与各视图层引的是同一份。
      assertThemePrerequisites(context, {
        namespace: NAMESPACE,
        componentPage: true,
      });

      return {
        componentPages: IFRAME_COMPONENT_PAGES,
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
    // `scalar` / `redoc` / `stoplight` 那三页由各包自己的 `loadContent()` 交回（见
    // `lib/api-frame-theme.mts`），这里只管 `iframe:` 那一页。
  };
}
