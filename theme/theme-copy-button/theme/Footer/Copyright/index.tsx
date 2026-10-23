import Copyright from '@theme-prev/Footer/Copyright';
import { Toaster } from 'sonner';

import type { ReactNode } from 'react';

import { CopyButton } from '../../../components/copy-button.tsx';

type Props = Record<string, unknown>;

export default function CopyrightWrapper(props: Props): ReactNode {
  // 这一层不改页脚那一格的内容：文案照旧交给下面那一层渲染，只在它前面多摆一颗按钮。
  // 提示条的挂载点整站只需要一个，跟着按钮放在这里（`sonner` 把它渲染在页面末尾）。
  return (
    <>
      <CopyButton />
      <Toaster position="bottom-right" richColors />
      <Copyright {...props} />
    </>
  );
}
