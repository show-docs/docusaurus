import { Component } from 'react';
import type { ComponentType, ReactNode } from 'react';

import Admonition from '@theme/Admonition';

import type { ViewLayerLabels } from './view-layer-labels.ts';
import { hackStyle } from './view-layer.ts';

/**
「在正文上方多插一块视图」那一族层（`theme-markmap` / `theme-erd` / `theme-diff`）共用的外壳。

它们那份 `DocItem` 只差在本层自己的键名、数据类型与视图组件上，壳本身是同一件事：
给视图包一层兜底（初始化失败时退回一条可见提示，而不是让整个文档页白屏），
并在正文外面多一层 `.container` 好让视图铺满。这份以前在每个包里各抄一遍，
改一处忘另两处就是漂移 —— 收在一处之后，`test/view-layer-copies.test.mts` 钉的是
「三处引的是同一份」，不再是「三份逐字相同」。

放在本包 `lib/` 而不是单开一个包：`lib/` 已随包发出去（`files` 与 `./lib/*` 那条 exports），
而这三条视图层本来就依赖 `@show-docs/docusaurus-theme-iframe`（babel 认领判据与 iframe 那层）。
*/

interface Props {
  children?: ReactNode;
}

interface State {
  failed: boolean;
}

/**
整棵子树（含懒加载 chunk）的兜底。每条层用 `ErrorBoundary(labels)` 造自己那一份 ——
失败提示的文案因此跟着层走，而实现只有这一份。
*/
export function ErrorBoundary(labels: ViewLayerLabels) {
  const { name, title, description } = labels;

  return class ViewErrorBoundary extends Component<Props, State> {
    static getDerivedStateFromError(): State {
      return { failed: true };
    }

    constructor(props: Props) {
      super(props);
      this.state = { failed: false };
    }

    override componentDidCatch(error: unknown): void {
      console.error(`[${name}] ${title}：`, error);
    }

    override render(): ReactNode {
      const { failed } = this.state;
      const { children } = this.props;

      if (failed) {
        return (
          <Admonition title={title} type="danger">
            {description}
          </Admonition>
        );
      }

      return children;
    }
  };
}

interface ViewLayerProps {
  /** 那一格视图（已包过兜底与懒加载）。 */
  view: ReactNode;
  /** 正文：本层下面的那个 `DocItem`。 */
  children?: ReactNode;
}

/**
那一族视图层落在正文上方的那一格：命中之后先摆视图、一条分隔线，再把正文放进一个 `.container`。

那条 `.fake` 配的是 `.container:not(.fake) { max-width: 100% !important }` ——
视图要铺满这一格，而页面结构（标题、目录、面包屑、页脚导航）一个字都不动：
正文仍是原样交给下层 `DocItem`，只是在它外面多套了这一层容器。
补丁由 `hackStyle()` 在同一个渲染里挂（见 `view-layer.ts`），壳里只剩结构。
*/
export function ViewLayer({ view, children }: ViewLayerProps): ReactNode {
  return (
    <>
      {hackStyle()}
      {view}
      <hr />
      <div className="container padding-top--md padding-bottom--lg fake">
        {children}
      </div>
    </>
  );
}

/**
本层那条 `DocItem`：命中本层 frontmatter 那把键就在正文上方多插一块视图，不命中原样交给下层。

`data` 是本层（已经判过命中）的那份数据；`view` 是包过兜底与懒加载的那块视图。
两条视图层因此各只剩一句：交哪把键、交哪个组件。
*/
export function ViewLayerDocItem<TData>(options: {
  labels: ViewLayerLabels;
  data: TData | undefined;
  view: ComponentType<{ data: TData }>;
  /** 命不命中由调用方判（各层的键名与空值口径不同）；不命中时返回 null。 */
  children?: ReactNode;
}): ReactNode {
  const { labels, data, view: View, children } = options;

  if (data === null || data === undefined) {
    return children;
  }

  const ViewErrorBoundary = ErrorBoundary(labels);

  return (
    <ViewLayer
      view={
        // 兜底那份是按调用方说法现造的类组件（< 20 行，`ErrorBoundary(labels)`），
        // 不是渲染期新造的「静态组件」；这条规则认不出这种工厂形状。
        // eslint-disable-next-line react-hooks/static-components -- 见上一句
        <ViewErrorBoundary>
          <View data={data} />
        </ViewErrorBoundary>
      }
    >
      {children}
    </ViewLayer>
  );
}
