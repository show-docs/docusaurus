/**
别的主题包在配置期把条目交给本层的那一格。

## 为什么要有这一格

站点自己在配置里写一列已经能用；「装了那个包就自动生效」还差一步 —— 本层得知道
**装着的哪些包各自交出了哪几条**。这一格不新造一套插件加载：复用解析器插件那次推导
（`PluginDiscovery`，本层对它的依赖就是那条 peer），它已经按官方顺序把装着的主题插件
实例化过一遍，而实例上挂的自定义方法原样留着。

**约定只有一条**：插件实例上挂着 `getComponentPages()`，交回的那一列就是那个包要接管的页。
没有这个方法的实例本层一眼都不看；形状仍走 `./config.mts` 那一条校验，与站点写的那些一字不差。

**认得进来的只有主题插件**：那次推导按官方意义只保留「实例上有 `getThemePath()`」的（层栈就
建在这条判据上），所以普通内容型插件挂了 `getComponentPages()` 也不会被问。对本层的受众（主题
层包）这正好对上；想交出条目的那个包因此得是一个主题。

## 这一格的代价

本层在 `contentLoaded` 推一遍，解析器自己在 `configureWebpack` 里推一遍，同一份配置因此被读
两次、主题插件因此被多实例化一遍。共享那一次推导要在进程里缓存，而那会改掉解析器「重新初始化
站点 = 新实例 = 新层栈」那条承诺（dev 的 `reloadSite()` 靠它），所以没共享。记在
`docs/internals.md`，别只留在这里。
*/

import { PluginDiscovery } from '@show-docs/docusaurus-plugin-prev-layer-resolver';
import type { LoggerLike } from '@show-docs/docusaurus-plugin-prev-layer-resolver';

import { normalizePages, type NormalizedPage } from './config.mts';

/**
报错与提示里怎么称呼站点自己那一列。它同时是归属表里「这条键站点此过」的那个记号，
`mergePages` 就拿它判「覆写」还是「两个包抢同一把键」。
*/
const SITE_COLUMN = '站点配置';

/** 某个包交出的那一列，已经按同一条校验走过。 */
export type ContributedPages = {
  /** 哪个包交出的：包名（取实例上的 `name`），进报错文案与提示。 */
  from: string;
  pages: NormalizedPage[];
};

/** 挂着那条约定的那一种实例：本层只看这一个方法，其余格子一概不读。 */
type Contributor = {
  name?: unknown;
  getComponentPages: () => unknown;
};

/** 这个实例交出条目吗？只认「对象上挂着个函数」，不猜别的形状。 */
export function isComponentPageContributor(
  value: unknown,
): value is Contributor {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getComponentPages?: unknown }).getComponentPages ===
      'function'
  );
}

/**
把装了的那些实例里交出条目的逐条校验好。

认不出包名的实例（配置里直接写函数、没有入口的那种）用 `'<没有名字的插件>'` 顶：
报错至少指出「第几条哪一格」，不至于只说「有一列写歪了」。
*/
export function collectContributedPages(
  instances: readonly unknown[],
): ContributedPages[] {
  const contributed: ContributedPages[] = [];

  for (const instance of instances) {
    if (!isComponentPageContributor(instance)) {
      continue;
    }

    const from =
      typeof instance.name === 'string' && instance.name !== ''
        ? instance.name
        : `'<没有名字的插件>'`;
    const { getComponentPages } = instance;

    contributed.push({
      from,
      pages: normalizePages(
        getComponentPages.call(instance),
        `pages（${from} 交出的）`,
      ),
    });
  }

  return contributed;
}

/** 合起来的那份清单，与「发生过覆写」的那些提示。 */
export type MergedPages = {
  /** 要铺进生成模块的那一列：站点的排前面，包交出的接在后面。 */
  pages: NormalizedPage[];
  /** 站点把哪几条盖在了包交出的那条上面：本层不静默改别人的生效情况。 */
  notices: string[];
};

/**
站点那一列与各包交出的那些列怎么合成一列。

- **站点的那一列排前面**：清单顺序就是命中优先级，站点写的比包默认交出的更先判；
- **同一把键站点写过一次**：用站点的，并留一条提示 —— 覆写是站点作者的本意，不该没人知道；
- **同一把键两个包各交出一条**：红。两族抢同一把 frontmatter 键没有合理的默认答案，
  让其中一个悄悄赢才是最坏的那种结果（另一族的键在它自己那侧照样会命中，页面却归了这个包）。
*/
export function mergePages(
  site: readonly NormalizedPage[],
  contributed: readonly ContributedPages[],
): MergedPages {
  const pages = [...site];
  const notices: string[] = [];
  /** 每把键现在归谁：站点的先占，包的一条不许抢走站点那条。 */
  const owners = new Map<string, string>(
    site.map((page) => [page.entry.key, SITE_COLUMN]),
  );

  for (const { from, pages: list } of contributed) {
    for (const page of list) {
      const owner = owners.get(page.entry.key);

      if (owner !== undefined) {
        if (owner !== SITE_COLUMN) {
          throw new Error(
            `theme-component-page 的键「${page.entry.key}」被 ${owner} 和 ${from} 各交出一条；同一把键只能有一个包接管，要两份都留着，给其中一条换一把键`,
          );
        }

        notices.push(
          `theme-component-page：键「${page.entry.key}」本来由 ${from} 交出，站点配置里也写了这一把，用站点那一条。`,
        );

        continue;
      }

      owners.set(page.entry.key, from);
      pages.push(page);
    }
  }

  return { pages, notices };
}

/**
问一遍装着的插件：有哪些包交出了条目。

拿不到插件列表（`discover()` 交回 `null`）时交回空列：那时每一页仍照站点自己那一列判，本层
不至于整层失效。告警由 `discover()` 自己报 —— 它才知道是 core 的哪个入口取不到、还是推导
中途抛了，这里再报一条只会把同一件事说两遍。
*/
export async function discoverContributedPages(
  siteDir: string,
  logger: LoggerLike,
): Promise<ContributedPages[]> {
  const plugins = await new PluginDiscovery(siteDir, logger).discover();

  return plugins === null ? [] : collectContributedPages(plugins);
}
