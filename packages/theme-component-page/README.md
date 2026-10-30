# @show-docs/docusaurus-theme-component-page

站点配置里给两格：一张**组件登记表**（`components`：一个登记名 + 那个组件的模块说明符）和一张
**规则表**（`rules`：一把 frontmatter 键 + 引用哪个登记名 + 怎么判命中 + 渲染在哪儿）。某一页
写了规则里那把键，这一页的**整个 `DocItem`** 就换成那个组件。不命中（没写键、或写的形状不合
这条的判法）时这一层等于透明，正文原样交回官方那一份。

那把键读两处：这一页的 frontmatter，以及 MDX 模块上的同名命名导出。loader 往模块里追加的
`export const …` 就落在后一处 —— `theme-erd` 那把 `dbml_json` 就是。先看 frontmatter，那里没有
才看模块；两处都没有就是没命中，frontmatter 有同名键时不再看模块。

命中之后有两个落点：`render: 'page'`（缺省）在当前这份文档里渲染那个组件；`render: 'iframe'`
由本层现造一份**同源**的独立文档（`<baseUrl>/__component-frame` 那一条路由，本层注册），
把那一页的数据经握手送进框里，渲染器那一整套代码一行都不在父文档执行。

这一包只管**机制**：它不认得任何具体页面、也不 import 任何主题包。今天有七条层把「整页换掉」
交给本层，各在自己的 `loadContent()` 里交回自己那一格：

| 交来的键     | 判法      | 落点     | 组件（各自包里的 `theme/`）                           |
| ------------ | --------- | -------- | ----------------------------------------------------- |
| `scalar:`    | `boolean` | `iframe` | `@theme/ScalarView`                                   |
| `redoc:`     | `boolean` | `iframe` | `@theme/RedocView`                                    |
| `stoplight:` | `boolean` | `iframe` | `@theme/StoplightView`                                |
| `iframe:`    | `value`   | `page`   | `@theme/ExternalFrame`（`theme-iframe` 嵌外站那个框） |
| `markmap:`   | `options` | `page`   | `@theme/MarkmapPage`                                  |
| `dbml_json`  | `any`     | `page`   | `@theme/ErdPage`                                      |
| `diff:`      | `any`     | `page`   | `@theme/DiffPage`                                     |

判键、合成那张表、`DocItem` 那个套壳、同源框与握手、框内那条路由因此只有这一份实现。
`theme-iframe` 收缩成只剩 `iframe:` 那一把键，本层不依赖它 —— **卸载它，三条 API 层与它们的
同源框照常可用**（跨源那一份地址算法留在它自己包里）。

## 安装

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-component-page
```

解析器插件必须装上**并注册成插件**：本包随包发出的是未编译的 `.tsx` / `.ts` 源码
（`theme/`、`components/`、`lib/`），「谁来编它们」那条 babel 规则由它按 `@show-docs` 这个 scope
认领。它是本层唯一一条安装前提 —— 这一条在 `loadContent()` 里当场查（判据就住在那个包，
见它 README 的「各主题层那条「本插件注册了没有」的检查」），缺了它红在配置加载那一句，
而不是等打包时报 `Module parse failed`。需要 Docusaurus `^3.9.2` 与 Node `^24`。

别的层要检查的前提（「要交规则得装上本层」「要用 lightningcss 那条隔离得开
`future.faster.lightningCssMinimizer`」）在本包的 `./prerequisites` 出口里，本层自己不引它。

## 使用

### 注册插件并交出两格

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    [
      '@show-docs/docusaurus-theme-component-page',
      {
        // 组件登记表：规则用 id 引用组件，id 建议带上包名或站点前缀
        components: [
          { id: 'site/report', component: '@theme/ReportPage' },
          { id: 'site/embed', component: '@site/src/components/EmbedPage' }
        ],
        // 规则表：这一列的顺序就是命中优先级
        rules: [
          {
            key: 'report', // 这一页写了这把键（frontmatter 或模块导出）
            component: 'site/report' // 引用上面那一个登记名
          },
          {
            key: 'embed',
            component: 'site/embed',
            match: 'value', // 那把键的值是一串文本，交进组件
            props: { height: '480' } // 静态入参，并交进组件
          }
        ]
      }
    ]
  ]
};
```

