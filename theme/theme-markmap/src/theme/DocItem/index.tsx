import { lazy, Suspense } from 'react';

import type { ComponentType, ReactNode } from 'react';

import DocItem from '@theme-prev/DocItem';

import { ErrorBoundary } from '../../components/error-boundary.jsx';

import type { MarkmapData } from '../../types.mjs';

const MindChart = lazy(() =>
  import('../../components/markmap.jsx').then(({ MindChart: View }) => ({
    default: View,
  })),
);

// md 的编译结果：default 导出是 MDX 组件，`markmap` 等命名导出由 ComponentCreator
// 复制成它的静态属性，所以两者在同一个值上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  markmap?: MarkmapData;
};

type Props = { content?: MDXContent };

// 导图在上、原文在下，合成一个「正文组件」交回下层 DocItem。模块的其余导出
// （metadata / frontMatter / assets …）并到包装件上：下层 DocItem 与 DocProvider
// 都从 `content` 上读它们，抄的就是 ComponentCreator 挂静态属性的同一套做法。
function withMarkmapAbove(
  Content: MDXContent,
  markmap: MarkmapData,
): MDXContent {
  function MarkmapAbove(props: Record<string, unknown>): ReactNode {
    return (
      <>
        <ErrorBoundary>
          <Suspense fallback={null}>
            <MindChart data={markmap} />
          </Suspense>
        </ErrorBoundary>
        <Content {...props} />
      </>
    );
  }

  return Object.assign(MarkmapAbove, Content);
}

export default function DocItemMarkmap(props: Props): ReactNode {
  const { content } = props;

  // post loader 给命中 frontmatter 的 md 追加 `export const markmap`，
  // Docusaurus 把它和其他模块导出一起挂到 MDX 组件上
  return content?.markmap ? (
    <DocItem {...props} content={withMarkmapAbove(content, content.markmap)} />
  ) : (
    <DocItem {...props} />
  );
}
