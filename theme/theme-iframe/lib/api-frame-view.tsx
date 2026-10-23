/**
框内那一页的正文：三条 API 层共用这一份工厂 —— 外面那个框收成 `theme/DocItem` 一份套壳，
框里这份收成这里。三处逐字相同的接线只留一份：按命名空间从注册表取本层那条 `internal` 条目
（取不到就立刻抛）、按包名造那三条 postMessage 的名字、在工厂外面造好「把这一份文档的 `#`
那一段报给外层」的函数（每次渲染换引用会让那条 effect 重装监听器）。

各家差异只剩两格，都由调用方给：

- `loadView`：这一层真正渲染文档的那份接线（各包 `components/` 里那份 UI），形状恒为 `url` +
  `onRouteChange`。交的是**动态 import 的函数**、不是组件本身 —— 渲染器（`redoc` /
  `@stoplight/elements` / `@scalar/api-reference`）因此只落在框内那条路由自己的 chunk 里，
  不在这条路由的静态图里。
- 亮暗落到这一份文档的方式：`modeAttribute`（Redoc / Elements 写成 `<html>` 上一条属性）或
  `onMode`（Scalar 换 `<body>` 上互斥的两个类名）。两格互斥，形状就是 `useInnerFrameSync`
  那一条，本层不另设一套。

两个方向怎么对齐、各家路由踩过的那些坑，记在 `docs/iframe-protocol.md` 与各层 `docs/internals.md`。

## 产出的那一页是什么形状

各包 `theme/XxxPage/index.tsx` 就是这份工厂的返回值，由本层插件路由（`addRoute` 注册的
`@theme/XxxPage`）挂上。它**不是文档页**：frontmatter、面包屑、正文、目录、翻页都没有，整份
文档就是给 iframe 装的那一格 —— 渲染器的运行时代码、它往 `<head>` 插的那张样式表、它的
localStorage 与它自己的路由，全关在这份文档里，站点的文档页一行都碰不到。

它也**不套** `@theme/Layout/Provider`：为什么不靠同源那条 localStorage 跟着站点开关翻，见
`docs/iframe-protocol.md` 的「为什么不用框架的那条存储同步」一节。

渲染只在浏览器里进行（`useIsBrowser` 那一格）：spec 地址在地址栏里，那份数据服务端根本没有，
而渲染器在没有 DOM 的地方一跑就炸。各包 UI 组件因此不需要自己再挡一遍。
*/

import { lazy, Suspense } from 'react';
import type { ComponentType, ReactNode } from 'react';

import useIsBrowser from '@docusaurus/useIsBrowser';

import { apiFrameMessages } from './api-frame-messages.ts';
import { apiFrameByNamespace } from './api-frame-registry.ts';
import { specUrlFromSearch } from './frame-messages.ts';
import {
  createRouteReporter,
  useInnerFrameSync,
  type InnerFrameSyncOptions,
} from './frame-sync.ts';

/** 三份渲染接线的共同形状：文档地址，加上「框内换了接口，报给外层」那一句。 */
export type ApiFrameViewProps = {
  /** 选中了哪条接口，报给框外那一份文档（就是下面那份 `createRouteReporter` 造的函数）。 */
  onRouteChange: (hash: string) => void;
  /** 要渲染的那份 OpenAPI 文档的地址（从框内那条地址的 `src` 参数里解出来）。 */
  url: string;
};

/** `useInnerFrameSync` 的选项去掉 `messages`（那一份由命名空间造，不让调用方再写一遍）。 */
type WithoutMessages<T> = T extends InnerFrameSyncOptions
  ? Omit<T, 'messages'>
  : never;

export type ApiFrameViewConfig = WithoutMessages<InnerFrameSyncOptions> & {
  /**
  这一层渲染文档的那份接线（各包 `components/` 里那份 UI 组件），**按需交出来**。

  给函数而不是组件，是为了让渲染器只落在自己那条 chunk 里：`() => import('…')` 交给
  `React.lazy()` 之后，这份接线的 import 不会被求值进框内那条路由的静态图里，`redoc` /
  `@stoplight/elements` / `@scalar/api-reference` 那一坨就跟着各自那条 chunk 走。写成
  `view: SomeUI` 会把它求值回组件，等于绕回静态 import —— 那是这一格要避开的东西。
  */
  loadView: () => Promise<{ default: ComponentType<ApiFrameViewProps> }>;
  /** 本层的包名：注册表里那一条的键，同时是三条 postMessage 的命名空间。 */
  namespace: string;
};

/**
造出框内那一页：接住外层送来的 `route` 与 `mode`，按地址里的 spec 参数渲染，
并把渲染器换过的那一段报回外层。

地址里那一段缺着、或写成非 http(s) 的，这一格什么都不渲染 —— 那条页面是条公开地址，
别人直接打开它时，渲染器自己那份「加载失败」摆在正文区，观感反而更像坏了。
*/
export function createApiFrameView(config: ApiFrameViewConfig): ComponentType {
  const { loadView, namespace, ...syncOptions } = config;

  const entry = apiFrameByNamespace(namespace);
  if (entry === undefined || entry.kind !== 'internal') {
    throw new Error(`注册表里缺 ${namespace}`);
  }

  const messages = apiFrameMessages(namespace);
  const reportRouteToParent = createRouteReporter(messages);
  const View = lazy(loadView);

  return function ApiFrameView(): ReactNode {
    const isBrowser = useIsBrowser();

    useInnerFrameSync({ ...syncOptions, messages });

    if (!isBrowser) {
      return null;
    }

    const url = specUrlFromSearch(
      window.location.search,
      window.location.origin,
      entry.specParam,
    );

    return url === undefined ? null : (
      <Suspense fallback={null}>
        <View onRouteChange={reportRouteToParent} url={url} />
      </Suspense>
    );
  };
}
