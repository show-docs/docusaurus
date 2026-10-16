import { lazy, Suspense } from 'react';

import PropTypes from 'prop-types';

import DocItem from '@theme-prev/DocItem';

import { ErrorBoundary } from '../../components/error-boundary.jsx';

const MindChart = lazy(() =>
  import('../../components/markmap.jsx').then(({ MindChart: View }) => ({
    default: View,
  })),
);

// 导图在上、原文在下，合成一个「正文组件」交回下层 DocItem。模块的其余导出
// （metadata / frontMatter / assets …）并到包装件上：下层 DocItem 与 DocProvider
// 都从 `content` 上读它们，抄的就是 ComponentCreator 挂静态属性的同一套做法。
function withMarkmapAbove(Content, markmap) {
  function MarkmapAbove(props) {
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

export default function DocItemMarkmap(props) {
  const { content } = props;

  // post loader 给命中 frontmatter 的 md 追加 `export const markmap`，
  // Docusaurus 把它和其他模块导出一起挂到 MDX 组件上
  return content?.markmap ? (
    <DocItem {...props} content={withMarkmapAbove(content, content.markmap)} />
  ) : (
    <DocItem {...props} />
  );
}

DocItemMarkmap.propTypes = {
  // MDX 模块的 default 导出：`markmap` / `metadata` / `frontMatter` 是 ComponentCreator
  // 事后挂上的静态属性，propTypes 表达不出「组件 + 这些形状」，只能按 elementType 收
  content: PropTypes.elementType,
};
