import { lazy, Suspense } from 'react';

import type { ComponentType, ReactNode } from 'react';

import DocItem from '@theme-prev/DocItem';

// md 的 frontmatter 里 `redoc` 的值：API 文档的地址
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: { redoc?: string };
  metadata?: { permalink?: string };
};

type Props = { content?: MDXContent };

const Redoc = lazy(() =>
  import('../../components/redoc-ui.tsx').then(({ RedocUI }) => ({
    default: RedocUI,
  })),
);

export default function DocItemRedoc(props: Props): ReactNode {
  const url = props.content?.frontMatter?.redoc;
  // Redoc 自带一个 BrowserRouter，它按 `basePath` 判「当前地址属于哪一格」。
  // 默认 `/` 在这里不成立：页面在 `/redoc-demo`，Redoc 找不到匹配的路由，
  // 于是它渲染**自己那份 404**（页面看着一切正常，正文区却写着 No page at this address，
  // 控制台一个字都不报）。所以把这一页的地址交给它当 base。
  const basePath = props.content?.metadata?.permalink;

  // 命中时本层**不包下层 DocItem**（与 theme-stoplight 同一取舍），整页换成 Redoc；
  // `lazy` 出来的组件必须在 Suspense 里，否则渲染到它就直接抛
  return url ? (
    <Suspense fallback={null}>
      <Redoc basePath={basePath} url={url} />
    </Suspense>
  ) : (
    <DocItem {...props} />
  );
}
