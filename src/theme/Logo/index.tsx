import type { ReactNode } from 'react';
import PrevLogo from '@theme-prev/Logo';

/**
站点层 swizzle：链在「最后一层插件主题」之上。

`src/theme` 是层栈最外层的哨兵槽位，所以 `@theme-prev/Logo` = theme-c；
theme-c 里的 `@theme-prev` 又指向 theme-b…… 三层链路由此成立。

站点层用官方 `@theme-original` 也一样成立（它本来就只在最外层安全），
但统一用 `@theme-prev` 可以让每层写法完全一致。
*/
export default function SiteLogo(props: Record<string, unknown>): ReactNode {
  return (
    <div data-site-wrapper="src/theme-logo">
      <span className="mark">[SITE]</span>
      <PrevLogo {...props} />
    </div>
  );
}
