import type { ReactNode } from 'react';

/**
theme-a 覆盖 DocItem/Footer；站点 src/theme 会用 @theme-original 链在它之上
*/
export default function DocItemFooterA(): ReactNode {
  return (
    <div data-theme-wrapper="theme-a-footer">
      <span className="mark">[A-footer]</span>
    </div>
  );
}
