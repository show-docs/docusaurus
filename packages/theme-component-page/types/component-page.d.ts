/**
本层那份清单的**形状**：配置期写它（`src/config.mts` 校验成这个样子），浏览器期读它
（`lib/component-page.ts` 按它判命中，`theme/DocItem` 按它组装入参）。

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
- `value`：那把键写一串非空文本才算命中，命中的那串文本交进组件（`myPage: '/some/path'`）。
*/
export type ComponentPageMatch = 'boolean' | 'value'

/** 清单里的一条：一把 frontmatter 键 + 判法 + 给那个组件的静态入参。 */
export type ComponentPageEntry = {
  /** md frontmatter 里那条键名。 */
  key: string
  /** 这条键怎么算命中；缺它按 `boolean`（见 `src/config.mts` 的归一化）。 */
  match: ComponentPageMatch
  /**
  配置里 `props` 那一格，原样并交进组件的入参（与下面那三份同名字典时以这一格为准）。
  它随生成模块进产物，所以要能写成 JS 字面量：站点配置里就是普通对象与字符串，不放函数。
  */
  props?: Record<string, unknown>
}

/** 命中那把键写下的值：`boolean` 恒为 `true`，`value` 是那串非空文本。 */
export type ComponentPageValue = true | string

/**
交进那个组件的入参：本层给的三份 + 配置里 `props` 那格并进来的其余各份。

`content` 这一格是这一层「替换 `DocItem`」的出口而不是入口：整页交出去之后，那个组件想留
正文就自己渲染它（命中时本层不再往下走，下层那份 `DocItem` 给不了它）。
*/
export type ComponentPageProps = {
  /** 这一页的 frontmatter 整份，组件据此读它自己的其余键。 */
  frontMatter: Record<string, unknown>
  /** 命中的那把键写下的值。 */
  value: ComponentPageValue
  /** 这一页的正文组件（MDX 编译出来的那一份）。 */
  content?: unknown
  /** 配置里 `props` 那一格并进来的静态入参。 */
  [prop: string]: unknown
}