一条规则里的 `component` 那一格写的是**登记名**，不是模块路径；说明符只写在 `components`
那一列。这样拆两格，是为了让「两条规则指向同一个组件」和「框内按名字找组件」都有唯一答案。

### 在文档里写那把键

```md
---
title: 季度报表
report: true
---

正文一个字都不会出现：这一页的正文区整格交给了 `@theme/ReportPage`。
```

`match: 'value'` 那条写成 `embed: https://example.com/board` —— 命中的那串文本会作为 `value`
交进组件。还有第三种判法 `match: 'options'`：那把键写 `true` 或一个选项对象都算命中，对象原样
交进组件（`markmap:` 那种「开着，选项写在键里」的写法用它）。第四种 `match: 'any'` 三者都认：
`true`、一串非空文本、一个选项对象都算命中，写下的那一格原样交进组件 —— 用于「开关本身还能
写参数，而每种写法各是一种含义」的那把键（`diff:` 就是：`true` 比本文自己、路径比那一份、
`{ old, new }` 比磁盘上那两份）。这些键也可以不写在 frontmatter 里：loader 往 MDX 模块追加的
命名导出同样算 —— `theme-erd` 的 `dbml_json` 就是（写它的是 loader，不是作者）。

| `match`   | 命中的写法                         |
| --------- | ---------------------------------- |
| `boolean` | 只有 `true`                        |
| `value`   | 一串非空文本                       |
| `options` | `true` 或一个选项对象              |
| `any`     | `true`、一串非空文本或一个选项对象 |

不写 `match` 等于 `boolean`。`false`、`null`、空串、数字、数组一律不命中。

`source` 那一格决定判据读哪一处：缺省 `auto` 两处都读（frontmatter 优先）；`frontMatter` 只读
frontmatter —— 嵌外站地址那一类键用它，正文里恰好有一条同名导出不该把整页换成框。

## 命中之后在哪儿渲染

`render` 那一格有两个值，缺省是 `page`。

- **`page`**：组件就挂在这一页的正文位置上，能用父页面的上下文，也额外收到 MDX 的 `content`
  （想留正文才用得上）。
- **`iframe`**：本层在这一页放一个指向 `<baseUrl>/__component-frame` 的同源框，框里那份文档
  按外层送进来的**登记名**从本层的框内登记表里取组件渲染。那条路由由本层
  （`allContentLoaded` 里的 `actions.addRoute`）注册，不是某条层的专属页面：它没有站点 Layout、
  没有 navbar、没有第二张表可判。那一页要渲染的数据由握手送进去（框报 `ready` → 外层送
  `init(登记名, 数据)`，之后外层切亮暗、框里换地址都各有一条消息），所以**框的地址里不带任何
  本页的信息** —— 深链、配色、那份数据都是运行期送的。

那条通道不是安全沙箱，也不是通用 RPC：框与父页同源，两边都能读对方的 DOM。它买的是
「渲染器自己那套样式、它那份 `<head>`、它的 localStorage 与它自己的路由都关在另一份文档里」，
以及「父文档少载一份渲染器 bundle」。跨源那种嵌法（嵌别人站点的一个 URL）不归本层，
那是 `theme-iframe` 的 `iframe:` 那一把键。

`render: 'iframe'` 的规则，其 `props` 要能进那一份 JSON：`JSON` 写不进去的东西（函数、
`undefined`、`Symbol`、`NaN` / `Infinity`、循环引用）在配置期就红，不等到框里少一格才查。

## 组件拿到什么

| 入参           | 从哪来                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontMatter`  | 这一页的整份 frontmatter（没写时是一个空对象）                                                                                              |
| `value`        | 命中的那把键写下的值（frontmatter 里写的，或模块导出上那一格）：`boolean` 恒为 `true`；`value` 是那串文本；`options` / `any` 是写下的那一格 |
| `content`      | 这一页的正文组件（MDX 编译出来的那一份），想留正文才用得上；**只有 `render: 'page'` 才送得进去**                                            |
| `props` 那一格 | 配置里与上面三份同名字典并交进来，同名的键**以本页那三份为准**                                                                              |

入参的类型由包发出来，站点侧写组件时可以直接引：

```tsx
// src/theme/ReportPage/index.tsx
import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

