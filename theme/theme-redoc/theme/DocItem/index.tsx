import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

// md 的 frontmatter 里 `redoc` 的值：要渲染的那份 API 文档的地址
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: { redoc?: string };
};

type Props = { content?: MDXContent };

const RedocFrame = lazy(() =>
  import('../../components/redoc-frame.tsx').then(({ RedocFrame: View }) => ({
    default: View,
  })),
);

export default function DocItemRedoc(props: Props): ReactNode {
  const url = props.content?.frontMatter?.redoc;

  // 命中时本层**不包下层 DocItem**（与 theme-stoplight、theme-iframe 同一取舍），整页换成
  // 那一个 iframe；`lazy` 出来的组件必须在 Suspense 里，否则渲染到它就直接抛。
  //
  // Redoc 不再在这一页里渲染：它跑在 iframe 里面那份文档中（地址由
  // `components/redoc-frame.tsx` 拼，页面本身是 `theme/RedocPage`，见包 README 的
  // 「渲染放在独立页面」一节）。所以这一格挂的是框，不是 `RedocUI`。
  return url ? (
    <Suspense fallback={null}>
      <RedocFrame specUrl={url} />
    </Suspense>
  ) : (
    <DocItem {...props} />
  );
}
