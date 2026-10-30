/**
本层那份「组件登记表 + 规则表」的**形状**：配置期写它（`src/config.mts` 校验成这个样子，
`src/contribute.mts` 把各包交来的合成一张表），浏览器期读它
（`lib/component-page.ts` 按它判命中、组装入参，`theme/DocItem` 只负责挂上去）。

形状为什么单独占一份 `.d.ts`，而不是和判据一起留在 `lib/`：`src/` 要过 `tsc`
（`rootDir` 是 `src/`），相对路径引到 `lib/` 里的源码会让构建停在 TS6059 —— 兄弟包因此把
配置期逻辑整体留在 `lib/`（`theme-iframe/src/index.mts` 头上记着同一格）。本包的配置期
要产出生成模块的文本，留在 `src/` 更顺，所以共享的只有这一份**声明**：`.d.ts` 不参与产出，
`rootDir` 不管它，两侧都能引同一份、不再各写一遍。

站点侧写组件时不必知道这一格：从 `@show-docs/docusaurus-theme-component-page/lib/component-page.ts`
引 `ComponentPageProps` 就行（那一份把这里的类型转出去）。
*/

/**
一把键怎么算命中：

- `boolean`：那把键写 `true` 才算命中（`myPage: true`）；
- `value`：那把键写一串非空文本才算命中，命中的那串文本交进组件（`myPage: '/some/path'`）；
- `options`：那把键写 `true` 或一个选项对象才算命中，命中的那个值原样交进组件
  （`myPage: true` / `myPage: { color: 'red' }`）—— 「开关，开关上还可以带选项」的那一种写法。
- `any`：那把键写 `true`、一串非空文本或一个选项对象都算命中，写下的值原样交进组件
  （`myPage: true` / `myPage: '/some/path'` / `myPage: { old: 'a', new: 'b' }`）——
  「开关本身还能写参数」的那一种写法，三种形状各有含义时用它。
*/
export type ComponentPageMatch = 'boolean' | 'value' | 'options' | 'any'

/**
命中判据读哪一处：

- `auto`（缺省）：先看这一页 frontmatter 里同名的键，没有再看 MDX 模块上同名的命名导出；
  两处都没有算没写。显式写了 `false` 的那一把**不回退**到另一处 —— 那是作者说定的「不要」。
- `frontMatter`：只读 frontmatter，同名模块导出不算命中。嵌外站地址那一类键用它：
  正文里恰好有一条同名导出就把整页换成框，不是作者的本意。
*/
export type ComponentPageSource = 'auto' | 'frontMatter'

/**
命中之后在哪儿渲染：

- `page`（缺省）：在当前这份文档里渲染那个组件，能用父页面的上下文，并额外收到 MDX `content`。
- `iframe`：由本层创建一份**同源**独立文档（那条通用框内路由），在框内渲染那个组件；
  不传 React `content`，也不传父页上下文 —— 框里的渲染器代码一行都不在父文档执行。
*/
export type ComponentPageRender = 'page' | 'iframe'

/** 一个组件登记进本层的那一条：全站唯一的 id，加上它真正的模块说明符。 */
export type ComponentRegistration = {
  /**
  这个组件在这张表里的名字。规则用 `component` 引用它，框内那条路由也按它找组件。
  建议写成 `包名/组件名`：两条规则指向同一个组件时才谈得上「同一个 id」，多个实例各用自己的。
  */
  id: string
  /**
  那个组件的模块说明符，判据是 webpack 的别名表认不认它。推荐写 `@theme/X`：那条别名跟着
  层栈走，站点在 `src/theme/X` 放一份就覆写掉实现，不必回配置里改。
  */
  component: string
}

/** 一条规则：一把键 + 引用哪个组件 + 怎么判命中 + 渲染在哪儿 + 给那个组件的静态入参。 */
export type ComponentPageRuleDeclaration = {
  /**
  那一把键的名字。按 `source` 那一格的读法去读它（先看 frontmatter，再看 MDX 模块上的
  同名命名导出）。两处都没有 = 这一条不命中。
  */
  key: string
  /** 命中之后挂的那个组件：`ComponentRegistration` 里那一个的 `id`，**不是**模块路径。 */
  component: string
  /** 这把键怎么算命中；缺它按 `boolean`。 */
  match?: ComponentPageMatch
  /** 判据读哪一处；缺它按 `auto`。 */
  source?: ComponentPageSource
  /** 命中后在哪儿渲染；缺它按 `page`。 */
  render?: ComponentPageRender
  /**
  配置里 `props` 那一格，原样并交进组件的入参。与下面那几格（`frontMatter` / `value`，
  `page` 那种还多一格 `content`）同名时**以本页那几格为准** —— 那一格是每一页共用的入参，
  不该盖掉本页的事实；次序住在 `lib/component-page.ts` 的 `componentPageProps()`。
  它要进产物（`iframe` 那种还得跨 postMessage 送），所以只能放纯数据，不放函数。
  */
  props?: Record<string, unknown>
}

