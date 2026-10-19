import { lazy, Suspense } from 'react';

import type { ComponentType, ReactNode } from 'react';

import DocItem from '@theme-prev/DocItem';

// md 的 frontmatter 里 `redoc` 的值：API 文档的地址
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: { redoc?: string };
};

type Props = { content?: MDXContent };

const Redoc = lazy(() =>
  import('../../components/redoc-ui.tsx').then(({ RedocUI }) => ({
    default: RedocUI,
  })),
);

export default function DocItemRedoc(props: Props): ReactNode {
  const url = props.content?.frontMatter?.redoc;

  // 命中时本层**不包下层 DocItem**（与 theme-stoplight 同一取舍），整页换成 Redoc；
  // `lazy` 出来的组件必须在 Suspense 里，否则渲染到它就直接抛。
  // 这一页的地址不进 frontmatter：Redoc 的路由走 hash（见 `components/redoc-ui.tsx`），
  // 不需要知道自己在哪一页。
  return url ? (
    <Suspense fallback={null}>
      <Redoc url={url} />
    </Suspense>
  ) : (
    <DocItem {...props} />
  );
}
