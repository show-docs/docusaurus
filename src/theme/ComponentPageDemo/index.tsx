import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import type { ReactNode } from 'react';

import Admonition from '@theme/Admonition';

/**
站点自己那份「整页替换」组件：本仓用它演示 `theme-component-page` 这一层能干什么。

它是站点层（`src/theme`），于是 `@theme/ComponentPageDemo` 那条说明符走的是层栈最外层那一格 ——
换掉这个组件不必改站点配置，在 `src/theme/ComponentPageDemo` 放另一份就行，
这正是本层推荐把 `component` 写成 `@theme/X` 的理由。

入参由那一层交进来：`value` 是命中的那把键写下的值，`frontMatter` 是这一页的整份 frontmatter，
`content` 是这一页的正文组件（这一层不再往下走，想留正文得由它自己渲染）。
配置里 `props` 那一格的 `label` 也在这里，与上面三份同名字典。
*/
export default function ComponentPageDemo({
  frontMatter,
  label,
  value,
}: ComponentPageProps): ReactNode {
  return (
    <div className="container padding-top--md padding-bottom--lg">
      <h1>{String(label)}</h1>
      <p>
        这一页的正文区不是文档页那层壳：没有面包屑、没有右侧目录、没有翻页 ——
        整个 <code>DocItem</code> 交给了站点配置里点名的这个组件。
      </p>
      <Admonition type="info" title="组件拿到的入参">
        <ul>
          <li>
            命中的键写下的值：<code>{String(value)}</code>
          </li>
          <li>
            这一页的标题（从 <code>frontMatter</code> 里读）：
            <code>{String(frontMatter.title)}</code>
          </li>
        </ul>
      </Admonition>
    </div>
  );
}
