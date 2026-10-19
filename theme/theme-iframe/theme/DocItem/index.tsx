import DocItem from '@theme-prev/DocItem';

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

// md 的 frontmatter 里 `iframe` 的值：要嵌进这一页的地址
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: { iframe?: string };
};

type Props = { content?: MDXContent };

const FramePage = lazy(() =>
  import('../../components/iframe.tsx').then(({ FramePage: View }) => ({
    default: View,
  })),
);

/**
命中 frontmatter 的 `iframe: <地址>` 时，这一层把**整个 `DocItem`** 换成那个页面 ——
与 `theme-stoplight`、`theme-redoc` 同一落点、同一取舍。

代价是官方 `DocItem` 里的东西一并不要：`DocProvider`、`DocItem/Metadata`（页面标题与
描述因此退回站点名）、`DocItem/Layout`（面包屑、正文外壳、翻页、右侧目录）。剩下的是
文档页那层壳：navbar、footer，还有包着 iframe 的那个 `.container`。
*/
export default function DocItemIframe(props: Props): ReactNode {
  // 这个键是本层的契约：作者手写的 frontmatter 里有没有它说不准（官方 `DocFrontMatter`
  // 只列了它自己认识的那些键），所以按本层的形状读它，命中与否由 `src` 自己判。
  const src = props.content?.frontMatter?.iframe;

  // 没命中时本层等于透明：整个交回下层实现。
  return src ? (
    <Suspense fallback={null}>
      <FramePage src={src} />
    </Suspense>
  ) : (
    <DocItem {...props} />
  );
}
