import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { ErrorBoundary } from '../../components/error-boundary.tsx';
import { HackStyle } from '../../components/hack-style.tsx';

// 渲染那一半数据的形状（`md-markmap-loader` 在编译结果里追加的 `export const markmap`）。
// 产地与逐格说明见 `src/types.mts`。
// 不从 `src/types.mts` 引：`theme/` 是本层静态的那一半，每份文档页都要求值到这一句，而那份源码
// 连着 `markmap-lib` 的类型 —— `import type` 只免掉求值、免不掉打包器把它当成一条依赖。
// 导图自己的代码因此只跟着 `markmap.tsx` 那条动态 import 走。
type MarkmapData = never;

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
