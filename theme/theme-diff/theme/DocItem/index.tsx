import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { ErrorBoundary } from '../../components/error-boundary.tsx';
import { HackStyle } from '../../components/hack-style.tsx';

// 差异那一半数据的形状（`md-diff-loader` 在编译结果里追加的 `export const diff`）。
// 产地与逐格说明见 `src/types.mts`。
// 不从 `src/types.mts` 引：`theme/` 是本层静态的那一半，每份文档页都要求值到这一句，
// 而 `import type` 免不掉打包器把那份源码当成一条依赖。差异视图自己的代码因此只跟着
// `diff-view.tsx` 那条动态 import 走。
type DiffData = never;

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
