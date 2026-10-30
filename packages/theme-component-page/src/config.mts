/**
「组件登记表 + 规则表」的**校验与归一化**：只在校验该管的范围内做事。

键名撞车、id 写重、形状写歪，都在这里当场红，而不是等到生成模块写进 `.docusaurus` 之后由
webpack 报一句看不出出处的 `Module not found`。这里不碰文件系统，也不解析组件说明符 ——
`ComponentRegistration.component` 那一格交给 webpack 的别名表（口径见本包 `docs/internals.md`），
本层只认它是个字符串；规则里那一格 `component` 是**登记名**，它能不能查到组件归
`./contribute.mts` 那张表管。

**配置期代码**：跑在 Node 里（jiti 直接吃这份 `.mts`），不引 React、不引 DOM；
那两格的形状引 `../types/component-page.ts` 那一份，浏览器侧读的是同一个类型。
*/

import type {
  ComponentPageMatch,
  ComponentPageRender,
  ComponentPageRule,
  ComponentPageSource,
  ComponentRegistration,
} from '../types/component-page.ts';

/** 登记表里一条经过校验的样子：一个登记名 + 它那个组件说明符。 */
export type NormalizedComponent = {
  id: string;
  /**
  原样写进生成模块那条 `import` 的说明符：`@theme/X`、`@site/…`、包名或路径都行，
  判据是 webpack 的别名表认不认它（不是本层认不认）。
  */
  specifier: string;
};

/** 规则表里一条经过校验、三格缺省都补明的样子。 */
export type NormalizedRule = ComponentPageRule & {
  /**
  `component` 那一格引用到的登记名，查表用（`./contribute.mts` 才看得见全站的登记表）。
  与 `component` 同值、各留一份：浏览器侧那份要满足 `ComponentPageRule` 的形状。
  */
  id: string;
};

/** 站点那一列里的一条：引用、完整规则、或禁用。 */
export type SiteRuleItem =
  | { kind: 'reference'; key: string }
  | { kind: 'rule'; rule: NormalizedRule }
  | { kind: 'disabled'; key: string };

/** 一位贡献者（站点自己或某个包）交来的那两格，校验过的。 */
export type NormalizedContribution = {
  components: NormalizedComponent[];
  rules: NormalizedRule[];
};

/**
官方文档页 frontmatter 的那一组键名 —— 本层的规则不许拿它们当 `key`。

本层判的就是「这一页写了这把键」，而这一组每一页都可能写着，语义还归 Docusaurus 自己：
`title` / `description` 几乎每页都有，配 `match: 'value'` 就把整站正文换成了那一个组件；
`slug` / `sidebar_label` / `tags` 那些更是本来就要被 Docusaurus 读走的。拿官方键名当键，
看不出是手误还是故意，所以整组红在配置加载那一句，而不是留一条告警等人去 dev 里翻控制台。

这一份名单由一条测试对回装的这个 Docusaurus 里那份 schema（见本包 `docs/internals.md`），
升级 Docusaurus 时那里会红。
*/
export const RESERVED_FRONTMATTER_KEYS: readonly string[] = [
  'custom_edit_url',
  'description',
  'displayed_sidebar',
  'draft',
  'hide_table_of_contents',
  'hide_title',
  'id',
  'image',
  'keywords',
  'last_update',
  'pagination_label',
  'pagination_next',
  'pagination_prev',
  'parse_number_prefixes',
  'sidebar_class_name',
  'sidebar_custom_props',
  'sidebar_key',
  'sidebar_label',
  'sidebar_position',
  'slug',
  'tags',
  'title',
  'toc_max_heading_level',
  'toc_min_heading_level',
  'unlisted',
];

const reservedKeySet = new Set(RESERVED_FRONTMATTER_KEYS);

