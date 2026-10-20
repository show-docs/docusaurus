/**
外层文档页里那一个通用框：三条 API 层与 `iframe:` 那一层共用这一份渲染，
形状由注册表里那一条决定（`lib/api-frame-registry.ts`）。

- `internal`：`src` 由 `frameViewSrc()` 拼（spec 地址编码进去、`hash` 不放进去，SSR 与
  客户端算出同一个字符串），深链那一段与亮暗模式靠 `useOuterFrameSync` 送 —— 两侧的推法、
  踩过的坑与理由都在 `lib/frame-sync.ts` 那份注释与 `docs/iframe-protocol.md`。
- `external`：框里是**外部站点**，跨源，没有那条通道；地址算法三步（`/` 打头补 origin、
  `?path=` 再解一层、整体 decode 一次）是 `iframe:` 那层原来的口径，整段搬到这里。

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
import { frameViewSrc, type FrameColorMode } from '../lib/frame-messages.ts';
import { useOuterFrameSync } from '../lib/frame-sync.ts';

type Props = { entry: ApiFrameEntry; value: string };

/** `iframe:` 那层原来的地址算法（只有浏览器端才会走完三步）。 */
function externalURL({ src, search }: { src: string; search: string }): string {
  const path = new URLSearchParams(search).get('path') || '';

  const io = src.startsWith('/')
    ? new URL(src, window.location.origin).href
    : src;

  const url = path ? new URL(path, io).href : io;

  return decodeURIComponent(url);
}

export function ApiFrame({ entry, value }: Props): ReactNode {
  return entry.kind === 'external' ? (
    <ExternalFrame frameClass={entry.frameClass} src={value} />
  ) : (
    <InternalFrame entry={entry} specUrl={value} />
  );
}

function InternalFrame({
  entry,
  specUrl,
}: {
  entry: Extract<ApiFrameEntry, { kind: 'internal' }>;
  specUrl: string;
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
    <iframe
      ref={frameRef}
      className={entry.frameClass}
      src={src}
      title={entry.title}
    />
  );
}

function ExternalFrame({
  frameClass,
  src,
}: {
  frameClass: string;
  src: string;
}): ReactNode {
  const { search } = useLocation();
  const isBrowser = useIsBrowser();

  // 服务端渲染阶段拿不到 `window`，那时 url 就是 frontmatter 里那个原值。
  const url = useMemo(
    () => (isBrowser ? externalURL({ src, search }) : src),
    [isBrowser, search, src],
  );

  return <iframe className={frameClass} src={url} title="其他文档" />;
}
