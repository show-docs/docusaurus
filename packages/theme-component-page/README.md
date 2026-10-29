# @show-docs/docusaurus-theme-component-page

站点配置里写一列「frontmatter 键 → React 组件」的清单：某一页写了清单里那把键，
这一页的**整个 `DocItem`** 就换成那个组件。不命中（没写键、或写的形状不合这条的判法）时
这一层等于透明，正文原样交回下面那一层。

这一包只管**机制**：清单由站点给（也可以由装了的主题包自己交出，见下面
「让装了的那个包自己交出条目」那一节），组件由站点或别的主题包出，本包不认得任何具体页面、
也不认得别的包。`@show-docs/docusaurus-theme-iframe` 那一族「整页交给一个 `<iframe>`」
用的就是同一形状的落点（判键、替换整个 `DocItem`），它自带清单与判据，与这里各走各的。

## 安装

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-component-page
```

`@theme-prev/*` 那组别名由解析器插件提供，必须装上**并注册成插件**（这一层靠它拿「下面那一层」
的 `DocItem`）。本层问「装了哪些包、各自交出了什么条目」用的也是那个包里的同一份推导（见下面
那一节），所以它是本层唯一一条安装前提 —— 这一条在 `loadContent()` 里当场查（判据就住在那个包，
见它 README 的「各主题层那条「本插件注册了没有」的检查」），缺了它红在配置加载那一句，
而不是等打包时报 `Module not found: @theme-prev/DocItem`。需要 Docusaurus `^3.9.2` 与 Node `^24`。

## 使用

### 注册插件并交出清单

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    [
      '@show-docs/docusaurus-theme-component-page',
      {
        // 顺序就是优先级：一页同时写中两条键时，排在前面那条赢
        pages: [
          {
            key: 'report', // frontmatter 里那把键
            component: '@theme/ReportPage' // 命中后挂进去的组件
          },
          {
            key: 'embed',
            component: '@theme/EmbedPage',
            match: 'value', // 那把键的值是一串文本，交进组件
            props: { height: '480' } // 静态入参，并交进组件
          }
        ]
      }
    ]
  ]
};
```

**本包只有 `pages` 这一个选项。** 键名、组件、判法、静态入参都写在里面；组件本身不在这里。

### 在文档里写那把键

```md
---
title: 季度报表
report: true
---

正文一个字都不会出现：这一页的正文区整格交给了 `@theme/ReportPage`。
```

`match: 'value'` 那条写成 `embed: https://example.com/board` —— 命中的那串文本会作为 `value`
交进组件。

## 组件拿到什么

| 入参           | 从哪来                                                          |
| -------------- | --------------------------------------------------------------- |
| `frontMatter`  | 这一页的整份 frontmatter（没写时是一个空对象）                  |
| `value`        | 命中的那把键写下的值：`boolean` 恒为 `true`，`value` 是那串文本 |
| `content`      | 这一页的正文组件（MDX 编译出来的那一份），想留正文才用得上      |
| `props` 那一格 | 配置里与上面三份同名字典并交进来，同名的键**以本页那三份为准**  |

入参的类型由包发出来，站点侧写组件时可以直接引：

```tsx
// src/theme/ReportPage/index.tsx
import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

export default function ReportPage({ frontMatter, value }: ComponentPageProps) {
  return <h1>{String(frontMatter.title)}</h1>;
}
```

## 组件怎么写

`component` 那一格是一个**模块说明符**，判据是 webpack 的别名表认不认它，本包不解析也不校验
它指向哪里。三种常用写法：

- `@theme/X` —— 推荐。它跟着层栈走：站点在 `src/theme/X` 放一份就覆写掉它，不必回来改配置。
  组件可以由任何主题包发在自己 `theme/` 里，也可以由站点自己出。
- `@site/src/…` —— 直接指站点仓库里的文件（路径按站点根算；扩展名可以省，官方那条
  `resolve.extensions` 收了 `.mjs` / `.js` / `.jsx` / `.ts` / `.tsx`）。
- 包名或包的子路径 —— 指任何打包器能解析到的模块。

写了别名表认不出的东西，红在打包那一步（`Module not found`）。生成文件里每条 `import` 上面
都留了一句出处（`pages[下标]`、那把键），报错点因此能读。

## 让装了的那个包自己交出条目

上面那一列写在站点配置里。条目还有第二个来源：任何主题包都能在自己的插件实例上挂一个方法，
把自己要接管的那几页交出来 —— 站点装上那个包就生效，不必再回来抄一遍清单。

约定只有一条，方法叫 `getComponentPages()`，交回的东西和站点配置里那一列一模一样：

```js
// 某个主题包的入口：`plugins` 里那一项就是它
export default function myTheme(context, options) {
  return {
    name: 'my-theme',
    getThemePath: () => './theme',
    getComponentPages: () => [{ key: 'embed', component: '@theme/EmbedPage' }]
  };
}
```

合起来的规则：

- **站点那一列排在前面**：清单顺序就是命中优先级，站点自己写的先判，包交出的接在后面。
- **同一把键站点也写了一遍**：用站点那条，并在构建日志里留一句「这一把本来由 `my-theme`
  交出」。覆写是站点的本意，但生效情况确实和那个包写的不一样，不该没人知道。
- **站点把那一格写成 `false`**：这一把键**谁交来都不生效**，包交出的那条被丢掉并在日志里点名
  那个包。这是站点唯一的「关掉」写法 —— 不想让某个包接管某一页，又不必去改那个包里的键名。
- **两个包交出同一把键**：直接红，把抢的两边都点出来。这种局面没有合理的默认答案，
  让其中一个悄悄赢是最难查的那种结果。站点把那一把关掉时不红：两边都不生效，抢赢抢输没有后果。

```js
// docusaurus.config.mjs：站点不想要某个包接管 `embed` 那几页
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@my-theme/with-embed', // 它交出了 { key: 'embed', component: '@theme/EmbedPage' }
    [
      '@show-docs/docusaurus-theme-component-page',
      { pages: [{ key: 'embed', component: false }] }
    ]
  ]
};
```

`false` 只认站点这一列：包交出的那一列写它没有意义（那个包不能替站点决定它自己不生效），
红在配置加载那一句。

- 校验与站点那一列同一条，报错点名到是哪个包、第几条、哪一格
  （`pages（my-theme 交出的）[0].component`）。
- **交出条目的得是个主题包**：实例上要有 `getThemePath()`。问「装了哪些包」用的是
  [解析器插件](../plugin-prev-layer-resolver/README.md)那次推导，它只保留官方意义上的「主题」。
  站点把那个包声明在 `plugins` 还是 `themes` 里都算 —— 拿回来的是官方合并后的那一份，顺序照旧。
- **`getComponentPages()` 要便宜且幂等**：它可能被问好几遍（本层在配置期推一次，解析器插件在
  打包配置那一步自己再推一次），而且同一份配置两次问必须给出同一列 —— 两遍结果不一样，
  生成模块里就是「这一列最后一次问出来的那个样子」。所以那一格里别读文件、别算重东西、
  别依赖调用次数；要算，算好放着。
- 站点配置里 `pages` 一个字没写也行：那是空列，包交出的条目照样生效。

## 层栈与代价

本层提供 `theme/DocItem/index.tsx`，它是**唯一**判这份清单的那一格：先向下面那一层要
`DocItem`（`@theme-prev/DocItem`），只在命中时不再往下走。所以它在 `plugins` 里越靠后，
判得越早 —— 和其余各层同一格规则，见
[解析器插件的 README](../plugin-prev-layer-resolver/README.md)。

替换整个 `DocItem` 的代价与那族 iframe 框同一格：官方 `DocItem` 里那些东西一并不要 ——
`DocProvider`、`DocItem/Metadata`（页面标题与描述因此退回站点名）、`DocItem/Layout`
（面包屑、正文外壳、翻页、右侧目录）。留下的是文档页那层壳：navbar、footer，
还有包着正文的那个 `.container`。要在那些之上只改正文，官方那条 `DocItem/Content`
的 swizzle 更合适，本包不代替它。

**放在最外那一格会遮住下面各族的 `DocItem`**。本层命中时不再往下走，所以下面那一层（包括
[`theme-iframe`](../theme-iframe/README.md) 那一族「整页交给一个 `<iframe>`」的层）那份
`DocItem` 根本不会被走到 —— 它自己的那些开发模式告警因此一条都不打，从控制台看不出「这一页
本来归它」。两层互不认识，谁也报不了这条冲突，所以**顺序是站点作者的判据**：要那一族先判，
就把本层在它之前声明。

## 校验与提示

配置期红掉的那些（都会点名到 `pages[下标].哪一格`）：清单不是数组、某一条不是对象、
`key` 或 `component` 缺/空、`key` 用了官方文档页 frontmatter 的那一组键名、两条用了同一把键、
`match` 写了那两种以外的东西、`props` 不是普通对象、`props` 深处某格不是纯数据。

`key` 那一格为什么挡整组：本层判的就是「这一页写了这把键」，而 `title`、`description`、`slug`、
`sidebar_label`、`tags` 那些几乎每一页都写着，语义还归 Docusaurus 自己 —— 拿它们当键，
`match: 'value'` 一条就把整站正文换成了那一个组件。要用同一件事，换一把自己的键名
（`report_title` 这种；只有完全等于官方那一把才红）。

最后那一条判到底：那一格经 JSON 写法进生成模块，函数与 `undefined` 会在里面静默消失，
`NaN` 变成 `null`，`Date` / `Set` 变成另一种东西。所以串、数、布尔、`null`、普通对象、数组
以外的每一格都当场红，消息点到具体哪一格（`pages[0].props.filters[1].on`）。要传行为，
让组件自己读 `frontMatter`。

开发模式打到控制台的那些（构建产物里不打）：某页写了清单里的键但形状不合那条的判法、
一页同时命中多条（只用排在最前那条）。静默落空比红掉更难查，所以两条都留了话。

## 本层不做的四件事

- **按目录整片生效**：判定只看这一页的 frontmatter 写了哪把键，不认路径。
  想让一个目录下的每一页都走同一个组件，得逐页写那把键。
- **一页叠两个组件**：命中第一条就停，这一页只交出一个组件。要同时挂两层（例如整页组件
  之上再来一条横幅），由那个组件自己排，或由下面那一层再包一次。
- **只换正文、保留外壳**：见上面「层栈与代价」那节，官方那条 swizzle 落点更合适。
- **按页切分那个组件的代码**：生成模块里每条 `import` 都是写死的静态依赖，所以**清单里每一个
  组件都进文档页共用的那份 bundle**，不管这一页命中不命中。换成 `React.lazy` 就能按条切分，
  代价是命中那一页要多等一次请求、还要处理「加载中」那一格；本层先不替站点做这个取舍。
  清单只有几条、组件也不大时，这件事没有分量。

## 这份文档之外

- 本包是基础设施链中间那一格：站点自己写一列清单是一条用法，别的主题包用
  `getComponentPages()` 交条目是另一条。它是 `theme-iframe`（整页交给一个框）的一般形态 ——
  上面那格可以用本包，本包不反过来依赖它。三格的规矩写在仓库根 `README.md` 的
  「基础设施包」一节。
- [示例页](./docs/component-page-demo.md)：这一层命中时长什么样。
- [维护者文档](./docs/internals.md)：清单怎么变成浏览器读得到的组件、为什么非要生成一份文件、
  各处判据的实测根据。
