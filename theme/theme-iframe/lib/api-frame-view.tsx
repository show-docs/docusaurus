/**
框内那一页的正文：三条 API 层共用这一份工厂 —— 与外层「整页交给一个框」收拢成
`theme/DocItem` 那一份套壳对称，那份管外面这个框，这一份管框里那份文档。

一份工厂收掉的是三处逐字相同的接线：从注册表取本层那条 `internal` 条目（取不到就立刻抛，
配置期与浏览器期读的还是同一份注册表）、按包名造那三条 postMessage 的名字、在模块级造一份
「把这一份文档地址里 `#` 那一段报给外层」的函数（每次渲染换引用会让那条 effect 重新装监听器，
所以它在工厂外面造好）。各家差异只剩两格，都由调用方给：

- `view`：这一层真正渲染文档的那份接线（各包 `components/` 里那份 UI），形状都是 `url` 与
  `onRouteChange` 两格。
- 亮暗怎么落到这一份文档身上：`modeAttribute`（Redoc / Elements 那样写成 `<html>` 上一条属性）
  或 `onMode`（Scalar 换 `<body>` 上互斥的两个类名）—— 两格互斥，形状就是 `useInnerFrameSync`
  那一条，本层不另设一套。

两个方向怎么对齐、以及各家路由踩过的那些坑（渲染器换接口走的是 `history.pushState`，它不触发
`hashchange`；Scalar 只听 `popstate`）记在 `docs/iframe-protocol.md`，理由留在用它的页面里，
这里不抄第二份。

## 产出的那一页是什么形状

各包 `theme/XxxPage/index.tsx` 就是这份工厂的返回值，由本层插件路由（`addRoute` 注册的
`@theme/XxxPage`）挂上。它**不是文档页**：frontmatter、面包屑、正文、目录、翻页都没有，整份
文档就是给 iframe 装的那一格 —— 渲染器的运行时代码、它往 `<head>` 插的那张样式表、它的
localStorage 与它自己的路由，全关在这份文档里，站点的文档页一行都碰不到。

它也**不套** `@theme/Layout/Provider`。改造过程中这一格一度是必需的，为的是它底下那六个
provider 里的 `ColorModeProvider`：那个 provider 维护 `<html data-theme>` 并监听 `storage`
事件，外层点一下亮暗开关，框内这一份靠同源 localStorage 跟着翻。现在亮暗由外层随那条
postMessage 通道送进来，这一层就不需要了；剩下那五个（公告栏、滚动控制、版本文档、插件类名、
导航栏）与这一页无关，它们各自都要读站点配置，拉进来只是白费。

渲染只在浏览器里进行（`useIsBrowser` 那一格）：spec 地址在地址栏里，那份数据服务端根本没有，
而渲染器在没有 DOM 的地方一跑就炸。各包 UI 组件因此不需要自己再挡一遍。
*/

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
  onRouteChange: (hash: string) => void;
  url: string;
};

/** `useInnerFrameSync` 的选项去掉 `messages`（那一份由命名空间造，不让调用方再写一遍）。 */
type WithoutMessages<T> = T extends InnerFrameSyncOptions
  ? Omit<T, 'messages'>
  : never;

export type ApiFrameViewConfig = WithoutMessages<InnerFrameSyncOptions> & {
  /** 本层的包名：注册表里那一条的键，同时是三条 postMessage 的命名空间。 */
  namespace: string;
  /** 这一层渲染文档的那份接线（各包 `components/` 里那份 UI 组件）。 */
  view: ComponentType<ApiFrameViewProps>;
};

/**
造出框内那一页：接住外层送来的 `route` 与 `mode`，按地址里的 spec 参数渲染，
并把渲染器换过的那一段报回外层。

地址里那一段缺着、或写成非 http(s) 的，这一格什么都不渲染 —— 那条页面是条公开地址，
别人直接打开它时，渲染器自己那份「加载失败」摆在正文区，观感反而更像坏了。
*/
export function createApiFrameView(config: ApiFrameViewConfig): ComponentType {
  const { namespace, view: View, ...syncOptions } = config;

  const entry = apiFrameByNamespace(namespace);
  if (entry === undefined || entry.kind !== 'internal') {
    throw new Error(`注册表里缺 ${namespace}`);
  }

  const messages = apiFrameMessages(namespace);
  const reportRouteToParent = createRouteReporter(messages);

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
      <View onRouteChange={reportRouteToParent} url={url} />
    );
  };
}
