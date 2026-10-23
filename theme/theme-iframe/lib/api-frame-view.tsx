/**
框内那一页的正文：三条 API 层共用这一份工厂 —— 外面那个框收成 `theme/DocItem` 一份套壳，
框里这份收成这里。三处逐字相同的接线只留一份：按命名空间从注册表取本层那条 `internal` 条目
（取不到就立刻抛）、按包名造那三条 postMessage 的名字、在工厂外面造好「把这一份文档的 `#`
那一段报给外层」的函数（每次渲染换引用会让那条 effect 重装监听器）。

各家差异只剩两格，都由调用方给：

- 这一层真正渲染文档的那份接线（各包 `components/` 里那份 UI），形状恒为 `url` +
  `onRouteChange`；`view` 静态交、`loadView` 到时再取，见下面 `ApiFrameViewEntry`。
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

三份渲染器（Redoc / Elements / Scalar）各带几 MB 依赖，走 `loadView` 那格按需取：静态 import 一条
都留在本包 `components/` 里，只有这一页真渲染时才下载。代价是框里那一下先空着 —— 这条取法走
effect 不走 React 的挂起，所以没有 `Suspense` 那份 `fallback` 可用。
*/

import { useEffect, useState } from 'react';
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

/**
渲染接线那一格有两种给法，选哪种由**包重不重**决定：

- `view`：静态交给工厂，渲染器随这一份代码一起进框内那条路由的 chunk（那条 chunk 不是任何页面的
  首屏，但它就是「这一页要不要下载」的全部判据）。
- `loadView`：真渲染时才去取（`import()`），渲染器那几 MB 跟着动态 import 分词。
  三份重渲染器（Redoc / Elements / Scalar）走这一格。
*/
type ApiFrameViewEntry =
  | { view: ComponentType<ApiFrameViewProps>; loadView?: undefined }
  | {
      loadView: () => Promise<ComponentType<ApiFrameViewProps>>;
      view?: undefined;
    };

export type ApiFrameViewConfig = WithoutMessages<InnerFrameSyncOptions> &
  ApiFrameViewEntry & {
    /** 本层的包名：注册表里那一条的键，同时是三条 postMessage 的命名空间。 */
    namespace: string;
  };

/** 地址里那一份 spec 的地址；缺着、或写成非 http(s) 的，这一格什么都不渲染。 */
function resolvedSpecUrl(specParam: string): string | undefined {
  return specUrlFromSearch(
    window.location.search,
    window.location.origin,
    specParam,
  );
}

/**
按 `loadView` 那一格取渲染接线：取到之前什么都不渲染（框里那一下本来就是空白），取不到就把
原因交给控制台 —— 多页站点丢掉的只是一页的正文，不该把整份文档一起炸掉（`theme-viewer` 那边
同一口径）。
*/
function useLoadedView(
  loadView: () => Promise<ComponentType<ApiFrameViewProps>>,
): ComponentType<ApiFrameViewProps> | null {
  const [loaded, setLoaded] = useState<ComponentType<ApiFrameViewProps>>();

  useEffect(() => {
    let stopped = false;
    loadView()
      .then((component) => {
        if (!stopped) {
          // 写成 `() => component`：直接把函数交给 `setState` 会被当成 updater，React 会拿上一个
          // 值去调它 —— 那一次调用就把新组件渲成 `undefined` 的 props。
          setLoaded(() => component);
        }
      })
      .catch((error: unknown) => {
        console.warn('[theme-iframe] 框内渲染器加载失败：', error);
      });
    return () => {
      stopped = true;
    };
  }, [loadView]);

  // 用 `null` 而不是 `undefined` 表示「还没取到」：渲染那一格要把它当组件用，而那条 lint 规则
  // 把「渲染期拿到的 `undefined`」当成「新造了一个组件」。取到的那个引用本身是稳定的。
  return loaded ?? null;
}

/**
按需那一格：取到之前什么都不渲染，取到之后把两格 props 原样交给它。

它自己是一个组件、而不是在同一层里判「取到没有」，是为了让静态那一格（`view`）一个 hook
都不多挂。

`loadView` 那份引用由调用方写死在模块级（`() => import(…)`），每次渲染都是同一个，所以排进
effect 依赖是安全的 —— 这条 import 实际只会发一次。
*/
function LoadedFrameView(
  props: ApiFrameViewProps & {
    loadView: () => Promise<ComponentType<ApiFrameViewProps>>;
  },
): ReactNode {
  const { loadView, ...frameProps } = props;
  const Loaded = useLoadedView(loadView);

  // `Loaded` 来自 `import()`，取到之后就是同一个引用（不是每次渲染新造一个组件，那才是这条规则
  // 要拦的情况），所以这里按「有没有」判。
  // eslint-disable-next-line react-hooks/static-components -- 见上一句
  return Loaded === null ? null : <Loaded {...frameProps} />;
}

/**
造出框内那一页：接住外层送来的 `route` 与 `mode`，按地址里的 spec 参数渲染，
并把渲染器换过的那一段报回外层。

地址里那一段缺着、或写成非 http(s) 的，这一格什么都不渲染 —— 那条页面是条公开地址，
别人直接打开它时，渲染器自己那份「加载失败」摆在正文区，观感反而更像坏了。
*/
export function createApiFrameView(config: ApiFrameViewConfig): ComponentType {
  const { namespace, view: View, loadView, ...syncOptions } = config;

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

    const url = resolvedSpecUrl(entry.specParam);
    if (url === undefined) {
      return null;
    }

    const frameProps = { onRouteChange: reportRouteToParent, url };

    // 两格互斥：`loadView` 在就先渲染那层按需的壳，否则直接用静态交给工厂的那一份。
    return loadView === undefined ? (
      <View {...frameProps} />
    ) : (
      <LoadedFrameView loadView={loadView} {...frameProps} />
    );
  };
}
