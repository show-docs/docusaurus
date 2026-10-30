import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { ViewLayerDocItem } from '@show-docs/docusaurus-theme-component-page/lib/view-layer-shell.tsx';
import DocItem from '@theme-init/DocItem';

import { lazy } from 'react';
import type { ComponentType, ReactNode } from 'react';

// 渲染那一半数据的形状（`dbml-loader` 在编译期用 `@dbml/core` 解析 `.dbml` 的结果）。
// 产地与逐格说明见 `src/types.mts`。
// 不从 `src/types.mts` 引：`theme/` 是本层静态的那一半，每份文档页都要求值到这一句，而那份源码
// 连着 `@dbml/core` 的类型 —— `import type` 只免掉求值、免不掉打包器把它当成一条依赖。
// 关系图自己的代码因此只跟着 `erd-chart.tsx` 那条动态 import 走。
type DbmlModel = never;

const ErdChart = lazy(() =>
  import('../../components/erd-chart.tsx').then(({ ErdChart: View }) => ({
    default: View,
  })),
);

// dbml-loader 在编译结果里写了 `export const dbml_json`，Docusaurus 把它和其他命名导出
// 一起挂到 MDX 组件上，所以两者在同一个值上。
type MDXContent = ComponentType<Record<string, unknown>> & {
  dbml_json?: DbmlModel;
};

// `content` 是 component-page 交进来的正文组件；`frontMatter` / `value` 这一页不用 ——
// 关系图的数据由 loader 追加上来，命不命中已经由 component-page 按 `dbml_json` 判过。
type Props = ComponentPageProps & { content?: MDXContent };

/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那一页（`src/component-pages.mts` 交出的
`dbml_json` 那一把键）：它判中后整页换成这个组件，所以这里**不再判键**，只把关系图摆在正文上方。

关系图是正文的**前一个兄弟节点**，不塞进 `content`：正文原样交给官方那一份 `DocItem`
（`@theme-init/DocItem`），页面结构（标题、目录、面包屑、页脚导航）都不受影响。`content` 来自
component-page（命中时它不再往下走），所以正文只能从这里拿。
*/
export default function ErdPage({ content }: Props): ReactNode {
  return (
    <ViewLayerDocItem
      data={content?.dbml_json}
      labels={{
        name: 'theme-erd',
        title: '关系图渲染失败',
        description: '本文带了 dbml，但关系图初始化出错，请查看浏览器控制台。',
      }}
      view={ErdChart}
    >
      <DocItem content={content} />
    </ViewLayerDocItem>
  );
}
