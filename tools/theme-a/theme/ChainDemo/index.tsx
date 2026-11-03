import PrevChainDemo from '@theme-prev/ChainDemo';

import type { ReactNode } from 'react';

/**
theme-a：ChainDemo 这根链的第一层（`@theme-prev/ChainDemo` = 下面那层 theme-base）。

这条链只会在**解析器包那份示例页**出现：站点里只有
`packages/plugin-prev-layer-resolver/docs/chain-demo.md` 渲染了 `ChainDemo`，
别的页面根本不渲染这个组件，所以「只在那一页验证」不需要按页面 id 分支的代码。
*/
export default function ChainDemoA(): ReactNode {
  return (
    <div className="layer-a" data-theme-wrapper="theme-a">
      <span className="mark">[A]</span>
      <PrevChainDemo />
    </div>
  );
}
