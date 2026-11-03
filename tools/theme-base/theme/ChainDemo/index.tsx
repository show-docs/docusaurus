import type { ReactNode } from 'react';

/**
链底那份组件本体：整条链最终包住的就是它。

它只有一处真渲染 —— 解析器包那份示例页（`packages/plugin-prev-layer-resolver/docs/chain-demo.md`）
在正文里渲染 `@theme/ChainDemo`。别的页面不渲染它，所以「这条链只在那一页出现」不需要按页面 id
分支的代码。

组件本体刻意最小：不接 props、不引别的东西 —— 它要证明的只是「四层包裹都还在，落到本体上」。
*/
export default function ChainDemo(): ReactNode {
  return <span className="chain-base">链底那份组件</span>;
}
