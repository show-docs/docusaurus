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

import { applyStoplightColorMode } from '../../components/stoplight-color-mode.ts';
import {
  stoplightSpecUrl,
  stoplightSpecWarnings,
} from '../../components/stoplight-spec.ts';

// 外层那一格版式（框定高、容器让位、页脚收掉）整条在 component-page 的
// `components/component-frame.css` 里，凡 `render: iframe` 的规则共用；本包不再有只属于
// 自己的那条外层规则，所以这里不 import 任何外层 CSS（本包的 CSS 由 `stoplight-ui.tsx` 带走）。

/**
Elements 那份渲染接线按需装载：`@stoplight/elements` 那份 1.8 MB 上下只跟着这一条 `import()` 走
—— 前提是本文件的静态 import 一个都碰不到它，所以亮暗那一格从
`components/stoplight-color-mode.ts` 拿、spec 那两把键从 `components/stoplight-spec.ts` 拿。
写法固定在模块级，引用每次渲染都相同，所以那条取法实际只会发一次。
*/
const loadStoplightUI = () =>
  import('../../components/stoplight-ui.tsx').then(({ StoplightUI }) => ({
    default: StoplightUI,
  }));

/**
Elements 在框内那一份文档里渲染的那一格：那条规则按登记名 `stoplight` 把它挂上（见 `src/index.mts`），
所以这里**不再判「这一页归谁」** —— component-page 已经判完，把这一页的 `frontMatter` 与命中的
值送进来了。

本层只剩 Elements 自己的四件事：

- **渲染哪份文档**：`oas3:` / `aas3:` 里第一把非空的地址（判定先后归本层，机制层不认识这两把键）；
  没给地址就在框里摆一条看得见的说明，不挂一个空渲染器。
- **亮暗落法**：写成这一份文档 `<html>` 上的 `data-theme` 属性 —— Elements 那份暗色表本来就挂在
  `[data-theme=…]` 上，所以这一格不需要任何运行期的改写。
- **渲染接线按需取**：几 MB 依赖只在真渲染时下载（`LazyView`，取不到与取到之前那句话也在那一份里）。
- **路由**：这一份文档里只有 Elements 一个消费者，`#` 段归它用。外层 → 框内那一步改的是
  `location.hash`，`HashRouter` 认这一格；框内 → 外层这一句由 `stoplight-ui.tsx` 里那层
  `LocationMirror` 来说（它换接口走的是 `history.pushState`，不触发 `hashchange`）。

**这里不判服务端**：那份数据要靠握手才送进来，所以这一格在 SSR 与客户端首帧都还没被渲染
（框内那份文档在那之前显示的是它自己那句占位），渲染器在没有 DOM 的地方一跑就炸那种事不会发生。
*/
export default function StoplightView(props: ComponentPageProps): ReactNode {
  const { frontMatter } = props;

  useFrameMode(applyStoplightColorMode);
  const onRouteChange = useFrameHashReporter();

  if (process.env.NODE_ENV === 'development') {
    warnComponentPages(stoplightSpecWarnings(frontMatter));
  }

  const url = stoplightSpecUrl(frontMatter, window.location.origin);

  if (url === undefined) {
    return (
      <Admonition title="这一页没给 Stoplight 要渲染的文档" type="info">
        这一格由 `stoplight: true` 接管，但框里没有可渲染的地址：把那份 OpenAPI
        文档写在 `oas3:` 或 `aas3:` 上（相对写法按本站的根算）。
      </Admonition>
    );
  }

  return (
    <LazyView
      loadView={loadStoplightUI}
      pending="正在装载 Elements…"
      viewProps={{ onRouteChange, url }}
    />
  );
}
