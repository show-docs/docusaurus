import DocItem from '@theme-prev/DocItem';

import type { ComponentType, ReactNode } from 'react';

import { useLocation } from '@docusaurus/router';
import { pages } from '@generated/theme-component-page/registry';

import {
  componentPageWarnings,
  matchComponentPage,
  warnComponentPages,
} from '../../lib/component-page.ts';

// 这一页的正文组件：MDX 编译出来的那一份，frontmatter 挂在它身上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: Record<string, unknown>;
};

type Props = { content?: MDXContent };

/**
本层是「这一页整页交给一个组件」这一族里**唯一判这份清单**的那一格：清单从配置期生成的那份注册表里读
（判法、顺序与告警那三条规则都住在 `lib/component-page.ts`，这里不抄第二份），命中就把
**整个 `DocItem`** 换成清单里那个组件；落空那份告警只在开发模式交给 `warnComponentPages()` 打。

代价与那族 iframe 框同一格：官方 `DocItem` 里的东西一并不要 —— `DocProvider`、
`DocItem/Metadata`（页面标题与描述因此退回站点名）、`DocItem/Layout`（面包屑、正文外壳、
翻页、右侧目录）。剩下的是文档页那层壳：navbar、footer，还有包着正文的那个 `.container`。

组件拿到的入参是三份本页数据（`frontMatter` / `value` / `content`）并上配置里 `props` 那一格；
`content` 只在它想自己留正文时用得上 —— 命中时本层不再往下走，下层那份 `DocItem` 给不了它。
*/
export default function DocItemComponentPage(props: Props): ReactNode {
  const frontMatter = props.content?.frontMatter;
  const { pathname } = useLocation();

  if (process.env.NODE_ENV === 'development') {
    warnComponentPages(componentPageWarnings(pages, frontMatter, pathname));
  }

  for (const page of pages) {
    const value = matchComponentPage(page, frontMatter);

    if (value === undefined) {
      continue;
    }

    // 这一页没写 frontmatter 时交一个空对象：组件那一侧不必每处判 undefined。
    return (
      <page.Component
        {...(page.props ?? {})}
        content={props.content}
        frontMatter={frontMatter ?? {}}
        value={value}
      />
    );
  }

  // 没命中时本层等于透明：整个交回下层实现。
  return <DocItem {...props} />;
}