export default function ReportPage({ frontMatter, value }: ComponentPageProps) {
  return <h1>{String(frontMatter.title)}</h1>;
}
```

`render: 'iframe'` 那一侧的组件住在框里，除了上面那三份还能用本层那几条 hook 读框内的状态
（站点送进来的亮暗、这一页数据的其余各格）；写法见
[`docs/iframe-protocol.md`](./docs/iframe-protocol.md)。

## 说明符怎么写

`components` 那一列里的 `component` 是一个**模块说明符**，判据是 webpack 的别名表认不认它，
本包不解析也不校验它指向哪里。三种常用写法：

- `@theme/X` —— 推荐。它跟着层栈走：站点在 `src/theme/X` 放一份就覆写掉它，不必回来改配置。
  组件可以由任何主题包发在自己 `theme/` 里，也可以由站点自己出。
- `@site/src/…` —— 直接指站点仓库里的文件（路径按站点根算；扩展名可以省，官方那条
  `resolve.extensions` 收了 `.mjs` / `.js` / `.jsx` / `.ts` / `.tsx`）。
- 包名或包的子路径 —— 指任何打包器能解析到的模块。

写了别名表认不出的东西，红在打包那一步（`Module not found`）。生成文件里每条 `import` 上面
都留了一句出处（那条规则的 `key` 与登记它的来源），报错点因此能读。

## 让装了的那个包自己交出条目

上面那两格写在站点配置里。条目还有第二个来源：任何插件的 `loadContent()` 都能在自己交回的
content 里带一格 `componentPage` —— 站点装上那个包就生效，不必再回来抄一遍。

约定只有一条：交回 `{ componentPage: { components, rules } }`，两格的形状与站点配置里的一模
一样。本包在 `allContentLoaded` 里读官方汇起来的 `allContent`（插件名 → id → content），
content 上有这一格就收下：

```ts
// 某个主题包的入口
import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

