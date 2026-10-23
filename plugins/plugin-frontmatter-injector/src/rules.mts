import type { FrontMatterRule } from './types.mts';

/**
规则表：一条规则 = 「管哪些文件」+「管到的文件补哪几格」。

这里是本仓的五个命名空间。它们在前几层里只当**判据**读（`props.content.frontMatter.markmap`
这类），从来没有谁把缺省值补进去 —— 缺省靠各层自己 `??` 兜。把它们写成规则表，等于把
「哪一页属于哪个命名空间」这件事收在一处：补的是默认值，不是开关（`markmap: true` 发起的
那一页，注入的那一格是 `enabled: true` 而不是把 `true` 改掉）。
*/
export const defaultRules: FrontMatterRule[] = [
  {
    name: 'markmap',
    match: '.md',
    frontMatter: {
      // 没写 `markmap` 的一页补一个 `enabled: false`：这一格的下游只看 `enabled`，
      // 补上它，「这一页能不能画图」就只有一个判据。
      markmap: () => ({ enabled: false }),
    },
  },
  {
    name: 'diff',
    match: '.md',
    frontMatter: {
      // `diff` 的三种写法（`true` / 路径 / `{old, new}`）都算「开了」，没写才算没开
      diff: false,
    },
  },
  {
    name: 'iframe',
    match: '.md',
    frontMatter: {
      // 这一格的下游读的是 `.src`，而它的上游三种写法（`true` / URL / `{ src }`）都在各层
      // 自己兜。补个空壳等于塞进去一个没有地址的框，那层只会渲染出一片空白 ——
      // 「空白是因为规则给了坏值」比「空白是因为没写」难查得多。所以这里明确不表态。
      iframe: () => undefined,
    },
  },
];
