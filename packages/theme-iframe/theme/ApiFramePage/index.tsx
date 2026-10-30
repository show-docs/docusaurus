import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import DocItem from '@theme-init/DocItem';

import type { ComponentType, ReactNode } from 'react';

import { useLocation } from '@docusaurus/router';

import { ApiFrame } from '../../components/api-frame.tsx';
import {
  framePageUrl,
  framePageWarnings,
  warnFramePages,
} from '../../lib/api-frame-entries.ts';
import { apiFrameByNamespace } from '../../lib/api-frame-registry.ts';

// 这一页的正文组件：MDX 编译出来的那一份。
type MDXContent = ComponentType<Record<string, unknown>>;

// `namespace` 是那条层交页时带进来的（`src/component-pages.mts` 的 `props`，三条 API 层由
// 工厂代交同一形状），component-page 原样并进这里；`content` 那格收窄回正文组件，非命中时原样交给下层。
type Props = ComponentPageProps & {
  content?: MDXContent;
  namespace?: unknown;
};

/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那一页（四条框页都挂在它上面）：
component-page 判中某条层交出的键之后挂上它，所以这里**不再判「装了哪几层、谁先判」** —— 赢的
是哪一条由入参 `namespace` 指明，注册表那条条目给出 route、类名、spec 参数名。

框里渲染什么：
- 内层（三条 API 层）的键只说明「用这一层渲染」，地址另从 spec 键（`oas3:` / `aas3:`）取；
  没给地址就交回普通文档页（开发模式由 `warnFramePages()` 说一句），不渲染一个空框。
- 外层（`iframe:`）命中值就是框要渲染的那份页面。

交回普通文档页用的是官方那一份（`@theme-init/DocItem`）：component-page 命中时不再往下
走，所以这一页的正文只能从这里拿；`content` 就是那份 MDX 正文组件。
*/
export default function ApiFramePage(props: Props): ReactNode {
  const { namespace, frontMatter, value, content } = props;
  const { pathname } = useLocation();
  const entry =
    typeof namespace === 'string' ? apiFrameByNamespace(namespace) : undefined;

  // 认不出这一页该归哪条层（站点覆写这个组件时没透传 `namespace`，或生成的清单被手改过）：
  // 不猜，交回普通文档页。
  if (entry === undefined) {
    return <DocItem content={content} />;
  }

  if (process.env.NODE_ENV === 'development') {
    warnFramePages(framePageWarnings(entry, frontMatter, pathname));
  }

  const url = framePageUrl(entry, frontMatter, value);

  return url === undefined ? (
    <DocItem content={content} />
  ) : (
    <ApiFrame entry={entry} value={url} frontMatterTitle={frontMatter.title} />
  );
}
