/**
生成浏览器读得到的那两份模块（写盘的只有本包入口，这里只出文本）。

## 为什么要有这两份

配置里那个 `component` 是**字符串**（如 `@theme/ScalarView`），而 `@theme/*` 是 webpack 的
**构建期**别名 —— 浏览器侧那句 `import` 只能是写死的字面量，没法 `import(变量)`。
所以「规则 → 组件」这一跳只能由配置期把字符串铺成一份真的带静态 `import` 的源码，
再由 `@generated` 那条别名交回浏览器侧。这里铺的就是那份东西。

**两份而不是一份**，因为两种渲染落点的依赖面完全不同：

- `registry.ts` 站在文档页里（`theme/DocItem` 读它），只 `import` `render: 'page'` 那些规则
  引用到的组件；
- `frame-registry.ts` 站在框内那份独立文档里（`theme/ComponentFramePage` 读它），只 `import`
  `render: 'iframe'` 那些引用到的，按登记名查。

于是「命中某页要下载什么」只跟着它真用的那一份走：父文档不会因为某页把渲染器交给框内就
连带把那几 MB 拖进入口 chunk，框里那份文档也不需要父页那半边的组件。同一个组件被两种规则
引用时才两侧各导入一次。

写进 `.docusaurus/`（Docusaurus 的生成目录，官方那条 babel 规则按 `/\.[jt]sx?$/i` 收它、
`excludeJS` 只排 `node_modules`），站点侧的 TypeScript 由本包
`types/component-page-specifiers.d.ts` 告之它存在。

`props` 那一格走 `JSON.stringify`：那样写得出来的东西就是纯数据（串 / 数 / 布尔 / `null` /
普通对象 / 数组），函数与 `undefined` 在这种写法下留不进产物。这一条不用在这里防 ——
`./config.mts` 的 `assertPureData()` 在配置期已经一路走到底，非纯数据的那一格当场红在
`rules[下标].props.哪一格`，所以到这一步 `props` 里每一样都保证写得出去（`iframe` 那一侧还要
靠它跨 postMessage，同样只有写得出去的东西送得出去）。
*/

import type { TableEntry } from './contribute.mts';

/** 文档页那份生成文件里的局部名前缀；下标跟着表走，唯一且不撞保留字。 */
const PAGE_PREFIX = 'ComponentPage';

/** 框内那份生成文件里的局部名前缀。 */
const FRAME_PREFIX = 'FrameComponent';

/** 两份生成文件共有的那段抬头（告诉捡到它的人去哪儿改）。 */
function header(file: string): string {
  return `// 这份文件由 @show-docs/docusaurus-theme-component-page 在配置期生成，别手改。
// 要改的是站点配置里那个插件的 components / rules，以及各包 loadContent() 交回的那一格；改完重启站点。
// 形状在本包 types/component-page-specifiers.d.ts，这里的「${file}」按 render 只收自己那一半。`;
}

/** 一条规则在生成文件里那几格数据（`props` 走 JSON 写法，其余是字面量）。 */
function fields(entry: TableEntry): string {
  return `    key: ${JSON.stringify(entry.key)},
    match: ${JSON.stringify(entry.match)},
    source: ${JSON.stringify(entry.source)},
    render: ${JSON.stringify(entry.render)},
    component: ${JSON.stringify(entry.id)},
    props: ${entry.props === undefined ? 'undefined' : JSON.stringify(entry.props)}`;
}

/**
文档页那一份的 `import`：每条上面留一句出处，webpack 报 `Module not found` 时才知道是第几条、
哪把键要它。空表交回空串（那时连那行都不占）。
*/
function renderPageImports(pageEntries: readonly TableEntry[]): string {
  return pageEntries
    .map(
      (entry, index) =>
        `// 规则 \`${entry.key}\`（render: page）\nimport ${PAGE_PREFIX + index} from ${JSON.stringify(entry.specifier)};`,
    )
    .join('\n');
}

/** 框内那一份的 `import`：按登记名去重，一个组件只 `import` 一次。 */
function renderFrameImports(
  frameEntries: readonly { id: string; specifier: string }[],
): string {
  return frameEntries
    .map(
      ({ id, specifier }, index) =>
        `// 登记名 \`${id}\`\nimport ${FRAME_PREFIX + index} from ${JSON.stringify(specifier)};`,
    )
    .join('\n');
}

/**
一条 `render: 'page'` 的规则在文档页那份表里的一格：带上指向那条 `import` 的局部名。

只有判过 `render` 的那一条才走到这里（调用方按 render 分两路），所以这里不再判第二遍。
*/
function renderPageEntry(entry: TableEntry, index: number): string {
  return `  {\n${fields(entry)},\n    Component: ${PAGE_PREFIX + index}\n  },`;
}

/** 表里那几条 `render: 'page'` 的下标序：局部名要跟着它，两边才对得上。 */
function pageEntriesOf(entries: readonly TableEntry[]): TableEntry[] {
  return entries.filter((entry) => entry.render === 'page');
}

/** 表里那几条 `render: 'iframe'` 引用到的组件，按登记名去重、保持首次出现的顺序。 */
function frameComponentsOf(
  entries: readonly TableEntry[],
): { id: string; specifier: string }[] {
  const seen = new Set<string>();
  const components: { id: string; specifier: string }[] = [];

  for (const entry of entries) {
    if (entry.render !== 'iframe' || seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    components.push({ id: entry.id, specifier: entry.specifier });
  }

  return components;
}

/**
`@generated/theme-component-page/registry` 那份文件的内容。

空表（站点装了本层却一条规则都没有）也照样出一份，只是里面没有 `import`：`theme/DocItem`
那一句 `import` 要落得下来，那时每一页都原样交回下层。表的**顺序就是命中优先级**。
*/
export function renderRegistryModule(entries: readonly TableEntry[]): string {
  const page = pageEntriesOf(entries);
  /** 那条 `import` 的局部名按 page 那一侧的下标走，两边才对得上同一个组件。 */
  const indexOfPage = new Map(page.map((entry, index) => [entry, index]));

  const rows = entries
    .map((entry) =>
      entry.render === 'page'
        ? renderPageEntry(entry, indexOfPage.get(entry) as number)
        : `  {\n${fields(entry)}\n  },`,
    )
    .join('\n');

  const body = `/** 表的顺序 = 命中优先级。 */\nexport const rules = [${
    rows === '' ? '' : `\n${rows}\n`
  }];`;

  return [header('render: page'), renderPageImports(page), body]
    .filter((part) => part !== '')
    .join('\n\n');
}

/**
`@generated/theme-component-page/frame-registry` 那份文件的内容：登记名 → 组件。

框内那份文档按外层送进来的登记名查这一份；没登记过的那个名字在框里是一条看得见的错误，
不是空白（判据与文案在 `theme/ComponentFramePage`）。
*/
export function renderFrameRegistryModule(
  entries: readonly TableEntry[],
): string {
  const components = frameComponentsOf(entries);
  const body =
    components.length === 0
      ? 'export const components = [];'
      : `export const components = [\n${components
          .map(
            ({ id }, index) =>
              `  { id: ${JSON.stringify(id)}, Component: ${FRAME_PREFIX + index} },`,
          )
          .join('\n')}\n];`;

  return [header('render: iframe'), renderFrameImports(components), body]
    .filter((part) => part !== '')
    .join('\n\n');
}
