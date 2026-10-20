import {
  apiFrameByNamespace,
  apiFrameMessages,
  createRouteReporter,
  specUrlFromSearch,
  useInnerFrameSync,
  type ApiFrameEntryInternal,
} from '@show-docs/docusaurus-theme-iframe/lib/index.ts';

// 外层版式（`.stoplight-frame` 定高、容器让位、页脚收掉）归本包声明，规则留在
// `stoplight-frame.css`；外层套壳收拢到 theme-iframe 后，这一句 import 就是它进全站
// bundle 的唯一通道（收拢前由已删的 `stoplight-frame.tsx` 带进来）。
import './stoplight-frame.css';

import type { ReactNode } from 'react';

import useIsBrowser from '@docusaurus/useIsBrowser';

import { COLOR_MODE_ATTRIBUTE, StoplightUI } from './stoplight-ui.tsx';

// 外层套壳（判键、那个 `<iframe>`、送 `route`/`mode` 的那一侧）住在 theme-iframe：
// 形状取自注册表里本包那一条，见包的 `docs/iframe-protocol.md`。
const STOPLIGHT_NAMESPACE = '@show-docs/docusaurus-theme-stoplight';

const entry = apiFrameByNamespace(STOPLIGHT_NAMESPACE);
if (entry === undefined || entry.kind !== 'internal') {
  throw new Error(`注册表里缺 ${STOPLIGHT_NAMESPACE}`);
}
// 守卫处把形状收窄成一份别名：函数作用域里再看 `entry` 就不会带着 `undefined` 与
// `external` 那两种可能了。
const stoplightEntry: ApiFrameEntryInternal = entry;

/** 框内 → 外层那一条：报的是这一份文档地址里 `#` 那一段。模块级造一份，每次渲染不换引用。 */
const reportRouteToParent = createRouteReporter(
  apiFrameMessages(STOPLIGHT_NAMESPACE),
);

/**
框内那一页的正文：按地址里的 `src` 取文档、渲染 Elements，并把外层送过来的两件事落到自己身上。

- **加载**：spec 地址从这一份文档自己的查询参数里取（外层 iframe 的 `src` 由 theme-iframe
  那个通用框按注册表拼），命中不了就什么都不渲染。
- **路由**：这一份文档里只有 Elements 一个消费者，`#` 段归它用（`stoplight-ui.tsx` 外面那层
  `HashRouter`）。两个方向各走一条路，因为它们要绕过的坑不一样：
  - 外层 → 框内：改 `location.hash`。这一步会触发 `hashchange`，React Router 把它当成
    一次浏览器导航收下（POP），Elements 于是换到那条接口，整份文档不重新加载。整页加载一条
    深链时那一段也是这么进来的：框里起来先向外层要一次。
  - 框内 → 外层：**听路由自己报**（`StoplightUI` 的 `onRouteChange`，见 `stoplight-ui.tsx` 里
    `LocationMirror` 那段注释）。框里点一条接口走的是 `history.pushState`，它**不触发**
    `hashchange`，监听那个事件收不到。
- **亮暗模式**：外层把它当前那一格送进来，这里写到自己的 `<html>` 上；Elements 那份暗色表
  本来就挂在 `[data-theme=…]` 上，所以这一格不需要任何运行期的改写（见 `COLOR_MODE_ATTRIBUTE`）。

收到、报出、以及那句「起来了，把你要的那两格给我」都住在共享层（`useInnerFrameSync`）；
本层给的只有属性名 `COLOR_MODE_ATTRIBUTE`。
*/
export function StoplightView(): ReactNode {
  const isBrowser = useIsBrowser();

  useInnerFrameSync({
    messages: apiFrameMessages(STOPLIGHT_NAMESPACE),
    modeAttribute: COLOR_MODE_ATTRIBUTE,
  });

  if (!isBrowser) {
    return null;
  }

  const url = specUrlFromSearch(
    window.location.search,
    window.location.origin,
    stoplightEntry.specParam,
  );

  // `/stoplight-view` 是条公开地址，别人直接打开它、`src` 那一段缺着或写成非 http(s) 的，
  // 这一格就什么都不渲染（Elements 拿到取不到的地址会把它自己那份「文档加载失败」摆在正文区，
  // 那个观感反而更像坏了）。
  return url ? (
    <StoplightUI onRouteChange={reportRouteToParent} url={url} />
  ) : null;
}
