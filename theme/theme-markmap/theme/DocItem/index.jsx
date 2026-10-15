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

  // 两种来源同一份契约：md 由 post loader 追加 `export const markmap`，
  // `.markmap` 文件的默认导出则是 `{ markmap: 数据 }`
  const { markmap } = content ?? {};

  if (!markmap) {
    return <DocItem {...props} />;
  }

  // md 的默认导出是 MDX 组件，正文能接在导图下面
  if (typeof content === 'function') {
    return <DocItem {...props} content={withMarkmapAbove(content, markmap)} />;
  }

  // `.markmap` 文件的默认导出就是数据本身，没有正文可接，只能整页替换
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <DocItem {...props} shellTitle={content.name}>
          <MindChart data={markmap} />
        </DocItem>
      </Suspense>
    </ErrorBoundary>
  );
}

DocItemMarkmap.propTypes = {
  content: PropTypes.oneOfType([
    PropTypes.elementType,
    PropTypes.shape({
      // eslint-disable-next-line react/forbid-prop-types
      markmap: PropTypes.objectOf(PropTypes.any),
      name: PropTypes.string,
    }),
  ]),
};
