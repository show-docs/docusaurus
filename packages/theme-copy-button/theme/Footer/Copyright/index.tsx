import Copyright from '@theme-init/Footer/Copyright';
import { Toaster } from 'sonner';

import type { ReactNode } from 'react';

import { CopyButton } from '../../../components/copy-button.tsx';

type Props = Record<string, unknown>;

export default function CopyrightWrapper(props: Props): ReactNode {
  // 这一层不改页脚那一格的内容：文案照旧交给官方那一份渲染，只在它前面多摆一颗按钮。
  // 提示条的挂载点整站只需要一个，跟着按钮放在这里（`sonner` 把它渲染在页面末尾）。
  // 用 `@theme-init` 而不是 `@theme-prev`：仓库里只有本层提供这个组件，没有要串的链。
  return (
    <>
      <CopyButton />
      <Toaster position="bottom-right" richColors />
      <Copyright {...props} />
    </>
  );
}
