import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { ViewLayerDocItem } from '@show-docs/docusaurus-theme-iframe/lib/view-layer-shell.tsx';
import DocItem from '@theme-prev/DocItem';

import { lazy } from 'react';
import type { ComponentType, ReactNode } from 'react';

// 渲染那一半数据的形状（`md-markmap-loader` 在编译结果里追加的 `export const markmap`）。
// 产地与逐格说明见 `src/types.mts`。
// 不从 `src/types.mts` 引：`theme/` 是本层静态的那一半，每份文档页都要求值到这一句，而那份源码
// 连着 `markmap-lib` 的类型 —— `import type` 只免掉求值、免不掉打包器把它当成一条依赖。
// 导图自己的代码因此只跟着 `markmap.tsx` 那条动态 import 走。
type MarkmapData = never;

const MindChart = lazy(() =>
  import('../../components/markmap.tsx').then(({ MindChart: View }) => ({
    default: View,
  })),
);

// md 的编译结果：default 导出是 MDX 组件，`markmap` 等命名导出由 ComponentCreator
// 复制成它的静态属性，所以两者在同一个值上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  markmap?: MarkmapData;
};

// `content` 是 component-page 交进来的正文组件；`frontMatter` / `value` 这一页不用 ——
// 导图的数据由 loader 追加上来（含选项），命不命中已经由 component-page 判过。
type Props = ComponentPageProps & { content?: MDXContent };

/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那一页（`src/component-pages.mts` 交出的
`markmap` 那一把键）：它判中后整页换成这个组件，所以这里**不再判键**，只把导图摆在正文上方。

导图是正文的**前一个兄弟节点**：正文原样交给下面那一层 `DocItem`，页面结构（标题、目录、
面包屑、页脚导航）都不受影响。`content` 来自 component-page（命中时它不再往下走），
所以正文只能从这里拿。
*/
export default function MarkmapPage({ content }: Props): ReactNode {
  // post loader 给命中 frontmatter 的 md 追加 `export const markmap`，
  // Docusaurus 把它和其他模块导出一起挂到 MDX 组件上。
  return (
    <ViewLayerDocItem
      data={content?.markmap}
      labels={{
        name: 'theme-markmap',
        title: '导图渲染失败',
        description:
          '本文标记了 markmap，但导图初始化出错，请查看浏览器控制台。',
      }}
      view={MindChart}
    >
      <DocItem content={content} />
    </ViewLayerDocItem>
  );
}
