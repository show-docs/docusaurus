import DocItemContent from '@theme-init/DocItem/Content';

import type { ReactNode } from 'react';

import { ImageViewer } from '../../../components/viewer.tsx';

type Props = Record<string, unknown>;

export default function DocItemContentViewer(props: Props): ReactNode {
  // 这一层不看 frontmatter，也不换掉正文：正文原样交给官方那一份，只在它落位之后
  // 把里面的图片接进查看器。命不中（正文没有图片）时这一层等于透明。
  // 用 `@theme-init` 而不是 `@theme-prev`：仓库里只有本层提供这个组件，没有要串的链。
  return (
    <ImageViewer>
      <DocItemContent {...props} />
    </ImageViewer>
  );
}
