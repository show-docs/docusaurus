/**
别的主题包把「组件 + 默认规则」交给本层的那一格，以及全站那一张最终表的算法。

## 为什么要有这一格

站点自己在配置里写一列已经能用；「装了那个包就自动生效」还差一步 —— 本层得知道
**装着的哪些插件各自交出了哪些组件与哪几条默认规则**。这一步不新造一套插件加载，走官方已有的
那条路：贡献方在自己的 `loadContent()` 里交回 `{ componentPage }`，官方把所有插件的 content
收进 `allContent`，本层在 `allContentLoaded` 里读 —— 那是唯一「所有 content 都已到齐」的点。

**约定只有一条**：content 是对象、身上有 `componentPage` 这一格，就算那个插件贡献了东西；
没有这一格本层一眼都不看。形状仍走 `./config.mts` 那一条校验，报错里的列名带上「谁交的」
（`componentPage（@x 交出的）.rules[0]`）。旧的 `componentPages` 那一格还认得，但只用来红一次，
把迁移的话说清楚（见 {@link legacyContributionError}）。

**来源 = 所有被装载的插件**：`allContent` 的形状是「插件名 → id → content」，preset 展开出来的、
相对路径入口的、配置里直接写函数的都在里面；同一个包装了两次（不同 `id`）就是两份 content。
问的是「这个插件实例被装载了吗」，所以没有「名字拼不出来所以发现不到」那一类缺口。

## 这一格的边界

只有被装载的插件能交：装在依赖里、没注册进 `plugins` / `themes` 的包不会出现。面也不再限于
主题 —— 任何插件的 content 都看，兜底只剩站点那条 `enabled: false`。

**先后不在这张表里读插件声明顺序**：`allContent` 的键序恰好等于站点 `plugins` 的声明顺序，
但那条顺序由官方的聚合实现给，不是它对外的承诺。最终表只看两件站点作者写得出来的东西：站点自己
那一列的顺序，和剩下那些默认规则**按键名的固定字符串顺序**。同一站点多装一个包、把两项调个位，
都不该改变两页之间的先后。
*/

import type { AllContent } from '@docusaurus/types';

import type { ComponentPageContent } from '../types/component-page.ts';

import {
  normalizeContribution,
  type NormalizedComponent,
  type NormalizedContribution,
  type NormalizedRule,
  type SiteRuleItem,
} from './config.mts';

/**
报错与提示里怎么称呼站点自己那一列。它同时是归属表里「这个登记名/这把键站点此过」的那个记号，
下面两张表就拿它判「覆写」还是「两个包抢同一格」。
*/
const SITE_COLUMN = '站点配置';

/** 某个插件交出的那两格，已经按同一条校验走过。 */
export type ContributedColumn = NormalizedContribution & {
  /** 谁交出的：插件名（同一个包装了两次时带上 `id`），进报错文案与提示。 */
  from: string;
};

/** 最终表里的一条：一条补明缺省的规则，加上它那个组件真正落在哪份模块上。 */
export type TableEntry = NormalizedRule & {
  /** 写进生成模块那条 `import` 的说明符，来自登记表里同名的那一条。 */
  specifier: string;
};

/** 合起来的那份表，与「发生过覆写／关掉」的那些提示。 */
export type RuleTable = {
  /** 要铺进生成模块的那一列：站点的排前面，剩下的默认规则按键名排在后面。 */
  entries: TableEntry[];
  /** 站点把哪几条盖在／关在了某个包交出的那条上面：本层不静默改别人的生效情况。 */
  notices: string[];
};

/** content 上那一格；不是对象、或没有这一格时交回 `undefined`（= 这个插件不贡献）。 */
function contributionOf(content: unknown): unknown {
  if (typeof content !== 'object' || content === null) {
    return undefined;
  }

  const { componentPage } = content as Partial<ComponentPageContent>;

  return componentPage;
}

/**
旧的那一格（`componentPages`：一列「键 → 组件」的条目）只用来红一次。

上一版把整页交给组件的那一族贡献写的就是这一格，形状与现在这两格完全不同。让它安静地不生效
是最坏的那种升级：站点照常构建，框、导图、关系图从每一页上消失，看不出跟这次升级有关系。
*/
function legacyContributionError(from: string): void {
  throw new Error(
    `theme-component-page：${from} 的 loadContent() 交回的是旧的那一格 \`componentPages\`（一列 \`{ key, component, match, props }\`）。` +
      '这一版改成两格：`componentPage: { components: [{ id, component }], rules: [{ key, component, match?, source?, render?, props? }] }`，' +
      '其中 `rules[].component` 引用的是 `components[].id`（不再是模块说明符）。请把 ' +
      `${from} 升到适配这一版的写法。`,
  );
}

