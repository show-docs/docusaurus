/**
`@theme/Admonition` 的单测替身 —— 由 `vitest.config.mts` 的 `resolve.alias` 换上。

为什么非要一份替身：`@theme/*` 是 Docusaurus 在 webpack 构建期按层栈解析出来的 specifier，
磁盘上没有这个包，vitest 直着引会挂在解析上。被测的那几格是「共享外壳自己怎么渲染」
（兜底退回哪一条提示、正文那一格的结构），不是官方 `Admonition` 长什么样 ——
所以这一份只按官方那份的形状落地：`title` 当标题、`type` 进类名、children 进正文。
*/

import type { ReactNode } from 'react';

export interface AdmonitionProps {
  /** 提示的标题，官方那份渲染成 `.admonitionHeading_…` 那一行。 */
  title?: ReactNode;
  /** 提示的类型（`danger` 等），官方那份进外层类名。 */
  type?: string;
  children?: ReactNode;
}

// eslint-disable-next-line import-x/no-default-export -- 被这一格换掉的 `@theme/Admonition` 就是默认导出
export default function Admonition({
  title,
  type,
  children,
}: AdmonitionProps): ReactNode {
  return (
    <div className={`alert alert--${type ?? 'info'}`}>
      {title === undefined || title === null ? null : (
        <div className="alert__title">{title}</div>
      )}
      <div className="alert__body">{children}</div>
    </div>
  );
}