/**
构建自己注入的那些命名导出 —— 本层的规则也不许拿它们当 `key`。

判据除了 frontmatter 还读 MDX 模块上的同名导出（`source: 'auto'` 那种读法），而这几个是
Docusaurus 自己往每一份模块上挂的（`frontMatter` / `contentTitle` 来自 mdx-loader，`toc` 来自
remark-toc，`metadata` / `assets` 看页面有没有），**几乎每一页都有**。拿它们当键，
`match: 'any'` 那种判法会在整站每一页命中，和「拿 `title` 当键」同一种手误，所以同样在配置期红。

这一份名单对的是 `ComponentCreator` 的「非 default 导出一律挂到组件上」那一步，比
{@link RESERVED_FRONTMATTER_KEYS} 短得多，也不必随官方 schema 漂 —— 它只认这五个名字。
*/
export const RESERVED_EXPORT_KEYS: readonly string[] = [
  'assets',
  'contentTitle',
  'frontMatter',
  'metadata',
  'toc',
];

const reservedExportKeySet = new Set(RESERVED_EXPORT_KEYS);

/** `match` 那一格认的四种判法；写在这一格，校验与报错文案共用同一份。 */
const MATCHES: readonly ComponentPageMatch[] = [
  'boolean',
  'value',
  'options',
  'any',
];

/** `source` 那一格认的两种读法。 */
const SOURCES: readonly ComponentPageSource[] = ['auto', 'frontMatter'];

/** `render` 那一格认的两种落点。 */
const RENDERS: readonly ComponentPageRender[] = ['page', 'iframe'];

/**
`@theme/DocItem` 这个别名归本层（本层就是最外层那个 `DocItem` 的提供者）。登记表里再指向它，
生成的注册表就 `import` 回本层自己，命中那页会递归渲染到爆 —— 配置期直接红。
*/
const SELF_SPECIFIER = '@theme/DocItem';

/** 那一格拿到的是什么东西，只用于报错文案（`null` 与数组各有名字，别混称 object）。 */
function kindOf(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  return Array.isArray(value) ? '数组' : typeof value;
}

function requireString(value: unknown, field: string, where: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(
      `theme-component-page 的 ${where}.${field} 要一个字符串，拿到的是 ${kindOf(value)}`,
    );
  }

  if (value === '') {
    throw new Error(`theme-component-page 的 ${where}.${field} 不能是空串`);
  }

  return value;
}

/** 是不是生成模块写得出来的那两种容器：数组，或没有原型的普通对象。 */
function isPlainContainer(value: object): boolean {
  if (Array.isArray(value)) {
    return true;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/**
这一格是不是纯数据（串 / 数 / 布尔 / `null` / 普通对象 / 数组），一路走到底。

生成模块那一格走 JSON 写法（`./registry-module.mts`），`iframe` 那一侧还要再跨一次
postMessage —— 这几种以外的东西进去要么消失（函数、`undefined`、`Symbol`）、要么变成另一种
东西（`NaN` 与 `Infinity` 写成 `null`，`Date` 写成串，`Map`/`Set` 写成空对象）。那种静默落空比
写歪更难查，所以配置期当场点名到 `rules[0].props.filters[1].on`；`parents` 那一串是来路，
用来拦自己绕回自己的那种值。
*/
function assertPureData(
  value: unknown,
  where: string,
  parents: ReadonlySet<object>,
): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        `theme-component-page 的 ${where} 是 ${value}，进不了生成模块（那样写出去是 null，要的是有限的那个数字）`,
      );
    }

    return;
  }

  if (typeof value !== 'object') {
    throw new TypeError(
      `theme-component-page 的 ${where} 是 ${kindOf(value)}，进不了生成模块：那一格只放纯数据（串 / 数 / 布尔 / null / 对象 / 数组），要传行为请让组件自己读 frontmatter`,
    );
  }

  if (parents.has(value)) {
    throw new Error(
      `theme-component-page 的 ${where} 绕回了自己，进不了生成模块（写那一格时它会直接抛）`,
    );
  }

  if (!isPlainContainer(value)) {
    throw new TypeError(
      `theme-component-page 的 ${where} 是另一种对象，进不了生成模块：那一格只放纯数据（串 / 数 / 布尔 / null / 普通对象 / 数组）`,
    );
  }

  const parentsOfChildren = new Set([...parents, value]);
  const children = Array.isArray(value)
    ? value.map((item, index) => [`${where}[${index}]`, item] as const)
    : Object.entries(value).map(
        ([field, item]) => [`${where}.${field}`, item] as const,
      );

  for (const [childWhere, child] of children) {
    assertPureData(child, childWhere, parentsOfChildren);
  }
}

