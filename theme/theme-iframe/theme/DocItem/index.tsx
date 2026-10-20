import DocItem from '@theme-prev/DocItem';

import type { ComponentType, ReactNode } from 'react';

import { ApiFrame } from '../../components/api-frame.tsx';
import { apiFrameEntriesOrdered } from '../../lib/api-frame-registry.ts';

// 命中与否只看 frontmatter 里那几条已注册的键（值就是框要渲染的地址），
// 键的形状由注册表给出，本层不再逐包声明。
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: Record<string, unknown>;
};

type Props = { content?: MDXContent };

/**
本层是「整页交给一个框」这一族的**唯一外层套壳**：按注册表的顺序判 frontmatter
（`scalar` → `redoc` → `oas3` → `iframe`，与原来四条层各占一环、越靠外先判的语义同序），
命中就把**整个 `DocItem`** 换成通用框 —— 与收拢前四条层同一落点、同一取舍。

代价是官方 `DocItem` 里的东西一并不要：`DocProvider`、`DocItem/Metadata`（页面标题与
描述因此退回站点名）、`DocItem/Layout`（面包屑、正文外壳、翻页、右侧目录）。剩下的是
文档页那层壳：navbar、footer，还有包着 iframe 的那个 `.container`。

三条 API 层的包因此**不再有 `theme/DocItem`**：它们交出命名空间，外层由这里承接，
框里那条页面仍由各自的入口注册（`lib/api-frame-theme.mts` 那份工厂）。
*/
export default function DocItemFrame(props: Props): ReactNode {
  const frontMatter = props.content?.frontMatter;

  for (const entry of apiFrameEntriesOrdered()) {
    const value = frontMatter?.[entry.frontmatterKey];
    if (typeof value === 'string' && value !== '') {
      return <ApiFrame entry={entry} value={value} />;
    }
  }

  // 没命中时本层等于透明：整个交回下层实现。
  return <DocItem {...props} />;
}
