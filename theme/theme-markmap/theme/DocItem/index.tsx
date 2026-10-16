import { lazy, Suspense } from 'react';

import type { ComponentType, ReactNode } from 'react';

import DocItem from '@theme-prev/DocItem';

import { ErrorBoundary } from '../../components/error-boundary.tsx';

import type { MarkmapData } from '../../src/types.mts';
import { HackStyle } from '../../components/hack-style.tsx';

const MindChart = lazy(() =>
  import('../../components/markmap.tsx').then(({ MindChart: View }) => ({
    default: View,
  })),
);

// md 的编译结果：default 导出是 MDX 组件，`markmap` 等命名导出由 ComponentCreator
// 复制成它的静态属性，所以两者在同一个值上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  markmap?: MarkmapData;
};

type Props = { content?: MDXContent };

export default function DocItemMarkmap(props: Props): ReactNode {
  const { content } = props;

  // post loader 给命中 frontmatter 的 md 追加 `export const markmap`，
  // Docusaurus 把它和其他模块导出一起挂到 MDX 组件上。
  // 导图是 DocItem 的**前一个兄弟节点**，不塞进 `content`：正文原样交给下层 DocItem，
  // 页面结构（标题、目录、面包屑、页脚导航）都不受影响。
  if (!content?.markmap) {
    return <DocItem {...props} />;
  }

  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <MindChart data={content.markmap} />
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