/**
归一化之后的一条规则：声明里那三格缺省的判法都补成了明写的值。

`id` 是 `component` 引用到的那个登记名；生成模块按它把真的组件挂上（`page` 那一侧）或
按它查表（`iframe` 那一侧），本层不静默丢引用。
*/
export type ComponentPageRule = ComponentPageRuleDeclaration & {
  match: ComponentPageMatch
  source: ComponentPageSource
  render: ComponentPageRender
}

/** 命中那把键写下的值：`boolean` 恒为 `true`，`value` 是那串非空文本，`options` / `any` 是写下的那一格。 */
export type ComponentPageValue = true | string | Record<string, unknown>

/**
判命中要看的那一页：两份事实，缺哪份都不影响另一份。

- `frontMatter`：作者在文件头写下的那些键。
- `content`：这一页 MDX 模块的 default 组件。Docusaurus 的 `ComponentCreator` 把每个非 `default`
  的命名导出挂到它身上，所以 `content.dbml_json` 这种编译期由 loader 产出的值也在这里。

`auto` 那一种读法两处都读，**同名时 `frontMatter` 赢**：那是作者手写、看得见的一格，导出是编译产物。
两处都没有才算没写。`frontMatter` 那一种只读第一份（见 `ComponentPageSource`）。
*/
export type ComponentPageFacts = {
  /** 这一页的 frontmatter 整份；非文档页可以缺席。 */
  frontMatter?: Record<string, unknown>
  /** 这一页的 MDX 模块（default 组件 + 挂在它身上的命名导出）；非文档页可以是任何东西。 */
  content?: unknown
}

/**
别的主题包从 `loadContent()` 交回的那一格；**键名就是约定**。

本层在 `allContentLoaded` 里只看这一格：content 是对象、且身上有 `componentPage`，就算那个
插件贡献了东西；没有这一格 = 不交。写歪了由 `src/config.mts` 那一条校验点名到
`componentPage（<插件> 交出的）.哪一格`。

两条臂都可以缺席：只交组件不交默认规则（组件留给站点的规则引用），或只交默认规则、组件由别人
登记。`rules` 里那一格 `component` 引用的是**全站**那张登记表里的名字 —— 站点自己或任何一个包
登记的都算，查不到那条规则红在配置期（查表的口径见 `src/contribute.mts`）。

这条约定住在包的类型出口里，贡献方（比如 `theme-scalar`）`import type` 它来标注自己交回的
东西，形状就不会在贡献方与校验方各写一遍；`import type` 不留运行时依赖。
*/
export type ComponentPageContribution = {
  components?: readonly ComponentRegistration[]
  rules?: readonly ComponentPageRuleDeclaration[]
}

/** content 上那一格的形状：键名 `componentPage`，值是上面那份贡献。 */
export type ComponentPageContent = {
  componentPage: ComponentPageContribution
}

/**
交进那个组件的入参：本层给的几份 + 配置里 `props` 那格并进来的其余各份。
次序由 `lib/component-page.ts` 的 `componentPageProps()` 定一次：**同名的那几份本页事实赢**。

`content` 这一格只在 `render: 'page'` 时有：它是这一层「替换 `DocItem`」的出口而不是入口 ——
整页交出去之后，那个组件想留正文就自己渲染它（命中时本层不再往下走，下层那份 `DocItem`
给不了它）。`render: 'iframe'` 时框里那份文档没有父页的 React 树，这一格恒为 `undefined`。
*/
export type ComponentPageProps = {
  /** 这一页的 frontmatter 整份，组件据此读它自己的其余键。 */
  frontMatter: Record<string, unknown>
  /** 命中的那把键写下的值。 */
  value: ComponentPageValue
  /** 这一页的正文组件（MDX 编译出来的那一份）；只有 `page` 那一侧送得进去。 */
  content?: unknown
  /** 配置里 `props` 那一格并进来的静态入参。 */
  [prop: string]: unknown
}
