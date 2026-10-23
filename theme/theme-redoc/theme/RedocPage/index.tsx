import { createApiFrameView } from '@show-docs/docusaurus-theme-iframe/lib/index.ts';

import { COLOR_MODE_ATTRIBUTE } from '../../components/redoc-color-mode.ts';

/**
Redoc 这一层的框内页面（这一页整体的形状、以及它为什么不套 `Layout/Provider`，
都记在 theme-iframe 那份工厂的头上）。这里只交 Redoc 自己的两格差异：

- **亮暗落法**：写成这一份文档 `<html>` 上的 `data-redoc-mode` 属性，Redoc 那套暗色表挂在
  这条属性上（`redoc-color-mode.ts`）。
- **路由**：这一份文档里只有 Redoc 一个消费者，`#` 段归它用（`redoc-ui.tsx` 外面那层
  `HashRouter`）。框里点一条接口走的是 `history.pushState`，它**不触发** `hashchange`，
  所以「报回外层」这一句只能由 `RedocUI` 自己来说 —— 见 `redoc-ui.tsx` 里 `LocationMirror`
  那段注释。
*/
const RedocPage = createApiFrameView({
  modeAttribute: COLOR_MODE_ATTRIBUTE,
  // 渲染器按需装载：`redoc` 那份 2 MB 上下只跟着这一条 `import()` 走。
  loadView: () =>
    import('../../components/redoc-ui.tsx').then(({ RedocUI }) => ({
      default: RedocUI,
    })),
  namespace: '@show-docs/docusaurus-theme-redoc',
});

export default RedocPage;