export default function myTheme(context, options) {
  return {
    name: 'my-theme',
    getThemePath: () => './theme',
    loadContent() {
      return {
        componentPage: {
          components: [{ id: 'my/embed', component: '@theme/EmbedPage' }],
          rules: [{ key: 'embed', component: 'my/embed', match: 'value' }]
        }
      } satisfies ComponentPageContent;
    }
  };
}
```

`ComponentPageContent` 是纯类型，`import type` 取，不留运行时依赖。两格都可以只写其中一格：
只交组件（留给站点的规则引用）或只交规则（组件由别人登记）都合法。

合起来的规则：

- **站点那一列排在前面**：`rules` 里写下来的顺序就是命中优先级。站点没在这一列里提过的默认规则
  （包交出的那些），按**键名的固定字符串顺序**接在后面 —— 不读 `plugins` 的声明顺序、不读
  `allContent` 的键序，那些是实现细节而不是承诺。多装一个包、把两项调个位，都不该改变两页之间的先后。
- **一条引用**：站点 `rules` 里直接写一个字符串（`'scalar'`）= 把某包那条默认规则**提到这个位置**，
  内容照取、不算覆写、不留提示。引用的键必须真有其人，写错键名红在这里，而不是安静地少一条规则。
- **站点也写了同一把键**：用站点那一条（整条重写，见下一条），并在构建日志里留一句「这一把本来由
  `my-theme` 交出」。覆写是站点的本意，但生效情况确实和那个包写的不一样，不该没人知道。
- **完整覆写不继承任何一格**：站点写一条规则就是把 `match` / `source` / `render` / `props` 全换成
  缺省值。「只改一格」的写法看着像调一下，实际会换掉另几格，所以要留原来的判法就把它抄全。
- **`{ key: '…', enabled: false }`**：这一把键**谁交来都不生效**，包交出的那条被丢掉并在日志里
  点名那个包。这是站点唯一的「关掉」写法 —— 不想让某个包接管某一页，又不必去改那个包里的键名。
  `enabled` 只有站点那一列写得算，包交出的每一条都要是一条真规则，写它在配置期就点名（安静忽略的
  症状是「那个包以为自己关了，实际那条照常生效」）。
- **两个包交出同一把键**：直接红，把抢的两边都点出来。这种局面没有合理的默认答案，
  让其中一个悄悄赢是最难查的那种结果。站点把那一把关掉时不红：两边都不生效，抢赢抢输没有后果。
- **组件登记名同理**：全站一个登记名只能指向一个组件，撞了点名两方（站点与包撞也一样红）。
  建议 `id` 带上包名。
- **一条规则引用了没人登记过的组件**：红在配置期，并说明那一格写的该是登记名而不是说明符。
- **一个包可以交多条**：每条各带自己的 `key` / `match` / `props` / `component`，站点可以逐键
  覆写、引用或关掉，不牵连同包其他条目。一个包内两条写同一把键同样按重复红（「同源」不是豁免理由）。
- **任何被装载的插件都能交**：preset 展开出来的、相对路径入口的、配置里直接写函数的都在
  `allContent` 里；同一个包装了两次（不同 `id`）就是两份 content。装在依赖里、没注册进
  `plugins` / `themes` 的包不会出现 —— 这一版没有「按包名点名」的入口。
- **每一轮全量重算**：`reloadSite()`（开发期改文件）也重走一遍并整份覆写那两份生成文件，
  没有「这一轮只看到一部分包就先把表铺出去」的中间状态；删掉最后一条规则也照样出两份合法的空表。

```js
// docusaurus.config.mjs：站点不想要某个包接管 `embed` 那几页
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@my-theme/with-embed', // 它的 loadContent() 交回了 `embed` 那条默认规则
    [
      '@show-docs/docusaurus-theme-component-page',
      { rules: [{ key: 'embed', enabled: false }] }
    ]
  ]
};
```

- 校验与站点那一列同一条，报错点名到是哪个插件、第几条、哪一格
  （`componentPage（my-theme 交出的）.rules[0].component`）。这一步发生在 `allContentLoaded`，也就是打包之前。
- **规则在 `loadContent()` 里求值**：那一格跑在 Node 里 —— 不引 React、不引 DOM、不做副作用
  （别在那一格里读文件或写全局）。规则是纯数据，组件在浏览器期存在，两侧只靠登记名与
  `@theme/X` 字符串相连。
- **提示自己打**：清单拼错、列了没装的层这类话由算规则的那一方在 `loadContent()` 里打，
  本包不代打。
- **组件不许写 `@theme/DocItem`**：那个别名归本层，生成的注册表会 `import` 回本层自己，
  命中就递归；配置期直接红。
- 站点配置里两格一个字没写也行：那是两张空表，包交出的条目照样生效。

## 层栈与代价

本层提供 `theme/DocItem/index.tsx`，它是**唯一**判这张表的那一格：先向官方要
`DocItem`（`@theme-init/DocItem`；仓库里只有本层提供这一格，没有要串的链），只在命中时不再往下走。
所以它在 `plugins` 里要写在各层之后 —— 越晚声明 = 层栈越靠外 = 越先判（见
[解析器插件的 README](../plugin-prev-layer-resolver/README.md)）。注意这条顺序只管「这一页归谁
判」，**不管**两张表合成时的优先级：那个只看上面那一节写的两件事。

替换整个 `DocItem` 的代价与那族 iframe 框同一格：官方 `DocItem` 里那些东西一并不要 ——
`DocProvider`、`DocItem/Metadata`（页面标题与描述因此退回站点名）、`DocItem/Layout`
（面包屑、正文外壳、翻页、右侧目录）。留下的是文档页那层壳：navbar、footer，
还有包着正文的那个 `.container`。要在那些之上只改正文，官方那条 `DocItem/Content`
的 swizzle 更合适，本包不代替它。

**放在最外那一格会遮住下面各层的 `DocItem`**。本层命中时不再往下走，所以下面还覆盖
`DocItem` 的那些层（例如站点自己那份 `src/theme/DocItem`）对命中的页根本不会被走到 ——
它们自己的那些开发模式告警因此一条都不打，从控制台看不出「这一页本来归它」。层与层互不认识，
谁也报不了这条冲突，所以**顺序是站点作者的判据**：要那一层先判，就把本层往它之前声明。
上面那七条键没有这个问题：它们走的就是本层的这份清单，命中后分别由
`ScalarView` / `RedocView` / `StoplightView` / `ExternalFrame` / `MarkmapPage` / `ErdPage` /
`DiffPage` 渲染，`page` 那一侧渲染时自己向下一层要一份 `DocItem`。

## 校验与提示

配置期红掉的那些（都会点名到 `rules[下标].哪一格` 或 `components[下标].哪一格`）：两格不是数组、
某一条不是对象、`key` / `id` / `component` 缺或空、`key` 用了官方文档页 frontmatter 的那一组键名、
`key` 用了 Docusaurus 给每份 MDX 模块注入的那五个导出名（`frontMatter` / `contentTitle` / `toc` /
`metadata` / `assets`）、同一列里同一把键或同一个登记名出现两次、`components` 里的 `component`
写成 `@theme/DocItem`（那正是本层自己）、`match` / `source` / `render` 写了名单以外的东西、
`props` 不是普通对象、`props` 深处某格不是纯数据、包交出的那一条写了 `enabled`。
这一族还有三条红在合成那一步：站点引用了一把没人交出的键、两个包抢同一把键、
一条规则引用了没人登记过的组件。

`key` 那一格为什么挡整组：本层判的就是「这一页写了这把键」，而 `title`、`description`、`slug`、
`sidebar_label`、`tags` 那些几乎每一页都写着，语义还归 Docusaurus 自己 —— 拿它们当键，
`match: 'value'` 一条就把整站正文换成了那一个组件。要用同一件事，换一把自己的键名
（`report_title` 这种；只有完全等于官方那一把才红）。

另外五个名字挡在配置期：`frontMatter`、`contentTitle`、`toc`、`metadata`、`assets` 是 Docusaurus
给**每一份** MDX 模块注入的命名导出，而本层的判据也读模块上的同名导出 —— 拿它们当键，
`match: 'any'` 一条就是每一页都命中。站点自己写的键与 loader 追加的导出（`dbml_json` 那种）
都不在这五个里，正常写不会撞上。

`props` 那一条判到底：那一格经 JSON 写法进生成模块，`iframe` 那一侧还要再跨一次 postMessage，
函数与 `undefined` 会在里面静默消失，`NaN` 变成 `null`，`Date` / `Set` 变成另一种东西。所以串、
数、布尔、`null`、普通对象、数组以外的每一格都当场红，消息点到具体哪一格
（`rules[0].props.filters[1].on`）。要传行为，让组件自己读 `frontMatter`。

开发模式打到控制台的那些（构建产物里不打）：某页写了表里的键但形状不合那条的判法、
一页同时命中多条（只用排在最前那条，并点名其余）。静默落空比红掉更难查，所以两条都留了话。

## 本层不做的四件事

- **按目录整片生效**：判定只看这一页写没写那把键（frontmatter 或模块导出），不认路径。
  想让一个目录下的每一页都走同一个组件，得逐页写那把键。
- **一页叠两个组件**：命中第一条就停，这一页只交出一个组件。要同时挂两层（例如整页组件
  之上再来一条横幅），由那个组件自己排，或由下面那一层再包一次。
- **只换正文、保留外壳**：见上面「层栈与代价」那节，官方那条 swizzle 落点更合适。
- **按页切分那个组件的代码**：文档页那一份生成模块里每条 `import` 都是写死的静态依赖，所以
  **`render: 'page'` 的每一个组件都进文档页共用的那份 bundle**，不管这一页命中不命中。
  `render: 'iframe'` 的那几个不在父文档那份 bundle 里：它们在框内那份文档自己的文档里加载
  （厂商渲染器再由那一侧的 `import()` 按需取，见各包 `docs/internals.md`）。

## 这份文档之外

- 本包是基础设施链中间那一格：站点自己写两格是一条用法，别的插件在 `loadContent()` 里
  交回 `{ componentPage }` 是另一条（三条 API 层的框内视图、`theme-iframe` 的 `iframe:`、
  `theme-markmap` 的导图页、`theme-erd` 的关系图页与 `theme-diff` 的差异页就是这么接上的）。
  三格的规矩写在仓库根 `README.md` 的「基础设施包」一节。
- [示例页](./docs/component-page-demo.md)：这一层命中时长什么样。
- [跨 iframe 协议](./docs/iframe-protocol.md)：那条通道的四条消息、握手顺序、可见状态与边界。
- [维护者文档](./docs/internals.md)：两张表怎么变成浏览器读得到的组件、为什么非要生成两份文件、
  各处判据的实测根据，以及这一族为什么收成唯一分派器。
