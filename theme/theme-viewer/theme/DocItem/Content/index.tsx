import DocItemContent from '@theme-prev/DocItem/Content';

import type { ReactNode } from 'react';

import { ImageViewer } from '../../../components/viewer.tsx';

type Props = Record<string, unknown>;

export default function DocItemContentViewer(props: Props): ReactNode {
  // 这一层不看 frontmatter，也不换掉正文：正文原样交给下面的实现，只在它落位之后
  // 把里面的图片接进查看器。命不中（正文没有图片）时这一层等于透明。
  return (
    <ImageViewer>
      <DocItemContent {...props} />
    </ImageViewer>
  );
}
