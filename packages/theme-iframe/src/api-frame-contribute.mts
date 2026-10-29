/**
配置期：本层把「装了的那几层各接管哪把键」交给 `@show-docs/docusaurus-theme-component-page`，
由它那份生成的清单决定哪一层接管哪一页。

## 为什么搬到配置期

浏览器侧原来自己读 `siteConfig.plugins` 判「装了没有」、读插件选项判覆盖顺序，那份逻辑
吃的是 Docusaurus 的**实现细节**（生成配置保留原始 `plugins` 形状），而且和 component-page
那条通用通道说的是同一件事。现在本包走那条通道：每一条装了的层交出一页，`component` 指本层的
`@theme/ApiFramePage`，`props.namespace` 告诉它「赢的是哪一条」。站点想换顺序或只启用一部分，
仍写在本包插件选项里（`{ themeConfig: { apiFrame: { order: [...] } } }`），在这里生效：

- 参与判定的层 = **装了的层**（`plugins` / `themes` 里有其包名、或其包目录内入口路径的那一项）；
  component-page 按交出顺序判，所以列了没装的层照样不交 —— 「指向不存在路由的框」这个失败模式
  不会从覆盖清单里溜回来；
- 默认顺序 = 注册表的清单顺序（越靠外越先判，与原层栈一致）。

落空的两类（覆盖清单里的名字拼错、列了没装的层）在这里进 `warnings`，由入口在
`loadContent()` 打到控制台 —— 配置错误每页重算没有增量信息，配置期说一次就够。

**配置期代码**：跑在 Node 里（jiti 直接吃这份 `.mts` 源码），不引 React、不引 DOM。条目形状引
component-page 那份共享声明，不在这里抄第二份。
*/

import {
  declaredNamespaces,
  slotIsNamespace,
  type PluginSlots,
} from '@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots';
import type { ComponentPageDeclaration } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import {
  apiFrameByNamespace,
  apiFrameEntriesOrdered,
  type ApiFrameEntry,
} from './api-frame-registry.ts';

/**
接管这些页的那个组件：本包主题层里那一份（`theme/ApiFramePage/index.tsx`）。写别名而不是硬路径，
站点在 `src/theme/ApiFramePage` 放一份就覆写掉它 —— 与站点自己那一列同一条口径。
*/
const PAGE_COMPONENT = '@theme/ApiFramePage';

/** 一条层交给 component-page 的那一页：键怎么判命中、命中后挂哪个组件、组件拿到哪个命名空间。 */
function declarationOf(entry: ApiFrameEntry): ComponentPageDeclaration {
  return {
    key: entry.frontmatterKey,
    match: entry.kind === 'internal' ? 'boolean' : 'value',
    component: PAGE_COMPONENT,
    props: { namespace: entry.namespace },
  };
}

/** 交出去的那一列（顺序 = 命中优先级）+ 配置里那两处写歪的说明。 */
export type FrameContribution = {
  pages: ComponentPageDeclaration[];
  /** 覆盖清单里拼错的名字、列了却没装的层；由入口在 `loadContent()` 打一次。 */
  warnings: string[];
};

/**
装了的层按注册表顺序交给 component-page；站点给了覆盖清单时按那份（顺序与子集都由它定）。

装机判据与原浏览器侧那份一字不差：`declaredNamespaces()` + `slotIsNamespace()`，读的是站点
原始 `plugins` / `themes` 两份清单（`themes:` 里声明的层也算装）。
*/
export function contributeApiFramePages(
  declared: PluginSlots,
  order?: readonly string[],
): FrameContribution {
  const names = declaredNamespaces(declared);
  const installed = (namespace: string): boolean =>
    names.some((name) => slotIsNamespace(name, namespace));

  const pages: ComponentPageDeclaration[] = [];
  const warnings: string[] = [];

  // 没给覆盖清单时，注册表里没装的层安静地跳过 —— 那是默认状态，不是站点写错了。
  const requested =
    order ?? apiFrameEntriesOrdered().map((entry) => entry.namespace);

  for (const namespace of requested) {
    const entry = apiFrameByNamespace(namespace);

    if (entry === undefined) {
      warnings.push(
        `覆盖清单里的 \`${namespace}\` 不在注册表内（拼错？），这一项被丢掉。`,
      );

      continue;
    }

    if (!installed(namespace)) {
      if (order !== undefined) {
        warnings.push(
          `覆盖清单里的 \`${namespace}\` 没装（\`plugins\` 里没有这个名字），装机过滤对覆盖同样生效，这一层不参与判定。`,
        );
      }

      continue;
    }

    // 覆盖清单里重复的层只交一次（同一把键交两条会撞成 component-page 的「两个包抢一把键」）。
    if (pages.some((page) => page.key === entry.frontmatterKey)) {
      continue;
    }

    pages.push(declarationOf(entry));
  }

  return { pages, warnings };
}
