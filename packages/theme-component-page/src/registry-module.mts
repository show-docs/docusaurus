/**
生成浏览器读得到的那份注册表模块（写盘的只有本包入口，这里只出文本）。

## 为什么要有这一份

配置里那条 `component` 是**字符串**（如 `@theme/MyPage`），而 `@theme/*` 是 webpack 的**构建期**
别名 —— 浏览器侧那份 `DocItem` 里 `import` 只能是写死的字面量，没法 `import(变量)`。
所以「配置 → 组件」这一跳只能由配置期把字符串铺成一份真的带静态 `import` 的源码，
再由 `@generated` 那条别名交回浏览器侧。这一份就是铺出来的东西。

写进 `.docusaurus/`（Docusaurus 的生成目录，官方那条 babel 规则按 `/\.[jt]sx?$/i` 收它、
`excludeJS` 只排 `node_modules`），站点侧的 TypeScript 由本包
`types/component-page-specifiers.d.ts` 告之它存在。

`props` 那一格走 `JSON.stringify`：那样写得出来的东西就是纯数据（串 / 数 / 布尔 / `null` /
普通对象 / 数组），函数与 `undefined` 在这种写法下留不进产物。这一条不用在这里防 ——
`./config.mts` 的 `assertPureData()` 在配置期已经一路走到底，非纯数据的那一格当场红在
`pages[下标].props.哪一格`，所以到这一步 `props` 里每一样都保证写得出去。
*/

import type { EnabledPage } from './config.mts';

/** 生成文件里那条 `import` 的局部名前缀；下标跟着清单走，唯一且不撞保留字。 */
const LOCAL_PREFIX = 'ComponentPage';

/** 每份生成文件共有的那段抬头（告诉捡到它的人去哪儿改）。 */
const HEADER = `// 这份文件由 @show-docs/docusaurus-theme-component-page 在配置期生成，别手改。
// 要改的是站点配置里那个插件的 pages；改完重启站点（只有配置期写这一份）。
// 条目形状的类型在本包 types/component-page-specifiers.d.ts。`;

/** 一条页在生成文件里的那一格。 */
function renderPage({ entry }: EnabledPage, index: number): string {
  return `  {
    key: ${JSON.stringify(entry.key)},
    match: ${JSON.stringify(entry.match)},
    props: ${entry.props === undefined ? 'undefined' : JSON.stringify(entry.props)},
    Component: ${LOCAL_PREFIX + index},
  },`;
}

/**
那几行 `import`：每条上面留一句出处，webpack 报 `Module not found` 时才知道是配置里第几条、
哪把键要它。空清单交回空串（那时连那行都不占）。
*/
function renderImports(pages: readonly EnabledPage[]): string {
  return pages
    .map(
      ({ entry, specifier }, index) =>
        `// pages[${index}]，键 \`${entry.key}\`\nimport ${LOCAL_PREFIX + index} from ${JSON.stringify(specifier)};`,
    )
    .join('\n');
}

/**
`@generated/theme-component-page/registry` 那份文件的内容。

空清单（站点装了本层却一条没配）也照样出一份，只是里面没有 `import`：`theme/DocItem`
那一句 `import` 要落得下来，那时每一页都原样交回下层。
*/
export function renderRegistryModule(pages: readonly EnabledPage[]): string {
  const body =
    pages.length === 0
      ? '/** 清单顺序 = 命中优先级。 */\nexport const pages = [];'
      : `/** 清单顺序 = 命中优先级。 */\nexport const pages = [\n${pages.map((page, index) => renderPage(page, index)).join('\n')}\n];`;

  return [HEADER, renderImports(pages), body]
    .filter((part) => part !== '')
    .join('\n\n');
}