/** 旧的那一列（`pages` 插件选项）同理：读得到就点名，读不到就当没写。 */
export const LEGACY_PAGES_OPTION = 'pages';

/**
把 `allContent` 里那些 `{ componentPage }` 逐条校验好。

报错与提示里的「谁交的」取插件名；同一个名字装了两次（不同 `id`）时把 `id` 也带上，
两列撞登记名那条红才分得出是哪两份 content。`default` 是官方缺省 `id`，不带它。
*/
export function collectContributions(
  allContent: AllContent,
): ContributedColumn[] {
  const contributed: ContributedColumn[] = [];

  for (const [name, byId] of Object.entries(allContent)) {
    for (const [id, content] of Object.entries(byId)) {
      if (
        typeof content === 'object' &&
        content !== null &&
        'componentPages' in content
      ) {
        legacyContributionError(
          id === 'default' ? name : `${name}（id: ${id}）`,
        );
      }

      const declared = contributionOf(content);

      if (declared === undefined) {
        continue;
      }

      const from = id === 'default' ? name : `${name}（id: ${id}）`;

      contributed.push({
        from,
        ...normalizeContribution(declared, `componentPage（${from} 交出的）`),
      });
    }
  }

  return contributed;
}

/** 全站那张登记表：登记名 → 说明符与出处。重名当场红，列出撞的两方。 */
function componentRegistry(
  site: readonly NormalizedComponent[],
  contributed: readonly ContributedColumn[],
): Map<string, { specifier: string; from: string }> {
  const registry = new Map<string, { specifier: string; from: string }>();

  const declare = (
    { id, specifier }: NormalizedComponent,
    from: string,
  ): void => {
    const owner = registry.get(id);

    if (owner !== undefined) {
      throw new Error(
        `theme-component-page 的组件登记名「${id}」被 ${owner.from} 和 ${from} 各交出一条；一个登记名只能指向一个组件。要两份都留着，给其中一条换一个 id（建议带上包名，如 \`包名/组件名\`）`,
      );
    }

    registry.set(id, { specifier, from });
  };

  for (const component of site) {
    declare(component, SITE_COLUMN);
  }

  for (const { from, components } of contributed) {
    for (const component of components) {
      declare(component, from);
    }
  }

  return registry;
}

/**
各包交出的那些默认规则：键 → 规则与交出它的那些人。

两族抢同一把 frontmatter 键没有合理的默认答案，所以默认红；唯一的豁免是站点已经把这把键关掉了
（`{ key, enabled: false }`）—— 那时两边都不生效，抢赢抢输没有后果，红只会让站点没法用一句配置
把两个包同时按住。`froms` 因此记全：关掉提示要把每一家都点出来。
*/
function defaultRules(
  contributed: readonly ContributedColumn[],
  disabled: ReadonlySet<string>,
): Map<string, { rule: NormalizedRule; froms: string[] }> {
  const defaults = new Map<string, { rule: NormalizedRule; froms: string[] }>();

  for (const { from, rules } of contributed) {
    for (const rule of rules) {
      const owner = defaults.get(rule.key);

      if (owner !== undefined) {
        if (disabled.has(rule.key)) {
          owner.froms.push(from);
          continue;
        }

        throw new Error(
          `theme-component-page 的键「${rule.key}」被 ${owner.froms[0]} 和 ${from} 各交出一条默认规则；同一把键只能有一个包接管，要两份都留着，给其中一条换一把键，或在站点配置里把这一把关掉（\`{ key: '${rule.key}', enabled: false }\`）`,
        );
      }

      defaults.set(rule.key, { rule, froms: [from] });
    }
  }

  return defaults;
}

