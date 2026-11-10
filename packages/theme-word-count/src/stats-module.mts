import type { WordCountStats } from '../types/word-count.ts';

/**
`@generated/theme-word-count/stats` 那份文件的内容。

这份东西本来就在 Node 侧算好，只差一步交给浏览器侧：打包器只认模块，不认「配置期一个变量」，
所以走生成模块那一条老路（与 `theme-component-page` 那两份生成表同一个办法）—— 写进 Docusaurus
的生成目录，由 `@generated` 那条别名读回来。

**里面只有数，没有日期也没有 git 状态**：那两样每次构建都不同，会把「同一份内容根两次构建出
同一份产物」这条本该看得见的性质变成永远看不见，而它对本包的用处只是「数是多少」。

`JSON.stringify` 的写法（两格缩进）：写得出去的就是纯数据（串 / 数 / 布尔 / 普通对象 / 数组），
本包交出去的这几格全是数与串，所以这一格不必像机制层那样先在配置期校验一遍形状。
*/
export function renderStatsModule(stats: WordCountStats): string {
  return `// 这份文件由 @show-docs/docusaurus-theme-word-count 在配置期生成，别手改。
// 要改的是各 docs 实例加载到的那批文件；改完重启站点（\`docusaurus start\` 会重跑那一步）。
// 形状在本包 types/word-count.d.ts，读它的是本包 theme/WordCountPage。
export const stats = ${JSON.stringify(stats, undefined, 2)};
`;
}
