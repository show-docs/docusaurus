import { createApiFrameView } from '@show-docs/docusaurus-theme-iframe/lib/index.ts';

import { applyScalarColorMode } from '../../components/scalar-color-mode.ts';

/**
Scalar 这一层的框内页面（这一页整体的形状、以及它为什么不套 `Layout/Provider`，
都记在 theme-iframe 那份工厂的头上）。这里只交 Scalar 自己的三格差异：

- **亮暗落法**：Scalar 不按属性判亮暗，它换的是 `<body>` 上互斥的两个类名（`dark-mode` /
  `light-mode`），所以给的是 `onMode` 而不是 `modeAttribute`（`scalar-color-mode.ts`）。
- **渲染接线按需取**：`@scalar/api-reference` 连同它那一套依赖只在真渲染这一页时才下载
  （`loadView`）：交给工厂的是取法而不是组件，那几 MB 因此跟着动态 import 分词。理由与代价见
  框内工厂那段文件头，产物数字见包 `docs/internals.md` 的「首屏不下载渲染器」。
- **路由**：这一份文档里只有 Scalar 一个消费者，`#` 段归它用。外层 → 框内那一步改的是
  `location.hash`，而 Scalar 只听 `popstate`，那一格由 `scalar-ui.tsx` 转过去；框内 → 外层
  这一句由 `onSidebarClick` 报（它换接口走的是 `history.pushState`，不触发 `hashchange`）。
*/
const ScalarPage = createApiFrameView({
  namespace: '@show-docs/docusaurus-theme-scalar',
  onMode: applyScalarColorMode,
  loadView: () =>
    import('../../components/scalar-ui.tsx').then(({ ScalarUI }) => ScalarUI),
});

export default ScalarPage;
