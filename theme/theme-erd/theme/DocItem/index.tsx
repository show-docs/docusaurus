import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { ErrorBoundary } from '../../components/error-boundary.tsx';
import { HackStyle } from '../../components/hack-style.tsx';
import type { DbmlModel } from '../../src/types.mts';

const ErdChart = lazy(() =>
  import('../../components/erd-chart.tsx').then(({ ErdChart: View }) => ({
    default: View,
  })),
);

// dbml-loader 在编译结果里写了 `export const dbml_json`，Docusaurus 把它和其他命名导出
// 一起挂到 MDX 组件上，所以两者在同一个值上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  dbml_json?: DbmlModel;
};

type Props = { content?: MDXContent };

export default function DocItemErd(props: Props): ReactNode {
  const { content } = props;

  // 关系图是 DocItem 的**前一个兄弟节点**，不塞进 `content`：正文原样交给下层 DocItem，
  // 页面结构（标题、目录、面包屑、页脚导航）都不受影响。
  if (!content?.dbml_json) {
    return <DocItem {...props} />;
  }

  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <ErdChart data={content.dbml_json} />
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
