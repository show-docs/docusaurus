/**
外层文档页里那一个通用框：三条 API 层与 `iframe:` 那一层共用这一份渲染，
形状由注册表里那一条决定（`lib/api-frame-registry.ts`）。

- `internal`：`src` 由 `frameViewSrc()` 拼（spec 地址编码进去、`hash` 不放进去，SSR 与
  客户端算出同一个字符串），深链那一段与亮暗模式靠 `useOuterFrameSync` 送 —— 两侧的推法、
  踩过的坑与理由都在 `lib/frame-sync.ts` 那份注释与 `docs/iframe-protocol.md`。
- `external`：框里是**外部站点**，跨源，没有那条通道；地址算法那三步在
  `lib/frame-messages.ts` 的 `externalFrameURL()`（与框内取 spec 那条同形状，所以也在覆盖率红线里）。

框元素恒挂两条类名：共用的 `.api-frame`（版式那一处，四条层同一条式子）与注册表里本层那条
`frameClass`（只用来认「这一格是哪一层赢的」，各层的真差异留在自己那份 CSS 里 —— 目前只剩
stoplight 那条收页脚）。

这一格只剩 `<iframe>` 与一个 hook，没有渲染器依赖，所以 `DocItem` 直接静态 import 它，
不再走 lazy/Suspense。
*/

import './api-frame.css';

import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

import { useLocation } from '@docusaurus/router';
import { useColorMode } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useIsBrowser from '@docusaurus/useIsBrowser';

import { apiFrameMessages } from '../lib/api-frame-messages.ts';
import type { ApiFrameEntry } from '../lib/api-frame-registry.ts';
import {
  externalFrameURL,
  frameViewSrc,
  type FrameColorMode,
} from '../lib/frame-messages.ts';
import { useOuterFrameSync } from '../lib/frame-sync.ts';

type Props = {
  entry: ApiFrameEntry;
  value: string;
  /** 页面自己的 `frontMatter.title`；有它就用它当框的无障碍标题，注册表那条 `title` 只是兜底。 */
  frontMatterTitle?: unknown;
};

export function ApiFrame({ entry, value, frontMatterTitle }: Props): ReactNode {
  const frameClass = `api-frame ${entry.frameClass}`;
  const title =
    typeof frontMatterTitle === 'string' && frontMatterTitle !== ''
      ? frontMatterTitle
      : entry.title;

  return entry.kind === 'external' ? (
    <ExternalFrame frameClass={frameClass} src={value} title={title} />
  ) : (
    <InternalFrame
      entry={entry}
      frameClass={frameClass}
      specUrl={value}
      title={title}
    />
  );
}

function InternalFrame({
  entry,
  frameClass,
  specUrl,
  title,
}: {
  entry: Extract<ApiFrameEntry, { kind: 'internal' }>;
  frameClass: string;
  specUrl: string;
  title: string;
}): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const { colorMode } = useColorMode();
  const frameRef = useRef<HTMLIFrameElement>(null);

  const src = frameViewSrc({
    baseUrl: siteConfig.baseUrl,
    route: entry.route,
    specParam: entry.specParam,
    specUrl,
  });

  useOuterFrameSync({
    colorMode: colorMode as FrameColorMode,
    frameRef,
    messages: apiFrameMessages(entry.namespace),
  });

  return (
    <iframe ref={frameRef} className={frameClass} src={src} title={title} />
  );
}

function ExternalFrame({
  frameClass,
  src,
  title,
}: {
  frameClass: string;
  src: string;
  title: string;
}): ReactNode {
  const { search } = useLocation();
  const isBrowser = useIsBrowser();

  // 服务端渲染阶段拿不到 `window`，那时 url 就是 frontmatter 里那个原值。
  const url = useMemo(
    () =>
      isBrowser
        ? externalFrameURL({ src, search, origin: window.location.origin })
        : src,
    [isBrowser, search, src],
  );

  return <iframe className={frameClass} src={url} title={title} />;
}