/**
按 `id` 取那条登记，并把「查不到」说成一句能改的话。

组件包与规则可以出自同一个人，也可以不同：站点的规则引用某个包登记的组件是正常用法，
所以这一跳只在**全站**范围内查，报错点名到「这条规则是谁写的」。
*/
function specifierOf(
  rule: NormalizedRule,
  ruleFrom: string,
  registry: Map<string, { specifier: string; from: string }>,
): TableEntry {
  const component = registry.get(rule.id);

  if (component === undefined) {
    throw new Error(
      `theme-component-page 的键「${rule.key}」那条规则（${ruleFrom}）引用了组件登记名「${rule.id}」，但全站没有这一条登记：` +
        `规则的 \`component\` 那一格写的是 \`components[].id\`，不是模块说明符。要么让某个包（或站点自己的 \`components\`）登记它，要么改成已有的那一个。`,
    );
  }

  return { ...rule, specifier: component.specifier };
}

/**
按键名的固定字符串顺序排（UTF-16 码元序，不跟 locale 漂）。

只有「在前 / 在后」两档：能进这一次比较的两把键都来自那张按键名聚合的默认规则表，同名早在
`defaultRules` 那一步就红了，到这儿不存在相等的情况。
*/
function byKey(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : 1;
}

/**
站点那一列与各包交出的那些默认规则怎么合成一张表。

1. 先把两张归属表立起来（组件登记名、默认规则的键）—— 重名与抢键都在这一步红，唯一豁免是
   站点已经把那一把关掉（见 {@link defaultRules}）；
2. 按站点那一列的顺序展开：引用取那条默认规则、完整规则整条替换、`enabled: false` 让这一把键
   谁交来都不生效。处理过的键不再追加默认规则；
3. 剩下那些没被站点提过的默认规则，按**键名的固定字符串顺序**接在后面；
4. 每条规则的 `component` 都要查到登记，查不到就红。

站点那一列里写的完整规则**不继承**默认规则里的 `match` / `source` / `render` / `props`：
「只改一格」的写法看着像调一下，实际把另几格换成了缺省值，所以覆写就是整条重写（要留原来的
判法就把它抄全）。提示只在真的压过某个包那一条时才打 —— 站点自己新写一把键是它自己的事。
*/
export function buildRuleTable(
  site: {
    components: readonly NormalizedComponent[];
    rules: readonly SiteRuleItem[];
  },
  contributed: readonly ContributedColumn[],
): RuleTable {
  const registry = componentRegistry(site.components, contributed);
  /** 站点说「这把键谁交来都不生效」的那几把：抢键与提示两边都要读它。 */
  const disabled = new Set(
    site.rules
      .filter(
        (item): item is { kind: 'disabled'; key: string } =>
          item.kind === 'disabled',
      )
      .map((item) => item.key),
  );
  const defaults = defaultRules(contributed, disabled);
  const notices: string[] = [];
  const entries: TableEntry[] = [];
  /** 这把键已经在站点那一列里处理过（引用、覆写、禁用都算），不再追加默认规则。 */
  const handled = new Set<string>();

  for (const item of site.rules) {
    if (item.kind === 'disabled') {
      const owner = defaults.get(item.key);

      if (owner !== undefined) {
        notices.push(
          `theme-component-page：键「${item.key}」在站点配置里被关掉了（\`enabled: false\`），${owner.froms.join(' 和 ')} 交出的那条默认规则不生效。`,
        );
      }

      handled.add(item.key);

      continue;
    }

    if (item.kind === 'reference') {
      const owner = defaults.get(item.key);

      if (owner === undefined) {
        throw new Error(
          `theme-component-page 的站点配置里引用了键「${item.key}」，但没有任何装着的包交出这条默认规则；装那个包、换成一条真有的键，或者把它写成完整规则（\`{ key: '${item.key}', component: '…' }\`）`,
        );
      }

      entries.push(specifierOf(owner.rule, owner.froms.join(' 和 '), registry));
      handled.add(item.key);

      continue;
    }

    const owner = defaults.get(item.rule.key);

    if (owner !== undefined) {
      notices.push(
        `theme-component-page：键「${item.rule.key}」本来由 ${owner.froms.join(' 和 ')} 交出，站点配置里也写了这一把，用站点那一条（完整覆写不继承那条默认规则的 \`match\` / \`source\` / \`render\` / \`props\`）。`,
      );
    }

    entries.push(specifierOf(item.rule, SITE_COLUMN, registry));
    handled.add(item.rule.key);
  }

  const untouched = defaults
    .values()
    .filter(({ rule }) => !handled.has(rule.key))
    .toArray()
    .toSorted((a, b) => byKey(a.rule, b.rule));

  for (const { rule, froms } of untouched) {
    entries.push(specifierOf(rule, froms.join(' 和 '), registry));
  }

  return { entries, notices };
}
