import Content from '@theme-prev/DocItem/Content';

import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';

import { useDoc } from '@docusaurus/plugin-content-docs/client';

const FramePage = lazy(() =>
  import('../../../components/iframe.tsx').then(({ FramePage: View }) => ({
    default: View,
  })),
);

/**
命中 frontmatter 的 `iframe: <地址>` 时，把**正文区**换成那个页面。

落点是 `DocItem/Content` 而不是 `DocItem`：官方 `DocItem` 渲染的是
`<DocItemLayout><MDXComponent /></DocItemLayout>`，那个 `MDXComponent` 就是它的
`props.content` —— **`props.children` 它一个字都不读**。把 frame 当 children 塞给
`DocItem` 是静默丢掉（实测过：构建产物里一个 iframe 元素都没有，页面显示的还是本文正文）。
`DocItem/Content` 是官方 Layout 留给正文的那一格，换掉它才是「正文换成外部页面」，
面包屑、页脚、翻页这些文档外壳照旧由下层给。
*/
export default function DocItemContentIframe({
  children,
}: {
  children?: ReactNode;
}): ReactNode {
  // 这个键是本层的契约：作者手写的 frontmatter 里有没有它说不准，命中与否由 `src` 自己判
  // （官方 `DocFrontMatter` 只列了它自己认识的那些键，所以按本层的形状读它）。
  const { frontMatter } = useDoc();
  const src = (frontMatter as { iframe?: string }).iframe;

  // 没命中时本层等于透明：原样把正文交回下层实现（`children` 是 Layout 给的 MDX 内容）。
  return src ? (
    <Suspense fallback={null}>
      <FramePage src={src} />
    </Suspense>
  ) : (
    <Content>{children}</Content>
  );
}
