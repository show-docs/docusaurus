/**
「字数统计」那一份数据的形状：配置期算出来并铺进生成模块（`../src/stats-module.mts`），
浏览器期由 `../theme/WordCount` 读（那一句 `import` 的类型来自本包
`word-count-specifiers.d.ts`）。

形状为什么单独占一份 `.d.ts`，而不是跟算法一起留在 `src/`：`src/` 要过 `tsc`（`rootDir` 是
`src/`），相对路径引到 `src/` 里的源码会让构建停在 TS6059；而 `theme/` 那一半由站点的 babel
编译、根本不进 `tsc`。两侧共读这一份声明，同一个形状就不各写一遍。口径与理由同
`packages/theme-component-page/types/component-page.d.ts`。
*/

/**
一页（或一格）里的计数。每一项都是数，所以配置期与浏览器期都能按字段名求和，不必逐项抄。

**词与字符是两把尺**：`cjk` / `latin` / `words` 按「什么算一个词」数（见 `../src/count.mts`）；
`characters` 按它那种长度数（正文、行内代码、代码块里 `value.length` 的和），两种都给，
读的人自己挑。其余各项是结构：一页里的标题、代码、表格、链接各有多少个。
*/
export type WordCount = {
  /** CJK 那一族：一个字算一个。哪些码位算这一族见 `../src/count.mts`。 */
  cjk: number
  /** 其余那一族：一段连续的字母数字算一个（含带撇号与连字符的词）。 */
  latin: number
  /** 上面两个的和：页面上显示的那一个数。 */
  words: number
  /** 字符数：文字、行内代码与代码块的长度之和（代码块里的换行也算一个字符）。 */
  characters: number
  /** 数到的文档数：一份文件记 1，合计里就是页数。 */
  pages: number
  /** 其中 frontmatter 写了 `draft: true` 的文档数。 */
  drafts: number
  /** 其中带 YAML frontmatter 的文档数（明细里那一行，不是页数）。 */
  frontmatter: number
  /** 显式写了标题 id（`## 标题 {#custom-id}`）的标题数。 */
  headingIds: number
  /** 一级到六级标题各多少个。 */
  h1: number
  h2: number
  h3: number
  h4: number
  h5: number
  h6: number
  /** 代码围栏的段数（`mermaid` / `kroki` 那些图表不算代码段，见 `graphs`）。 */
  codeBlocks: number
  /** 代码围栏里的行数（不含图表源码）。 */
  codeLines: number
  /** 围栏语言是 `mermaid` 或 `kroki` 的图块数。 */
  graphs: number
  /** 图片数。 */
  images: number
  /** 表格数。 */
  tables: number
  /** 地址以 `http:` / `https:` 打头的链接数。 */
  externalLinks: number
  /** 其余链接数（相对地址、锚点、`mailto:` 等，以及引用式链接 `[x][ref]`）。 */
  internalLinks: number
  /** 引用块数。 */
  blockquotes: number
}

/** 一个词按哪一族数：`src/count.mts` 交回的就是这三格（`WordCount` 的前三行）。 */
export type WordTally = Pick<WordCount, 'cjk' | 'latin' | 'words'>

/** 分组的那一格：一份 docs 实例的一个版本。 */
export type WordCountGroup = WordCount & {
  /**
  docs 实例的 id（站点 `plugins` 里那一份实例的 `id`；缺省那一份是 `default`）。
  页面侧按同一个 id 从分组里挑自己那一根：`theme/WordCount` 读的路由上下文 `plugin.id`
  就是它（两处都是 `plugin.options.id`）。
  */
  instance: string
  /** 版本的显示名：写了 `label` 用 `label`，没写用版本名（本站两份实例各只有一个版本）。 */
  version: string
}

/** 指令能带的四种范围：本页 / 本文件夹（含子目录）/ 所在内容根 / 全站。 */
export type WordCountScope = 'page' | 'folder' | 'instance' | 'site'

/** 生成模块里交出的那一份：全站那一格，加上按实例、版本、目录分的其余各格与每页明细。 */
export type WordCountStats = WordCount & {
  /**
  按「实例 + 版本」分的那几格，顺序是清单里第一次见到那一格的顺序。
  `theme/WordCount` 用路由上下文的 `plugin.id` 挑自己那一份（只到实例，到不了版本）；
  那一份是 `instances` 里已经合好的，不在页面里再算一遍。
  */
  groups: WordCountGroup[]
  /** 按实例合好的那一格，键是 docs 实例的 id：内容根范围直接取它。 */
  instances: Record<string, WordCount>
  /**
  按目录合好的那一格，键是 `source` 去掉最后一段（`@site/docs/guide` 这种）。
  每一格**含所有子目录**；同一份目录被两个实例挂上时是两边合计。`folder` 范围直接取它，
  不在页面里做前缀求和，也不另发一张「每页属于哪个目录」的表。
  */
  folders: Record<string, WordCount>
  /**
  每页的明细，键与清单里的 `source` 相同（`@site/…`）。浏览器侧用
  `useDoc().metadata.source` 直接查。
  */
  docs: Record<string, WordCount>
}
