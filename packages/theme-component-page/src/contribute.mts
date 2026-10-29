/**
别的主题包把条目交给本层的那一格。

## 为什么要有这一格

站点自己在配置里写一列已经能用；「装了那个包就自动生效」还差一步 —— 本层得知道
**装着的哪些插件各自交出了哪几条**。这一步不新造一套插件加载，走官方已有的那条路：
贡献方在自己的 `loadContent()` 里交回 `{ componentPages }`，官方把所有插件的 content 收进
`allContent`，本层在 `allContentLoaded` 里读 —— 那是唯一「所有 content 都已到齐」的点。

**约定只有一条**：content 是对象、身上有 `componentPages` 这一格，就算那个插件交出了条目；
没有这一格本层一眼都不看。形状仍走 `./config.mts` 那一条校验，与站点写的那些一字不差，
报错里的列名带上「谁交的」（`pages（@x 交出的）[0]`）。

**来源 = 所有被装载的插件**：`allContent` 的形状是「插件名 → id → content」，preset 展开出来的、
相对路径入口的、配置里直接写函数的都在里面；同一个包装了两次（不同 `id`）就是两份 content。
问的是「这个插件实例被装载了吗」，所以没有「名字拼不出来所以发现不到」那一类缺口。

## 这一格的边界

只有被装载的插件能交：装在依赖里、没注册进 `plugins` / `themes` 的包不会出现（旧方案里
`contributors` 能点名「装了但没注册」的包，这一版没有对应物）。面也不再限于主题 —— 任何插件的
content 都看，兜底只剩撞键红与站点 `component: false`。记在 `docs/internals.md`，别只留在这里。
*/

import type { AllContent } from '@docusaurus/types';

import type { ComponentPageContent } from '../types/component-page.ts';

import {
  normalizePages,
  type EnabledPage,
  type NormalizedPage,
} from './config.mts';

/**
报错与提示里怎么称呼站点自己那一列。它同时是归属表里「这条键站点此过」的那个记号，
`mergePages` 就拿它判「覆写」还是「两个包抢同一把键」。
*/
const SITE_COLUMN = '站点配置';

/** 某个插件交出的那一列，已经按同一条校验走过。 */
export type ContributedPages = {
  /** 谁交出的：插件名（同一个包装了两次时带上 `id`），进报错文案与提示。 */
  from: string;
  /** 包那一列认不得 `component: false`（见 `./config.mts`），所以这里全是真说明符。 */
  pages: EnabledPage[];
};

/** content 上那一格；不是对象、或没有这一格时交回 `undefined`（= 这个插件不交）。 */
function contentPagesOf(content: unknown): unknown {
  if (typeof content !== 'object' || content === null) {
    return undefined;
  }

  const { componentPages } = content as Partial<ComponentPageContent>;

  return componentPages;
}

/**
把 `allContent` 里交出的那些条目逐条校验好。

报错与提示里的「谁交的」取插件名；同一个名字装了两次（不同 `id`）时把 `id` 也带上，
两列撞键那条红才分得出是哪两份 content。`default` 是官方缺省 `id`，不带它。
*/
export function collectContributedPages(
  allContent: AllContent,
): ContributedPages[] {
  const contributed: ContributedPages[] = [];

  for (const [name, byId] of Object.entries(allContent)) {
    for (const [id, content] of Object.entries(byId)) {
      const declared = contentPagesOf(content);

      if (declared === undefined) {
        continue;
      }

      const from = id === 'default' ? name : `${name}（id: ${id}）`;

      contributed.push({
        from,
        pages: normalizePages(declared, {
          column: `pages（${from} 交出的）`,
        }),
      });
    }
  }

  return contributed;
}

/** 合起来的那份清单，与「发生过覆写／关掉」的那些提示。 */
export type MergedPages = {
  /** 要铺进生成模块的那一列：站点的排前面，包交出的接在后面，关掉记号不在里面。 */
  pages: EnabledPage[];
  /** 站点把哪几条盖在／关在了包交出的那条上面：本层不静默改别人的生效情况。 */
  notices: string[];
};

/**
站点那一列里那些「关掉一把键」的记号（`component: false`）对应的键名。

那一格不进生成模块，它说的是一件别的事：这把键谁交来都不生效 —— 包括另一个包抢同一把键那种
本来要红的局面。站点是唯一能替这件事作主的一方，所以抢键的红在这里让位给关掉。
*/
function disabledKeys(site: readonly NormalizedPage[]): Set<string> {
  const keys = new Set<string>();

  for (const page of site) {
    if (page.specifier === false) {
      keys.add(page.entry.key);
    }
  }

  return keys;
}

/**
站点那一列与各包交出的那些列怎么合成一列。

- **站点的那一列排前面**：清单顺序就是命中优先级，站点写的比包默认交出的更先判；
- **同一把键站点写过一次**：用站点的，并留一条提示 —— 覆写是站点作者的本意，不该没人知道；
- **同一把键站点写了 `component: false`**：那一条不生效，包交出的也不接（留一条提示）。
  这是站点唯一的「关掉」写法：不想要那个包接管某一页，又不必去改那个包的键名；
- **同一把键两个包各交出一条**：红。两族抢同一把 frontmatter 键没有合理的默认答案，
  让其中一个悄悄赢才是最坏的那种结果（另一族的键在它自己那侧照样会命中，页面却归了这个包）。
  站点把那一把关掉时不红 —— 两边都不生效，抢赢抢输已经没有后果。
*/
export function mergePages(
  site: readonly NormalizedPage[],
  contributed: readonly ContributedPages[],
): MergedPages {
  const pages = site.filter(
    (page): page is EnabledPage => page.specifier !== false,
  );
  const notices: string[] = [];
  const disabled = disabledKeys(site);
  /** 每把键现在归谁：站点的先占，包的一条不许抢走站点那条。 */
  const owners = new Map<string, string>(
    pages.map((page) => [page.entry.key, SITE_COLUMN]),
  );

  for (const { from, pages: list } of contributed) {
    for (const page of list) {
      const { key } = page.entry;

      if (disabled.has(key)) {
        notices.push(
          `theme-component-page：键「${key}」在站点配置里被关掉了（\`component: false\`），${from} 交出的那一条不生效。`,
        );

        continue;
      }

      const owner = owners.get(key);

      if (owner !== undefined) {
        if (owner !== SITE_COLUMN) {
          throw new Error(
            `theme-component-page 的键「${key}」被 ${owner} 和 ${from} 各交出一条；同一把键只能有一个包接管，要两份都留着，给其中一条换一把键，或在站点配置里把这一把关掉（\`{ key: '${key}', component: false }\`）`,
          );
        }

        notices.push(
          `theme-component-page：键「${key}」本来由 ${from} 交出，站点配置里也写了这一把，用站点那一条。`,
        );

        continue;
      }

      owners.set(key, from);
      pages.push(page);
    }
  }

  return { pages, notices };
}
