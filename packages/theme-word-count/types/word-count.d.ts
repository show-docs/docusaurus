/**
「全站字数」那一份数据的形状：配置期算出来并铺进生成模块（`../src/stats-module.mts`），
浏览器期由 `../theme/WordCount` 读（那一句 `import` 的类型来自本包
`word-count-specifiers.d.ts`）。

形状为什么单独占一份 `.d.ts`，而不是跟算法一起留在 `src/`：`src/` 要过 `tsc`（`rootDir` 是
`src/`），相对路径引到 `src/` 里的源码会让构建停在 TS6059；而 `theme/` 那一半由站点的 babel
编译、根本不进 `tsc`。两侧共读这一份声明，同一个形状就不各写一遍。口径与理由同
`packages/theme-component-page/types/component-page.d.ts`。
*/

/** 一页（或一格）里的计数：两类词各多少个，以及它们的和。 */
export type WordCount = {
  /** CJK 那一族：一个字算一个。哪些码位算这一族见 `../src/count.mts`。 */
  cjk: number
  /** 其余那一族：一段连续的字母数字算一个（含带撇号与连字符的词）。 */
  latin: number
  /** 上面两个的和：页面上显示的那一个数。 */
  words: number
}

/** 分组的那一格：一份 docs 实例的一个版本。 */
export type WordCountGroup = WordCount & {
  /**
  docs 实例的 id（站点 `plugins` 里那一份实例的 `id`；缺省那一份是 `default`）。
  页面侧按同一个 id 从分组里挑自己那一根：`theme/WordCount` 读的路由上下文 `plugin.id`
  就是它（两处都是 `plugin.options.id`）。
  */
  instance: string
  /** 版本的显示名：写了 `label` 用 `label`，没写用版本名（本站两份实例都是 `current`）。 */
  version: string
  /** 这一格里被数到的页数。 */
  pages: number
}

/** 指令能带的四种范围：本页 / 本文件夹（含子目录）/ 所在内容根 / 全站。 */
export type WordCountScope = 'page' | 'folder' | 'instance' | 'site'

/** 生成模块里交出的那一份：全站那一格，加上按实例与版本分的其余各格与每页明细。 */
export type WordCountStats = WordCount & {
  /** 全站页数（各格 `pages` 之和）。 */
  pages: number
  /**
  按「实例 + 版本」分的那几格，顺序是清单里第一次见到那一格的顺序。
  `theme/WordCount` 用路由上下文的 `plugin.id` 挑自己那一份（只到实例，到不了版本）。
  */
  groups: WordCountGroup[]
  /**
  每页的字数，键与清单里的 `source` 相同（`@site/…`）。浏览器侧用
  `useDoc().metadata.source` 直接查：本页取那一条，本文件夹按它的目录前缀在表内求和。
  */
  docs: Record<string, WordCount>
}
