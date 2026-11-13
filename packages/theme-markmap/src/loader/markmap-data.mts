import { parse } from '@markmap/parse';

import type { MarkmapData } from '../types.mts';

// 把 markdown 源码转成导图数据。解析器自己认 frontmatter（含 `markmap` 选项），内置
// gfm / frontmatter / highlight / references；链接的新标签页由渲染器负责，这里不改任何
// 渲染规则。
export function buildMarkmapData(source: string): MarkmapData {
  const { root, frontmatter } = parse(source);

  return { root, frontmatter };
}
