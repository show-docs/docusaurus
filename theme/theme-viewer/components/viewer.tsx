import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { useLocation } from '@docusaurus/router';

// `viewerjs` 那份包类型把「类」和「同名命名空间」声明在全局，所以这里直接写
// `Viewer.Options` / `Viewer`，只在真要 new 的那一步从动态 import 里拿构造器。
const largeButton = { show: 1, size: 'large' } as const;

/** viewerjs 的选项；`0` 是「这颗按钮不摆」。旋转、翻转与播放不收进来。 */
const options: Viewer.Options = {
  fullscreen: false,
  transition: false,
  toolbar: {
    zoomIn: largeButton,
    zoomOut: largeButton,
    oneToOne: largeButton,
    reset: largeButton,
    prev: largeButton,
    next: largeButton,
    play: 0,
    rotateLeft: 0,
    rotateRight: 0,
    flipHorizontal: 0,
    flipVertical: 0,
  },
};

interface Props {
  children?: ReactNode;
}

/**
把正文里的图片接进 viewerjs：它自己不放任何 DOM，只在正文落位后挂上查看器。
*/
export function ImageViewer({ children }: Props): ReactNode {
  const { pathname } = useLocation();

  useEffect(() => {
    // 判据是正文里真的有 `<img>`：没有图片的页面一份 viewerjs 都不该下载。
    const article = document.querySelector(
      '.container .theme-doc-markdown.markdown',
    );

    if (!article || article.querySelectorAll('img').length === 0) {
      return undefined;
    }

    let viewer: Viewer | undefined;
    let stopped = false;

    // 末尾的 `catch` 就是这条 promise 的落点，不会被当成没人管的 reject。
    import('viewerjs')
      .then(({ default: ViewerClass }) => {
        // 换页时清理那一趟可能跑在这份 import 回来之前，那时正文已经换新的一页了。
        if (stopped) {
          return;
        }

        viewer = new ViewerClass(article as HTMLElement, options);
      })
      .catch((error: unknown) => {
        console.warn('[theme-viewer] 图片查看器初始化失败：', error);
      });

    return () => {
      stopped = true;
      viewer?.destroy();
    };
  }, [pathname]);

  return children;
}
