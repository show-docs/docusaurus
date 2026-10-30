import {
  warnComponentPages,
  type ComponentPageProps,
} from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import {
  useFrameHashReporter,
  useFrameMode,
} from '@show-docs/docusaurus-theme-component-page/lib/frame-sync.tsx';
import { LazyView } from '@show-docs/docusaurus-theme-component-page/lib/frame-view.tsx';

import type { ReactNode } from 'react';

import Admonition from '@theme/Admonition';

import { applyRedocColorMode } from '../../components/redoc-color-mode.ts';
import {
  redocSpecUrl,
  redocSpecWarnings,
} from '../../components/redoc-spec.ts';

/**
Redoc 那份渲染接线按需装载：`redoc` 那份 2 MB 上下（连 `styled-components`）只跟着这一条
`import()` 走，不在框内那条路由的静态图里 —— 那是它不进「整站必下载」那一串的唯一办法。
写法固定在模块级，引用每次渲染都相同，所以那条取法实际只会发一次。
*/
const loadRedocUI = () =>
  import('../../components/redoc-ui.tsx').then(({ RedocUI }) => ({
    default: RedocUI,
  }));

/**
Redoc 在框内那一份文档里渲染的那一格：那条规则按登记名 `redoc` 把它挂上（见 `src/index.mts`），
所以这里**不再判「这一页归谁」** —— component-page 已经判完，把这一页的 `frontMatter` 与命中的
值送进来了。

本层只剩 Redoc 自己的四件事：

- **渲染哪份文档**：`oas3:` / `aas3:` 里第一把非空的地址（判定先后归本层，机制层不认识这两把键）；
  没给地址就在框里摆一条看得见的说明，不挂一个空渲染器。
- **亮暗落法**：写成这一份文档 `<html>` 上的 `data-redoc-mode` 属性，Redoc 那套暗色表挂在
  这条属性上（`components/redoc-color-mode.ts`）。
- **渲染接线按需取**：几 MB 依赖只在真渲染时下载（`LazyView`，取不到与取到之前那句话也在那一份里）。
- **路由**：这一份文档里只有 Redoc 一个消费者，`#` 段归它用。外层 → 框内那一步改的是
  `location.hash`，`HashRouter` 认这一格；框内 → 外层这一句由 `redoc-ui.tsx` 里那层
  `LocationMirror` 来说（它换接口走的是 `history.pushState`，不触发 `hashchange`）。

**这里不判服务端**：那份数据要靠握手才送进来，所以这一格在 SSR 与客户端首帧都还没被渲染
（框内那份文档在那之前显示的是它自己那句占位），渲染器在没有 DOM 的地方一跑就炸那种事不会发生。
*/
export default function RedocView(props: ComponentPageProps): ReactNode {
  const { frontMatter } = props;

  useFrameMode(applyRedocColorMode);
  const onRouteChange = useFrameHashReporter();

  if (process.env.NODE_ENV === 'development') {
    warnComponentPages(redocSpecWarnings(frontMatter));
  }

  const url = redocSpecUrl(frontMatter, window.location.origin);

  if (url === undefined) {
    return (
      <Admonition title="这一页没给 Redoc 要渲染的文档" type="info">
        这一格由 `redoc: true` 接管，但框里没有可渲染的地址：把那份 OpenAPI
        文档写在 `oas3:` 或 `aas3:` 上（相对写法按本站的根算）。
      </Admonition>
    );
  }

  return (
    <LazyView
      loadView={loadRedocUI}
      pending="正在装载 Redoc…"
      viewProps={{ onRouteChange, url }}
    />
  );
}
