import PrevChainDemo from '@theme-prev/ChainDemo';

import type { ReactNode } from 'react';

/**
站点层 swizzle：链在「最后一层插件主题」之上，所以这条链在这里是四层。

`src/theme` 是层栈最外层的哨兵槽位，因此 `@theme-prev/ChainDemo` = theme-c；
theme-c 里的 `@theme-prev` 又指向 theme-b…… 链路由此成立。

这一层挂在 `ChainDemo` 上，是因为整条链只需要一处真渲染：解析器包那份示例页
（`packages/plugin-prev-layer-resolver/docs/chain-demo.md`）在正文里渲染 `ChainDemo`，
套在它外面的标记肉眼可见（`[SITE] [C] [B] [A]`，四层各有一道彩色虚线），
浏览器与构建产物两头都取得到证据（`pnpm verify:chain` / `pnpm test:e2e`）。

`ChainDemo` 在仓库里有五层提供（链底 theme-base、theme-a/b/c 与站点自己），所以这一格必须走链：
`@theme-init` 只会拿到最初那一份、把中间几层一起跳过。`@theme-original` 在这一格虽然也等价
（它只在最外层安全，语义由 test/layers.test.mts 钉住），但真有多层覆盖的组件按规则书统一用
`@theme-prev`。
*/
export default function SiteChainDemo(): ReactNode {
  return (
    <div className="layer-site" data-site-wrapper="src/theme">
      <span className="mark">[SITE]</span>
      <PrevChainDemo />
    </div>
  );
}