/**
`props` 那一格：要么缺席，要么一个普通对象，而且里头每一样都得是纯数据。

最外层先按普通对象判（数组与 `null` 在那一步就被挡掉），再逐格走到底 —— 深处的函数留不进
生成模块，与其让它静默变成一个 `undefined`，不如红在配置加载那一句。
*/
function requirePropsObject(
  value: unknown,
  where: string,
): Record<string, unknown> {
  if (kindOf(value) !== 'object') {
    throw new TypeError(
      `theme-component-page 的 ${where}.props 要一个普通对象，拿到的是 ${kindOf(value)}`,
    );
  }

  const props = value as Record<string, unknown>;

  for (const [field, item] of Object.entries(props)) {
    assertPureData(item, `${where}.props.${field}`, new Set([props]));
  }

  return props;
}

/** 那一格缺省时补哪一个字，写了就必须是名单里那几种之一；名单同时进报错文案。 */
function normalizeEnum<T extends string>(
  value: unknown,
  field: string,
  where: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new TypeError(
      `theme-component-page 的 ${where}.${field} 只认 ${allowed.map((item) => `'${item}'`).join(' / ')}，拿到的是 ${kindOf(value)}`,
    );
  }

  return value as T;
}

/** 一把键能不能当规则用：官方 frontmatter 名与构建注入的导出名都挡在配置期。 */
function requireRuleKey(value: unknown, where: string): string {
  const key = requireString(value, 'key', where);

  if (reservedKeySet.has(key)) {
    throw new Error(
      `theme-component-page 的 ${where}.key「${key}」是官方文档页 frontmatter 的那一组键名之一，不能当规则的键：那些键几乎每一页都写着（按 \`match: 'value'\` 判就是把整站正文换成这一个组件），语义还归 Docusaurus 自己。换一把自己的键名。`,
    );
  }

  if (reservedExportKeySet.has(key)) {
    throw new Error(
      `theme-component-page 的 ${where}.key「${key}」是 Docusaurus 给每份 MDX 模块注入的导出名之一，不能当规则的键：判据除了 frontmatter 也读模块上的同名导出，而这些名字几乎每一页都有（按 \`match: 'any'\` 判就是每一页都命中）。换一把自己的键名。`,
    );
  }

  return key;
}

/**
把一条声明校验、归一化成 `NormalizedRule`。

站点那一列的完整覆写与各包交出的默认规则走同一条：`props` 只放纯数据，三格缺省在这里补明，
`component` 只当成登记名读（查不查得到归 `./contribute.mts`，那里才看得见全站的登记表）。
*/
function normalizeRule(declared: unknown, where: string): NormalizedRule {
  if (kindOf(declared) !== 'object') {
    throw new Error(
      `theme-component-page 的 ${where} 要一个对象，拿到的是 ${kindOf(declared)}`,
    );
  }

  const { key, component, match, source, render, props } = declared as Record<
    string,
    unknown
  >;
  const validatedKey = requireRuleKey(key, where);
  // `component` 那一格是**登记名**，不是模块说明符；同值留两份是因为浏览器侧读的是
  // `ComponentPageRule.component`，而查表与铺组件读的是 `id`。
  const id = requireString(component, 'component', where);

  return {
    key: validatedKey,
    component: id,
    id,
    match: normalizeEnum<ComponentPageMatch>(
      match,
      'match',
      where,
      MATCHES,
      'boolean',
    ),
    source: normalizeEnum<ComponentPageSource>(
      source,
      'source',
      where,
      SOURCES,
      'auto',
    ),
    render: normalizeEnum<ComponentPageRender>(
      render,
      'render',
      where,
      RENDERS,
      'page',
    ),
    props: props === undefined ? undefined : requirePropsObject(props, where),
  };
}

