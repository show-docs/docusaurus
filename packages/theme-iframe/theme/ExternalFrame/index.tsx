import '../../components/external-frame.css';

import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useIsBrowser from '@docusaurus/useIsBrowser';

import { externalFrameURL, httpsOnHttpsSite } from '../../lib/external-url.ts';

/**
`iframe:` 那一把键命中后铺在正文里的那一格（那条规则见 `src/index.mts`，判表与挂载都在
component-page，`render` 缺省即 `page`，所以这里拿到的就是本页的 `value` 与 `frontMatter`）。

框里是**外部站点**：跨源，没有 component-page 那套同源握手，地址只能在父文档这一侧算完
（`lib/external-url.ts`）。本层因此不认识 `scalar` / `redoc` / `stoplight` 那些键，也不替谁
猜渲染器。

无障碍标题优先用页面自己的 `frontMatter.title`，缺它才落到下面那句。
*/
export default function ExternalFrame(props: ComponentPageProps): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const { search } = useLocation();
  const isBrowser = useIsBrowser();

  const { frontMatter, value } = props;
  // 那条规则写的是 `match: 'value'`，命中送进来的恒是一串非空文本；这里过一次类型收窄，
  // 是因为 `ComponentPageProps.value` 要把四种判法共用一个形状。
  const target = typeof value === 'string' ? value : '';

  const title =
    typeof frontMatter.title === 'string' && frontMatter.title !== ''
      ? frontMatter.title
      : '嵌入的页面';

  // 服务端渲染阶段拿不到 `window`：相对写法原样交给浏览器，只按站点自己的协议把绝对 `http:`
  // 升成 https（理由见 `httpsOnHttpsSite`）—— 这个框先加载、后由 React 改 `src`，构建产物里
  // 留着 http 的话，线上首屏还会先撞一次混合内容。
  const src = useMemo(
    () =>
      isBrowser
        ? externalFrameURL({
            src: target,
            search,
            origin: window.location.origin,
          })
        : httpsOnHttpsSite(target, siteConfig.url),
    [isBrowser, search, siteConfig.url, target],
  );

  return <iframe className="external-frame" src={src} title={title} />;
}
