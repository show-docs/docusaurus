import { lazy, Suspense } from 'react';

import type { ComponentType, ReactNode } from 'react';

import DocItem from '@theme-prev/DocItem';

// md 的 frontmatter 里 `iframe` 的值：目标地址，写法同文档站里给的链接
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: { iframe?: string };
};

type Props = { content?: MDXContent };

const FramePage = lazy(() =>
  import('../../components/iframe.tsx').then(({ FramePage: View }) => ({
    default: View,
  })),
);

export default function DocItemIframe(props: Props): ReactNode {
  const src = props.content?.frontMatter?.iframe;

  return src ? (
    <DocItem {...props} shellPadding={false}>
      <Suspense fallback={null}>
        <FramePage src={src} />
      </Suspense>
    </DocItem>
  ) : (
    <DocItem {...props} />
  );
}
