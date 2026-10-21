import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { ErrorBoundary } from '../../components/error-boundary.tsx';
import { HackStyle } from '../../components/hack-style.tsx';
import type { DiffData } from '../../src/types.mts';

const GitDiffView = lazy(() =>
  import('../../components/diff-view.tsx').then(({ GitDiffView: View }) => ({
    default: View,
  })),
);

// md 的编译结果：default 导出是 MDX 组件，`diff` 等命名导出由 ComponentCreator
// 复制成它的静态属性，所以两者在同一个值上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  diff?: DiffData;
};

type Props = { content?: MDXContent };

export default function DocItemDiff(props: Props): ReactNode {
  const { content } = props;

  // post loader 给命中 frontmatter 的 md 追加 `export const diff`，
  // Docusaurus 把它和其他模块导出一起挂到 MDX 组件上。
  // 差异视图是 DocItem 的**前一个兄弟节点**，不塞进 `content`：正文原样交给下层 DocItem，
  // 页面结构（标题、目录、面包屑、页脚导航）都不受影响。
  if (!content?.diff) {
    return <DocItem {...props} />;
  }

  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <GitDiffView data={content.diff} />
        </Suspense>
      </ErrorBoundary>
      <hr />
      {HackStyle}
      <div className="container padding-top--md padding-bottom--lg fake">
        <DocItem {...props} />
      </div>
    </>
  );
}
