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

import { applyScalarColorMode } from '../../components/scalar-color-mode.ts';
import {
  scalarSpecUrl,
  scalarSpecWarnings,
} from '../../components/scalar-spec.ts';

/**
Scalar 那份渲染接线按需装载：`@scalar/api-reference`（连 Vue）与它那份样式表只跟着这一条
`import()` 走，不在框内那条路由的静态图里 —— 那是它不进「整站必下载」那一串的唯一办法。
写法固定在模块级，引用每次渲染都相同，所以那条取法实际只会发一次。
*/
const loadScalarUI = () =>
  import('../../components/scalar-ui.tsx').then(({ ScalarUI }) => ({
    default: ScalarUI,
  }));

/**
Scalar 在框内那一份文档里渲染的那一格：那条规则按登记名 `scalar` 把它挂上（见 `src/index.mts`），
所以这里**不再判「这一页归谁」** —— component-page 已经判完，把这一页的 `frontMatter` 与命中的
值送进来了。

本层只剩 Scalar 自己的四件事：

- **渲染哪份文档**：`oas3:` / `aas3:` 里第一把非空的地址（判定先后归本层，机制层不认识这两把键）；
  没给地址就在框里摆一条看得见的说明，不挂一个空渲染器。
- **亮暗落法**：Scalar 不按属性判亮暗，它换的是 `<body>` 上互斥的两个类名，所以交给
  `useFrameMode` 的是 `applyScalarColorMode`（`components/scalar-color-mode.ts`）。
- **渲染接线按需取**：几 MB 依赖只在真渲染时下载（`LazyView`，取不到与取到之前那句话也在那一份里）。
- **路由**：这一份文档里只有 Scalar 一个消费者，`#` 段归它用。外层 → 框内那一步改的是
  `location.hash`，而 Scalar 只听 `popstate`，那一格由 `scalar-ui.tsx` 转过去；框内 → 外层
  这一句由 `onSidebarClick` 报（它换接口走的是 `history.pushState`，不触发 `hashchange`）。

**这里不判服务端**：那份数据要靠握手才送进来，所以这一格在 SSR 与客户端首帧都还没被渲染
（框内那份文档在那之前显示的是它自己那句占位），渲染器在没有 DOM 的地方一跑就炸那种事不会发生。
*/
export default function ScalarView(props: ComponentPageProps): ReactNode {
  const { frontMatter } = props;

  useFrameMode(applyScalarColorMode);
  const onRouteChange = useFrameHashReporter();

  if (process.env.NODE_ENV === 'development') {
    warnComponentPages(scalarSpecWarnings(frontMatter));
  }

  const url = scalarSpecUrl(frontMatter, window.location.origin);

  if (url === undefined) {
    return (
      <Admonition title="这一页没给 Scalar 要渲染的文档" type="info">
        这一格由 `scalar: true` 接管，但框里没有可渲染的地址：把那份 OpenAPI /
        AsyncAPI 文档写在 `oas3:` 或 `aas3:` 上（相对写法按本站的根算）。
      </Admonition>
    );
  }

  return (
    <LazyView
      loadView={loadScalarUI}
      pending="正在装载 Scalar…"
      viewProps={{ onRouteChange, url }}
    />
  );
}