/**
一位贡献者交来的 `components` 那一格：每条是一个非空登记名 + 一个说明符，登记名在这一列里唯一。

`@theme/DocItem` 那个说明符在这里挡（它正是本层接管的那一格，生成的注册表会 `import` 回
本层自己，命中就递归）；跨贡献者的重名在 `./contribute.mts` 里红 —— 那里才知道是谁和谁撞了。
*/
function normalizeComponents(
  declared: unknown,
  column: string,
): NormalizedComponent[] {
  if (declared === undefined) {
    return [];
  }

  if (!Array.isArray(declared)) {
    throw new TypeError(
      `theme-component-page 的 ${column}.components 要一个数组，拿到的是 ${kindOf(declared)}`,
    );
  }

  const seen = new Set<string>();

  return declared.map((item: unknown, index: number) => {
    const where = `${column}.components[${index}]`;

    if (kindOf(item) !== 'object') {
      throw new Error(
        `theme-component-page 的 ${where} 要一个对象，拿到的是 ${kindOf(item)}`,
      );
    }

    const { id, component } = item as Record<string, unknown>;
    const validatedId = requireString(id, 'id', where);

    if (seen.has(validatedId)) {
      throw new Error(
        `theme-component-page 的 ${where}.id「${validatedId}」和同一列里前面某一条撞了；一个登记名只能有一条`,
      );
    }

    seen.add(validatedId);

    const specifier = requireString(component, 'component', where);

    if (specifier === SELF_SPECIFIER) {
      throw new Error(
        `theme-component-page 的 ${where}（登记名「${validatedId}」）的 component 是 ${SELF_SPECIFIER}：那正是本层接管的那一格，生成的注册表会 import 回本层自己，命中就递归。换一个组件说明符（站点想换这一页的外观，就在 \`src/theme/DocItem\` 里覆写本层的套壳）。`,
      );
    }

    return { id: validatedId, specifier };
  });
}

/**
一位贡献者交来的 `rules` 那一格（`undefined` 按空列）。

包交出的每一条必须是一条**真规则**：站点那一列才有的「关掉一把键」（`{ key, enabled: false }`）
在这里不认。那一格被安静地忽略的话，症状是「那个包以为自己把键关了，实际那条照常生效」——
比写歪更难查，所以在这里点名。
*/
function normalizeContributedRules(
  declared: unknown,
  column: string,
): NormalizedRule[] {
  if (declared === undefined) {
    return [];
  }

  if (!Array.isArray(declared)) {
    throw new TypeError(
      `theme-component-page 的 ${column}.rules 要一个数组，拿到的是 ${kindOf(declared)}`,
    );
  }

  const seen = new Set<string>();

  return declared.map((item: unknown, index: number) => {
    const where = `${column}.rules[${index}]`;

    if (
      typeof item === 'object' &&
      item !== null &&
      'enabled' in (item as Record<string, unknown>)
    ) {
      throw new Error(
        `theme-component-page 的 ${where} 写了 \`enabled\`：关掉一把键（\`{ key, enabled: false }\`）只有站点那一列写得算，包交出的每一条都要是一条真规则（\`{ key, component, match?, source?, render?, props? }\`）。站点不想让这把键生效，就在自己的 \`rules\` 里关掉它。`,
      );
    }

    const rule = normalizeRule(item, where);

    if (seen.has(rule.key)) {
      throw new Error(
        `theme-component-page 的 ${where}.key「${rule.key}」和同一列里前面某一条撞了；一把键只能有一条`,
      );
    }

    seen.add(rule.key);

    return rule;
  });
}

