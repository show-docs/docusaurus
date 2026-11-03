import PrevChainDemo from '@theme-prev/ChainDemo';

import type { ReactNode } from 'react';

/**
theme-b：ChainDemo 这根链的第二层。

`@theme-prev/ChainDemo` 解析为「紧邻下一层」= theme-a 的实现（不是 theme-b 自己），
所以这一层同样能安全包裹 —— 任意层数同理，站点层还能再往上包一层。
*/
export default function ChainDemoB(): ReactNode {
  return (
    <div className="layer-b" data-theme-wrapper="theme-b">
      <span className="mark">[B]</span>
      <PrevChainDemo />
    </div>
  );
}
