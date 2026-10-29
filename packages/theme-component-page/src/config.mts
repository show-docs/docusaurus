/**
站点配置里那一列清单的**校验与归一化**：只在校验该管的范围内做事。

键名撞车、形状写歪，都在这里当场红，而不是等到生成模块写进 `.docusaurus` 之后由 webpack
报一句看不出出处的 `Module not found`。这里不碰文件系统，也不解析组件说明符 ——
`component` 那格交给 webpack 的别名表（口径见本包 `docs/internals.md`），本层只认它是个字符串。

**配置期代码**：跑在 Node 里（jiti 直接吃这份 `.mts`），不引 React、不引 DOM；
条目的形状引 `../lib/component-page.ts` 那一份，浏览器侧读的是同一个类型。
*/

import type {
  ComponentPageEntry,
  ComponentPageMatch,
} from '../types/component-page.ts';

/**
配置里的一条，归一化之后的样子。

`specifier` 是 `false` 的那一种只出得自**站点自己那一列**：那条是一个「关掉这把键」的记号，
不是给组件的说明符，所以到不了生成模块（`./contribute.mts` 的 `mergePages` 把它挑出去）。
*/
export type NormalizedPage = {
  entry: ComponentPageEntry;
  /**
  原样写进生成模块那条 `import` 的说明符：`@theme/X`、`@site/…`、包名或路径都行，
  判据是 webpack 的别名表认不认它（不是本层认不认）。站点写 `false` 时是「这把键不生效」的记号。
  */
  specifier: string | false;
};

/** 归一化过、且真的进了生成模块的那一条（`specifier` 不是关掉记号）。 */
export type EnabledPage = NormalizedPage & { specifier: string };

/** `normalizePages` 的两个开关。 */
export type NormalizePagesOptions = {
  /** 报错里怎么称呼这一列：站点的默认 `pages`，包交出的那条带上包名。 */
  column?: string;
  /**
  这一列是不是站点自己写的那一列。只有它认 `component: false`（关掉一把键）；
  包交出的那一列写 `false` 没有意义 —— 那个包不能替站点决定它自己不生效。
  */
  siteColumn?: boolean;
};

/**
官方文档页 frontmatter 的那一组键名 —— 本层的清单不许拿它们当 `key`。

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

/** 配置里那一条的形状（还没校验）。 */
type DeclaredPage = {
  key?: unknown;
  component?: unknown;
  match?: unknown;
  props?: unknown;
};

/** `match` 那格认的三种判法；写在这一格，校验与报错文案共用同一份。 */
const MATCHES: readonly ComponentPageMatch[] = ['boolean', 'value', 'options'];

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

生成模块那一格走 JSON 写法（`./registry-module.mts`），这几种以外的东西进去要么消失
（函数、`undefined`、`Symbol`）、要么变成另一种东西（`NaN` 与 `Infinity` 写成 `null`，
`Date` 写成串，`Map`/`Set` 写成空对象）。那种静默落空比写歪更难查，所以配置期当场点名到
`pages[0].props.filters[1].on`；`parents` 那一串是来路，用来拦自己绕回自己的那种值。
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

/** `match` 那一格：缺它按 `boolean`，写了就必须是 `MATCHES` 里那三种之一。 */
function normalizeMatch(value: unknown, where: string): ComponentPageMatch {
  if (value === undefined) {
    return 'boolean';
  }

  if (
    typeof value !== 'string' ||
    !MATCHES.includes(value as ComponentPageMatch)
  ) {
    throw new TypeError(
      `theme-component-page 的 ${where}.match 只认 ${MATCHES.map((match) => `'${match}'`).join(' / ')}，拿到的是 ${kindOf(value)}`,
    );
  }

  return value as ComponentPageMatch;
}

/**
`component` 那一格：一个非空串，或者站点那一列写下的 `false`。

`false` 是「这一把键谁交来都不生效」的那个记号，只有站点那一列认：那个包不能替站点决定它自己
交出的条目不生效，写了就该被点名（写 `false` 的那个包多半是想在本包关掉某一页，那不归这里管）。
其余形状仍走 `requireString`，所以 `true` 那种挨近的错误说得出「拿到的是 boolean」。
*/
function normalizeSpecifier(
  value: unknown,
  where: string,
  siteColumn: boolean,
): string | false {
  if (value === false) {
    if (!siteColumn) {
      throw new Error(
        `theme-component-page 的 ${where}.component 是 false：关掉一把键只有站点那一列写得算，包交出的那一列请直接不交这一条`,
      );
    }

    return false;
  }

  return requireString(value, 'component', where);
}

/**
把一列清单校验成生成模块要用的那份。站点写的那一列、别的包交出的那一列，走同一条校验。

缺省（没写、或写了空列）交回空清单：本层装了但一条没配是合法的，那时每一页都原样交回下层。

两个开关都只管报错与那一格的认法：`column` 改报错里怎么称呼这一列（站点的默认 `pages`，
包交出的那条带上包名 `pages（@x 交出的）[0]`，红起来才知道该回哪个包改）；`siteColumn` 让
`component: false` 那一种记号只出得自站点那一列。

那两个重载不是装饰：`siteColumn` 为假时那一格写 `false` 会红，所以交得出的只可能是真说明符
（`EnabledPage`），`mergePages` 与生成模块因此不必再判一种「按类型到不了」的形状；站点那一列
才会交回带关掉记号的 `NormalizedPage`。
*/
export function normalizePages(
  declared: unknown,
  options?: NormalizePagesOptions & { siteColumn?: false },
): EnabledPage[];
export function normalizePages(
  declared: unknown,
  options: NormalizePagesOptions & { siteColumn: true },
): NormalizedPage[];
export function normalizePages(
  declared: unknown,
  { column = 'pages', siteColumn = false }: NormalizePagesOptions = {},
): NormalizedPage[] {
  if (declared === undefined) {
    return [];
  }

  if (!Array.isArray(declared)) {
    throw new TypeError(
      `theme-component-page 的 ${column} 要一个数组，拿到的是 ${kindOf(declared)}`,
    );
  }

  const seen = new Set<string>();

  return declared.map((page: unknown, index: number): NormalizedPage => {
    const where = `${column}[${index}]`;

    if (kindOf(page) !== 'object') {
      throw new Error(
        `theme-component-page 的 ${where} 要一个对象，拿到的是 ${kindOf(page)}`,
      );
    }

    const { key, component, match, props } = page as DeclaredPage;
    const validatedKey = requireString(key, 'key', where);

    if (reservedKeySet.has(validatedKey)) {
      throw new Error(
        `theme-component-page 的 ${where}.key「${validatedKey}」是官方文档页 frontmatter 的那一组键名之一，不能当清单的键：那些键几乎每一页都写着（按 \`match: 'value'\` 判就是把整站正文换成这一个组件），语义还归 Docusaurus 自己。换一把自己的键名。`,
      );
    }

    if (seen.has(validatedKey)) {
      throw new Error(
        `theme-component-page 的 ${where}.key「${validatedKey}」和前面某一条撞了；一把键只能有一条`,
      );
    }

    seen.add(validatedKey);

    return {
      entry: {
        key: validatedKey,
        match: normalizeMatch(match, where),
        props:
          props === undefined ? undefined : requirePropsObject(props, where),
      },
      specifier: normalizeSpecifier(component, where, siteColumn),
    };
  });
}