/**
校验一位贡献者交回的那两格（`loadContent()` 里那个 `componentPage`）。

整格缺席由调用方（`./contribute.mts`）判成「这个插件不贡献」；到这里就必须两格至少有一格，
形状不合在这里当场点名到 `componentPage（<谁> 交出的）.哪一格`。
*/
export function normalizeContribution(
  declared: unknown,
  column: string,
): NormalizedContribution {
  if (kindOf(declared) !== 'object') {
    throw new TypeError(
      `theme-component-page 的 ${column} 要一个对象（\`{ components, rules }\`），拿到的是 ${kindOf(declared)}`,
    );
  }

  const { components, rules } = declared as Record<string, unknown>;

  // 两格都认缺席；一条都不交是合法的（那个包只提供组件，规则由站点自己写）。
  return {
    components: normalizeComponents(components, column),
    rules: normalizeContributedRules(rules, column),
  };
}

/**
站点那一列里的 `rules`：一条引用、一条完整规则、或一条禁用。

- **字符串**：引用某一条默认规则并把它提到这个位置（不复制内容）；引用的键必须真有其人，
  写错键名在这里红，而不是安静地少一条规则。
- **`{ key, enabled: false }`**：这一把键谁交来都不生效 —— 包括另一个包抢同一把键那种本来要红
  的局面；站点是唯一能替这件事作主的一方。
- **其余对象**：一条**完整**规则，不继承默认规则里的 `match` / `source` / `render` / `props`
  —— 只改一格的写法看着像「调一下」，实际会把另几格换掉，所以覆写就是整条重写。

键在这一列里唯一（引用、覆写、禁用共用同一把键的账）。
*/
export function normalizeSiteRules(declared: unknown): SiteRuleItem[] {
  if (declared === undefined) {
    return [];
  }

  if (!Array.isArray(declared)) {
    throw new TypeError(
      `theme-component-page 的 rules 要一个数组，拿到的是 ${kindOf(declared)}`,
    );
  }

  const seen = new Set<string>();

  /** 三条臂共用的一句：这把键在这一列里只能出现一次。 */
  const once = (key: string, where: string): void => {
    if (seen.has(key)) {
      throw new Error(
        `theme-component-page 的 ${where} 的键「${key}」在这份 rules 里出现了不止一次；一把键只能有一条（引用、覆写、禁用算同一条账）`,
      );
    }

    seen.add(key);
  };

  return declared.map((item: unknown, index: number): SiteRuleItem => {
    const where = `rules[${index}]`;

    if (typeof item === 'string') {
      if (item === '') {
        throw new Error(
          `theme-component-page 的 ${where} 是一串空文本：引用一条默认规则要写那把键的名字`,
        );
      }

      once(item, where);

      return { kind: 'reference', key: item };
    }

    if (kindOf(item) !== 'object') {
      throw new Error(
        `theme-component-page 的 ${where} 要一个字符串（引用一条默认规则）或一个对象，拿到的是 ${kindOf(item)}`,
      );
    }

    const key = requireRuleKey((item as { key?: unknown }).key, where);
    once(key, where);

    return (item as { enabled?: unknown }).enabled === false
      ? { kind: 'disabled', key }
      : { kind: 'rule', rule: normalizeRule(item, where) };
  });
}

/**
把站点自己那一列（`components` + `rules` 两格）校验成表。

组件那一格与包交来的走同一条校验，只是报错里那份列名叫站点的 `components`；规则那一格走
{@link normalizeSiteRules} 那三种臂。
*/
export function normalizeSiteColumn(
  components: unknown,
  rules: unknown,
): { components: NormalizedComponent[]; rules: SiteRuleItem[] } {
  return {
    components: normalizeComponents(components, '站点配置'),
    rules: normalizeSiteRules(rules),
  };
}

export type {
  ComponentPageMatch,
  ComponentPageRender,
  ComponentPageSource,
  ComponentRegistration,
};
