import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { ViewLayerDocItem } from '@show-docs/docusaurus-theme-iframe/lib/view-layer-shell.tsx';
import DocItem from '@theme-init/DocItem';

import { lazy } from 'react';
import type { ComponentType, ReactNode } from 'react';

// 差异那一半数据的形状（`md-diff-loader` 在编译结果里追加的 `export const diff`）。
// 产地与逐格说明见 `src/types.mts`。
// 不从 `src/types.mts` 引：`theme/` 是本层静态的那一半，每份文档页都要求值到这一句，
// 而 `import type` 免不掉打包器把那份源码当成一条依赖。差异视图自己的代码因此只跟着
// `diff-view.tsx` 那条动态 import 走。
type DiffData = never;

const GitDiffView = lazy(() =>
  import('../../components/diff-view.tsx').then(({ GitDiffView: View }) => ({
    default: View,
  })),
);

// md 的编译结果：default 导出是 MDX 组件，`diff` 等命名导出由 ComponentCreator
// 复制成它的静态属性，所以两者在同一个值上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  diff?: DiffData;
};

// `content` 是 component-page 交进来的正文组件；`frontMatter` / `value` 这一页不用 ——
// 差异的数据由 loader 追加上来，命不命中已经由 component-page 判过。
type Props = ComponentPageProps & { content?: MDXContent };

/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那一页（`src/component-pages.mts`
交出的 `diff` 那一把键）：它判中后整页换成这个组件，所以这里**不再判键**，只把差异视图
摆在正文上方。

视图是正文的**前一个兄弟节点**：正文原样交给官方那一份 `DocItem`（`@theme-init/DocItem`），
页面结构（标题、目录、面包屑、页脚导航）都不受影响。`content` 来自 component-page（命中时它
不再往下走），所以正文只能从这里拿。
*/
export default function DiffPage({ content }: Props): ReactNode {
  // post loader 给命中 frontmatter 的 md 追加 `export const diff`，
  // Docusaurus 把它和其他模块导出一起挂到 MDX 组件上。
  return (
    <ViewLayerDocItem
      data={content?.diff}
      labels={{
        name: 'theme-diff',
        title: '差异视图渲染失败',
        description:
          '本文标记了 diff，但差异视图初始化出错，请查看浏览器控制台。',
      }}
      view={GitDiffView}
    >
      <DocItem content={content} />
    </ViewLayerDocItem>
  );
}
