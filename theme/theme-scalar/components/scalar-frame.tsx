import './scalar-frame.css';

import { useOuterFrameSync } from '@show-docs/theme-frame-kit';

import { useRef } from 'react';
import type { ReactNode } from 'react';

import { useColorMode } from '@docusaurus/theme-common';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

import {
  SCALAR_FRAME_CLASS,
  scalarFrameMessages,
  scalarViewSrc,
} from './scalar-frame-sync.ts';

type Props = { specUrl: string };

/**
命中 `scalar:` 的那一页里本层放的东西：一个 iframe，指向本包自己那条插件路由。

Scalar 的代码、它那份 335K 的样式表、它写的 localStorage 与它自己的路由，都在框里那份文档内；
这一份文档（站点的文档页）只多出一个框和一条尺寸规则。口径与理由见包 README 的
「渲染放在独立页面，文档页只嵌它」一节（`theme-redoc`、`theme-stoplight` 是同一个形状）。

地址栏里 `#orders/createorder` 那一段仍然属于**外层**这一页（发给别人的是外层地址），
框内外层靠 postMessage 双向对齐它。这一格连同亮暗模式的递送都住在共享层
（`useOuterFrameSync`，见 `@show-docs/theme-frame-kit`），本层只给三样东西：这个框的 ref、
本层那份消息约定、以及站点当前的亮暗。两侧的推法为什么各来一次、以及踩过的那次丢消息，
记在共享层 `useOuterFrameSync` 那份注释与包 README 的「深链」一节。
*/
export function ScalarFrame(props: Props): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const { colorMode } = useColorMode();
  const frameRef = useRef<HTMLIFrameElement>(null);

  // 服务端与客户端算出的必须是同一个字符串：`src` 只由 baseUrl 与 frontmatter 里那个地址决定。
  // 深链那一段与亮暗模式都不塞进地址（两件都靠消息送），否则整页加载一条深链时
  // SSR 那份 html 与客户端第一次渲染就对不上。
  const src = scalarViewSrc(siteConfig.baseUrl, props.specUrl);

  useOuterFrameSync({ colorMode, frameRef, messages: scalarFrameMessages });

  return (
    <iframe
      ref={frameRef}
      className={SCALAR_FRAME_CLASS}
      src={src}
      title="API 文档"
    />
  );
}
