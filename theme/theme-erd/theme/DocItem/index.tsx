import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { ErrorBoundary } from '../../components/error-boundary.tsx';
import { HackStyle } from '../../components/hack-style.tsx';

// 渲染那一半数据的形状（`dbml-loader` 在编译期用 `@dbml/core` 解析 `.dbml` 的结果）。
// 产地与逐格说明见 `src/types.mts`。
// 不从 `src/types.mts` 引：`theme/` 是本层静态的那一半，每份文档页都要求值到这一句，而那份源码
// 连着 `@dbml/core` 的类型 —— `import type` 只免掉求值、免不掉打包器把它当成一条依赖。
// 关系图自己的代码因此只跟着 `erd-chart.tsx` 那条动态 import 走。
type DbmlModel = never;

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
