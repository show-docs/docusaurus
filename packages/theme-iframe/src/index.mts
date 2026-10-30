import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-component-page/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本包的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-iframe';

/**
本层只剩一件事：`iframe: <地址>` 那一把键 —— 命中后把这一页的正文换成一个指向**外部站点**的框。

它交出的仍然是 component-page 那份契约里的「一个组件 + 一条规则」，跨源的地址算法在本包
（`lib/external-url.ts`），组件是本包主题层那份 `theme/ExternalFrame`。本层不提供 `DocItem`、
不注册框内路由、也不替别的包代交任何东西。

「同源那份框」不归本层：三条 API 层（`scalar` / `redoc` / `stoplight`）各自向
`@show-docs/docusaurus-theme-component-page` 交自己的组件与规则，那份框、握手与框内页面都在
机制层里，卸载本包它们照常可用。本层因此不认识 `scalar` / `redoc` / `stoplight` / `oas3` /
`aas3` 那些键，也不替谁猜渲染器。

主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus 项目会用自己的
babel 编译它们。本包要编译的只有这一份入口。「谁来编」归
`@show-docs/docusaurus-plugin-prev-layer-resolver`（它按 `@show-docs` 这个 scope 认领
`node_modules` 里的 TS 源码），本包不自己补 babel 规则。
*/
export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 两条前提都在这里点名：正常路径上缺了它们，症状都在打包那一步（那几页没人判 /
      // 外壳那份 TS 源码没人认领），报错点离真正的原因隔着一整个构建。判据住在
      // `@show-docs/docusaurus-theme-component-page/prerequisites`，与各视图层引的是同一份。
      assertThemePrerequisites(context, {
        namespace: NAMESPACE,
        componentPage: true,
      });

      return {
        componentPage: {
          components: [
            { id: 'external-frame', component: '@theme/ExternalFrame' },
          ],
          rules: [
            {
              key: 'iframe',
              // 只读 frontmatter：正文里恰好有一条同名导出就把整页换成框，不是作者的本意。
              source: 'frontMatter',
              match: 'value',
              component: 'external-frame',
            },
          ],
        },
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
  };
}
