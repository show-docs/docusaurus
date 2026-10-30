/**
框内那一份独立文档：`render: 'iframe'` 的那些规则都在这一条路由里渲染（地址见
`../../lib/frame-route.ts`，由本层插件经 `actions.addRoute` 注册）。

它**不是文档页**：frontmatter、面包屑、正文、目录、翻页都没有，整份文档就是给那个组件装的一格。
渲染器那几 MB 的运行时代码、它往 `<head>` 插的样式、它的 localStorage 与它自己的路由，全关在这份
文档里，站点的文档页一行都碰不到 —— 而组件因此可以放心地在自己的文档里换地址、插样式，不必替
父页收拾。它也不套 `@theme/Layout`，站点那条 `data-theme` 在这里只是内联脚本写死的一份、
没人维护，所以亮暗由外层送进来（见 `../../lib/frame-sync.tsx`）。

**这里不再判一遍文档规则**：外层已经判完并把结果（哪个组件、哪一份数据）送进来了；再判一次就
有两个分派器，两边的顺序迟早会漂。

组件按**登记名**查（那张表在配置期按 `render` 铺成 `@generated/theme-component-page/frame-registry`），
所以本层不认包名、也没有「谁命名空间下那条」的中心表：新增一条框内规则只要那个包交一个组件与
一条 `render: 'iframe'` 的规则，不必回来改这里。

四种看得见的状态各有各的话（提案里那条「未初始化、非法数据、加载中和组件错误要可见」）：
未等到数据 / 登记名查不到 / 组件自己抛出来。加载中那一格归组件自己（渲染器按需取，见各包
`docs/internals.md`）。
*/

import type { ReactNode } from 'react';

import Admonition from '@theme/Admonition';
import { components } from '@generated/theme-component-page/frame-registry';

import { FrameBridgeProvider, useFrameBridge } from '../../lib/frame-sync.tsx';
import type { ViewLayerLabels } from '../../lib/view-layer-labels.ts';
import { ViewErrorBoundary } from '../../lib/view-layer-shell.tsx';

/** 组件自己抛出来时那句兜底的话（视图层那一条同形状，只是这里没有「退回正文」可退）。 */
const FRAME_LABELS: ViewLayerLabels = {
  name: 'theme-component-page',
  title: '框里那一页的组件渲染失败了',
  description:
    '这一格是组件自己的问题，不是这条规则没生效：控制台里有它抛出来的那一条。',
};

/** 按登记名查那个组件；查不到交回 `undefined`（外层送的这个名字没在表里）。 */
function componentOf(id: string) {
  return components.find((entry) => entry.id === id);
}

export default function ComponentFramePage(): ReactNode {
  const { payload, colorMode } = useFrameBridge();

  // 还没接到 `init`：外层那条握手循环会在装好监听器时主动推一轮，也会在这一句发出去之后补推。
  // 服务端渲染与客户端首次渲染都停在这一步，两边算出的完全一样，所以不会在挂载那一下闪一下。
  if (payload === undefined) {
    return (
      <div className="container padding-top--lg padding-bottom--lg">
        <p>正在从这一页的文档里取数据…</p>
      </div>
    );
  }

  const entry = componentOf(payload.componentId);

  // 认不出这个名字（站点手改过生成文件、或外层与框内不是同一轮构建出来的）：点名说清楚，
  // 不渲染一个空白的框 —— 那看起来像「这条规则没生效」，而实际是登记名对不上。
  if (entry === undefined) {
    return (
      <Admonition title="框内没有这个组件" type="danger">
        {`theme-component-page：外层送进来的登记名「${payload.componentId}」不在这一份构建的表里。表由站点配置里的 \`components\` 与各包 \`loadContent()\` 交回的那一格生成，改完要重启站点。`}
      </Admonition>
    );
  }

  const { Component } = entry;

  return (
    <FrameBridgeProvider colorMode={colorMode}>
      <ViewErrorBoundary labels={FRAME_LABELS}>
        <Component {...payload.data} />
      </ViewErrorBoundary>
    </FrameBridgeProvider>
  );
}
