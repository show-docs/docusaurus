import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

// md 的 frontmatter 里 `scalar` 的值：要渲染的那份 API 文档的地址
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: { scalar?: string };
};

type Props = { content?: MDXContent };

const ScalarFrame = lazy(() =>
  import('../../components/scalar-frame.tsx').then(({ ScalarFrame: View }) => ({
    default: View,
  })),
);

export default function DocItemScalar(props: Props): ReactNode {
  const url = props.content?.frontMatter?.scalar;

  // 命中时本层**不包下层 DocItem**（与 theme-redoc、theme-stoplight、theme-iframe 同一取舍），
  // 整页换成那一个 iframe；`lazy` 出来的组件必须在 Suspense 里，否则渲染到它就直接抛。
  //
  // Scalar 不在这一页里渲染：它跑在 iframe 里面那份文档中（地址由
  // `components/scalar-frame.tsx` 拼，页面本身是 `theme/ScalarPage`，见包 README 的
  // 「渲染放在独立页面」一节）。所以这一格挂的是框，不是 `ScalarUI`。
  return url ? (
    <Suspense fallback={null}>
      <ScalarFrame specUrl={url} />
    </Suspense>
  ) : (
    <DocItem {...props} />
  );
}
