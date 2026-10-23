import { createApiFrameView } from '@show-docs/docusaurus-theme-iframe/lib/index.ts';

// 外层那一格版式（框定高、容器让位、页脚收掉）整条在 theme-iframe 的
// `components/api-frame.css` 里，四条层共用；本包不再有只属于自己的那条外层规则，
// 所以这里不 import 任何外层 CSS（本包的 CSS 由 `stoplight-ui.tsx` 带走）。

import { COLOR_MODE_ATTRIBUTE } from '../../components/stoplight-ui.tsx';

/**
Elements 这一层的框内页面（这一页整体的形状、以及它为什么不套 `Layout/Provider`，
都记在 theme-iframe 那份工厂的头上）。这里只交 Elements 自己的三格差异：

- **亮暗落法**：写成这一份文档 `<html>` 上的 `data-theme` 属性 —— Elements 那份暗色表本来就
  挂在 `[data-theme=…]` 上，所以这一格不需要任何运行期的改写（`stoplight-ui.tsx` 外面那层说明）。
- **渲染接线按需取**：交给工厂的是 `loadView` 而不是 `StoplightUI` 本身，静态 import 因此只剩上面
  那条常量（`stoplight-ui.tsx` 那份模块还带着它，Elements 于是仍与这份入口并进同一个 chunk ——
  实测记在包 `docs/internals.md` 的「首屏不下载渲染器」，要真拆开得把常量摘出去）。
  理由与代价见框内工厂那段文件头。
- **路由**：这一份文档里只有 Elements 一个消费者，`#` 段归它用（`stoplight-ui.tsx` 外面那层
  `HashRouter`）。框里点一条接口走的是 `history.pushState`，它**不触发** `hashchange`，
  所以「报回外层」这一句只能由 `StoplightUI` 自己来说 —— 与 `theme-redoc` 实测到的同一格。
*/
const StoplightPage = createApiFrameView({
  modeAttribute: COLOR_MODE_ATTRIBUTE,
  namespace: '@show-docs/docusaurus-theme-stoplight',
  loadView: () =>
    import('../../components/stoplight-ui.tsx').then(
      ({ StoplightUI }) => StoplightUI,
    ),
});

export default StoplightPage;
