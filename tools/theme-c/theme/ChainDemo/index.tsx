import PrevChainDemo from '@theme-prev/ChainDemo';

import type { ReactNode } from 'react';

/**
theme-c：ChainDemo 这根链的第三层（声明顺序最后 → 赢得 `@theme/ChainDemo`）。

`@theme-prev/ChainDemo` 解析为 theme-b 的实现，链路至此三层。这一层是插件主题里的赢家，
解析器包那份示例页从这一层进；站点 `src/theme` 还用自己那层包在它上面，见 src/theme/README.md。
*/
export default function ChainDemoC(): ReactNode {
  return (
    <div className="layer-c" data-theme-wrapper="theme-c">
      <span className="mark">[C]</span>
      <PrevChainDemo />
    </div>
  );
}
