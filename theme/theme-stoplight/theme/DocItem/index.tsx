import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

// md 的 frontmatter 里 `oas3` 的值：OpenAPI 文档的地址
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: { oas3?: string };
};

type Props = { content?: MDXContent };

const Stoplight = lazy(() =>
  import('../../components/stoplight-ui.tsx').then(({ StoplightUI }) => ({
    default: StoplightUI,
  })),
);

export default function DocItemStoplight(props: Props): ReactNode {
  const url = props.content?.frontMatter?.oas3;

  // 命中时本层**不包下层 DocItem**（与 theme-iframe、theme-redoc 同一落点），整页换成 Stoplight；
  // `lazy` 出来的组件必须在 Suspense 里，否则渲染到它就直接抛
  return url ? (
    <Suspense fallback={null}>
      <Stoplight url={url} />
    </Suspense>
  ) : (
    <DocItem {...props} />
  );
}
