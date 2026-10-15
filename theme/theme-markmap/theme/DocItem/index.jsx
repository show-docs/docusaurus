import { lazy, Suspense } from 'react';

import PropTypes from 'prop-types';

import DocItem from '@theme-prev/DocItem';

import { ErrorBoundary } from '../../components/error-boundary.jsx';

const MindChart = lazy(() =>
  import('../../components/markmap.jsx').then(({ MindChart: View }) => ({
    default: View,
  })),
);

export default function DocItemMarkmap(props) {
  const { content } = props;

  // 两种来源同一份契约：`.markmap` 文件的默认导出是 `{ markmap: 数据 }`，
  // md 则由 post loader 追加 `export const markmap`，Docusaurus 把它挂到组件上
  const { markmap } = content ?? {};

  return markmap ? (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <DocItem
          {...props}
          shellTitle={content.metadata?.title ?? content.name}
        >
          <MindChart data={markmap} />
        </DocItem>
      </Suspense>
    </ErrorBoundary>
  ) : (
    <DocItem {...props} />
  );
}

DocItemMarkmap.propTypes = {
  content: PropTypes.shape({
    // eslint-disable-next-line react/forbid-prop-types
    markmap: PropTypes.objectOf(PropTypes.any),
    metadata: PropTypes.shape({ title: PropTypes.string }),
    name: PropTypes.string,
  }),
};
