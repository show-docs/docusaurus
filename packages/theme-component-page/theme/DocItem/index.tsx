import DocItem from '@theme-init/DocItem';

import type { ComponentType, ReactNode } from 'react';

import { useLocation } from '@docusaurus/router';
import { rules } from '@generated/theme-component-page/registry';

import { ComponentFrame } from '../../components/component-frame.tsx';
import {
  componentPageProps,
  componentPageWarnings,
  matchComponentPage,
  warnComponentPages,
  type ComponentPageFacts,
} from '../../lib/component-page.ts';

// 这一页的正文组件：MDX 编译出来的那一份。frontmatter 与 loader 追加的命名导出都挂在它身上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  frontMatter?: Record<string, unknown>;
};

type Props = { content?: MDXContent };

/**
本层是「这一页整页交给一个组件」这一族里**唯一判这张表**的那一格：表从配置期生成的那份注册表里读
（两处来源、判法、顺序与告警那几条规则都住在 `lib/component-page.ts`，这里不抄第二份），命中就把
**整个 `DocItem`** 换成表里那个组件；落空那份告警只在开发模式交给 `warnComponentPages()` 打。

判据看这一页的两份事实：frontmatter，以及 loader 往 MDX 模块里追加的命名导出（都在 `content`
身上）。两处都没有同名的键就是没命中，本层等于透明。

命中之后有**两种落点**，由那条规则的 `render` 定，本层自己实现，不引别的包：

- `page`：在当前这份文档里渲染那个组件。它拿得到父页的上下文与这一页的 MDX `content`，
  需要正文、`useDoc` 或父页 DOM 的组件只能走这一格。
- `iframe`：换成 `components/component-frame` 那一格同源框，组件在框内那份独立文档里渲染。
  父文档因此**一行都不 import** 那个组件（渲染器的几 MB 只在框里那份文档下载），也不传
  `content` 与父页上下文。

代价与那族 iframe 框同一格：官方 `DocItem` 里的东西一并不要 —— `DocProvider`、
`DocItem/Metadata`（页面标题与描述因此退回站点名）、`DocItem/Layout`（面包屑、正文外壳、
翻页、右侧目录）。剩下的是文档页那层壳：navbar、footer，还有包着正文的那个 `.container`。
需要正文的组件不该被这样命中：让它自己显式组合 `@theme-init/DocItem`（规则改写成 `render: 'page'`
并在组件里挂正文），不要在这里留第二条通道。

组件拿到的入参是本页那几份数据并上规则里 `props` 那一格，**同名的键以本页那几份为准**（次序在
`componentPageProps()` / `frameInitPayload()` 里各定过一次，语义同一条）；`content` 只有 `page`
那一侧送得进去。
*/
export default function DocItemComponentPage(props: Props): ReactNode {
  const facts: ComponentPageFacts = {
    frontMatter: props.content?.frontMatter,
    content: props.content,
  };
  const { pathname } = useLocation();

  if (process.env.NODE_ENV === 'development') {
    warnComponentPages(componentPageWarnings(rules, facts, pathname));
  }

  for (const rule of rules) {
    const value = matchComponentPage(rule, facts);

    if (value === undefined) {
      continue;
    }

    // 表按 `render` 分成两份模块，`page` 那一侧才带 `Component`；走到这一格说明这条命中了。
    if (rule.render === 'iframe') {
      return (
        <ComponentFrame
          componentId={rule.component}
          frontMatter={facts.frontMatter}
          props={rule.props}
          value={value}
        />
      );
    }

    // 入参的组装次序住在 lib 里，这一格只负责挂上去。
    return (
      <rule.Component
        {...componentPageProps(rule, value, facts.frontMatter, facts.content)}
      />
    );
  }

  // 没命中时本层等于透明：整个交回下层实现。
  return <DocItem {...props} />;
}
