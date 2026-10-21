import { createApiFrameView } from '@show-docs/docusaurus-theme-iframe/lib/index.ts';

// 外层那一格版式（框定高、容器让位、页脚收掉）整条在 theme-iframe 的
// `components/api-frame.css` 里，四条层共用；本包不再有只属于自己的那条外层规则，
// 所以这里不 import 任何外层 CSS（本包的 CSS 由下面那份 `stoplight-ui.tsx` 带进 bundle）。

import {
  COLOR_MODE_ATTRIBUTE,
  StoplightUI,
} from '../../components/stoplight-ui.tsx';

/**
Elements 这一层的框内页面（这一页整体的形状、以及它为什么不套 `Layout/Provider`，
都记在 theme-iframe 那份工厂的头上）。这里只交 Elements 自己的两格差异：

- **亮暗落法**：写成这一份文档 `<html>` 上的 `data-theme` 属性 —— Elements 那份暗色表本来就
  挂在 `[data-theme=…]` 上，所以这一格不需要任何运行期的改写（`stoplight-ui.tsx` 外面那层说明）。
- **路由**：这一份文档里只有 Elements 一个消费者，`#` 段归它用（`stoplight-ui.tsx` 外面那层
  `HashRouter`）。框里点一条接口走的是 `history.pushState`，它**不触发** `hashchange`，
  所以「报回外层」这一句只能由 `StoplightUI` 自己来说 —— 与 `theme-redoc` 实测到的同一格。
*/
const StoplightPage = createApiFrameView({
  modeAttribute: COLOR_MODE_ATTRIBUTE,
  namespace: '@show-docs/docusaurus-theme-stoplight',
  view: StoplightUI,
});

export default StoplightPage;
