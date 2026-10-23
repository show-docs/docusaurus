import type { FrontMatterRule } from './types.mts';

/**
规则表：一条规则 = 「管哪些文件」+「管到的文件补哪几格」。

这里是本仓的缺省那份，**只有一条**：给每一页的 `docs` 补上 `testing: true`。
不给任何主题层补默认值：`markmap` / `diff` / `iframe` / `oas3` / … 那几把键由各层自己
`??` 兜，判的也是它们自己的写法 —— 往别人家的键上补值，等于替人家的判定改口径，
还会让「这一页到底写了什么」与产物里的 frontmatter 对不上。
*/
export const defaultRules: FrontMatterRule[] = [
  {
    name: 'testing',
    match: '.md',
    frontMatter: {
      // 只补不覆盖：页面自己写了 `testing`（`true` 或 `false`）就原样留着，
      // 规则只负责把「没表态」的那些补成开了。
      testing: true,
    },
  },
];
