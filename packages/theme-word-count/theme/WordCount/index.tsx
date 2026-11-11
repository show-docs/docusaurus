import type { ReactNode } from 'react';

import { useDoc } from '@docusaurus/plugin-content-docs/client';
import useRouteContext from '@docusaurus/useRouteContext';
import Admonition from '@theme/Admonition';
// 全站那一份统计：本包在配置期算好、铺进 Docusaurus 的生成目录，由 `@generated` 那条别名读回来。
// 形状在本包 `types/word-count-specifiers.d.ts`（那一句 `import` 的类型来自它），
// 算它的是 `src/content.mts`。
import { stats } from '@generated/theme-word-count/stats';

import type {
  WordCount as WordCountData,
  WordCountScope,
} from '../../types/word-count.ts';

import { ofFolder, ofInstance, ofPage } from './scope.ts';

/** docs 插件在路由上下文里的名字：只有这一种上下文才谈得上「这一页属于哪份实例」。 */
const DOCS_PLUGIN = 'docusaurus-plugin-content-docs';

/** 明细表的行：左边那一句与右边取哪一格数。 */
const METRICS: readonly (readonly [
  label: string,
  value: (totals: WordCountData) => number,
])[] = [
  ['文件数量', (totals) => totals.pages],
  ['草稿数量', (totals) => totals.drafts],
  ['Frontmatter', (totals) => totals.frontmatter],
  ['Heading ID', (totals) => totals.headingIds],
  ['一级标题数', (totals) => totals.h1],
  ['二级标题数', (totals) => totals.h2],
  ['三级标题数', (totals) => totals.h3],
  ['四级标题数', (totals) => totals.h4],
  ['五级标题数', (totals) => totals.h5],
  ['六级标题数', (totals) => totals.h6],
  ['代码段', (totals) => totals.codeBlocks],
  ['代码段行数', (totals) => totals.codeLines],
  ['图像', (totals) => totals.images],
  ['描述性图表', (totals) => totals.graphs],
  ['表格', (totals) => totals.tables],
  ['外部链接', (totals) => totals.externalLinks],
  ['内部链接', (totals) => totals.internalLinks],
  ['引用文本段', (totals) => totals.blockquotes],
  ['词数', (totals) => totals.words],
  ['中日韩文字', (totals) => totals.cjk],
  ['其余文字', (totals) => totals.latin],
  ['字符数', (totals) => totals.characters],
];

/** 四种范围共用的一张明细表：左边是项目，右边是数。 */
function MetricsTable({ totals }: { totals: WordCountData }): ReactNode {
  return (
    <table>
      <thead>
        <tr>
          <th>项目</th>
          <th>统计</th>
        </tr>
      </thead>
      <tbody>
        {METRICS.map(([label, value]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{value(totals)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 块上的那一句总数；`withPages` 只有「本页」不需要。 */
function Summary({
  totals,
  withPages = true,
}: {
  totals: WordCountData;
  withPages?: boolean;
}): ReactNode {
  return (
    <>
      共 <strong>{totals.words}</strong> 个词
      {withPages ? `，来自 ${totals.pages} 页` : ''}
      ：中日韩文字按字 {totals.cjk} 个， 其余文字按词 {totals.latin} 个。
    </>
  );
}

/** 四种范围共用的一块：标题、正文（可带前缀）与明细表。 */
function StatsBlock({
  title,
  prefix,
  totals,
  withPages,
  details,
}: {
  title: string;
  prefix?: ReactNode;
  totals: WordCountData;
  withPages?: boolean;
  details?: ReactNode;
}): ReactNode {
  return (
    <Admonition title={title} type="note">
      <p>
        {prefix}
        <Summary totals={totals} withPages={withPages} />
      </p>
      <MetricsTable totals={totals} />
      {details}
    </Admonition>
  );
}

/** 全站那一份：站点里没有文档时也走这里（所有数都是 0）。 */
function SiteStats(): ReactNode {
  return (
    <StatsBlock
      title="全站字数"
      totals={stats}
      details={
        stats.groups.length === 0 ? (
          <p>站点里还没有加载到任何文档，所以表里的数都是 0。</p>
        ) : (
          <ul>
            {stats.groups.map((group) => (
              <li key={`${group.instance}/${group.version}`}>
                内容根 <code>{group.instance}</code> · 版本{' '}
                <code>{group.version}</code>： {group.pages} 页、{group.words}{' '}
                词
              </li>
            ))}
          </ul>
        )
      }
    />
  );
}

/** 所在内容根的那几格（版本化的实例有几格）；挑不出格时退回全站。 */
function InstanceStats({ instance }: { instance: string }): ReactNode {
  const own = stats.groups.filter((group) => group.instance === instance);
  const totals = ofInstance(stats, instance);

  if (own.length === 0 || totals === undefined) {
    return <SiteStats />;
  }

  return (
    <StatsBlock
      title="内容根字数"
      prefix={
        <>
          内容根 <code>{instance}</code>：
        </>
      }
      totals={totals}
      details={
        // 一个实例只有一个版本时，合计那一句已经说完了；多版本才把各格摊开。
        own.length > 1 && (
          <ul>
            {own.map((group) => (
              <li key={group.version}>
                版本 <code>{group.version}</code>：{group.pages} 页、
                {group.words} 词
              </li>
            ))}
          </ul>
        )
      }
    />
  );
}

/**
本页 / 本文件夹：需要这一页的源地址，`useDoc()` 只在 docs 页面里有。

块是正文里的一个普通组件，而 `theme-classic` 的 `DocItem` 把 `<DocProvider>` 包在整棵正文外面，
所以这里拿到的 `metadata.source` 与配置期清单里的 `source` 是同一个 `@site/…`。
这一页在统计里挑不出来（开发期重载中间的那一瞬）就退回全站，不安静显示 0。
*/
function DocStats({ scope }: { scope: 'page' | 'folder' }): ReactNode {
  const { metadata } = useDoc();
  const page = ofPage(stats, metadata.source);

  if (page === undefined) {
    return <SiteStats />;
  }

  if (scope === 'page') {
    return <StatsBlock title="本页字数" totals={page} withPages={false} />;
  }

  const folder = ofFolder(stats, metadata.source);

  if (folder === undefined) {
    return <SiteStats />;
  }

  return (
    <StatsBlock
      title="本文件夹字数"
      prefix={
        metadata.sourceDirName === '.' ? (
          '内容根根目录：'
        ) : (
          <>
            文件夹 <code>{metadata.sourceDirName}</code>：
          </>
        )
      }
      totals={folder}
    />
  );
}

/**
正文里那一行 `:::word-count` 渲染出来的那一块。

指令写在哪儿，这一块就出现在哪儿：`src/directive.mts` 的预处理器把那一行换成
`<__WordCount scope="…" />` 并在文首补一句 `import`，所以这里拿到的是正文中的一个普通组件，
没有整页替换、也不碰 `DocItem`。

四种范围：`page`（本页）、`folder`（本文件夹，含子目录）、`instance`（所在内容根，缺省）、
`site`（全站）。`instance` 靠 `useRouteContext()` 的 `plugin.id` —— 那是 docs 实例的 id，
与配置期分组用的 `instance` 同源（两处都是 `plugin.options.id`，见 `docs/internals.md` 的
「这一页怎么知道自己在哪一格」）。`page` / `folder` 靠 `useDoc()` 的 `metadata.source`，
与清单里每一页的 `source` 同源。

指令可以写在 docs 以外的页面里：那里没有实例、也没有这一页的元数据，`site` 以外的范围都退回
全站视图，页面上仍然是那份算好的数，不会安静消失。

这一块不进 `ViewLayerDocItem` 那个共用外壳：那一只外壳是为「正文上方一块懒加载的视图」准备的
（错误边界 + `Suspense` + 放宽容器），这里四份都不需要 —— 数在配置期就算好了，读它只是一句
对象取值；它又插在正文中间，容器宽度要跟着正文那一栏。

四种范围都摆同一张明细表：文件、草稿、frontmatter、标题、代码、图表、表格、链接、引用，末尾
是词数与字符数。表里的数与那句总数一起由配置期算好；本页、本文件夹、内容根、全站各自取生成
模块里已经合好的那一格，页面里不做加法。

数字直接写出来，不加千分位：同一份数在静态渲染与服务端注水里要写成同一个字符串，
少一处格式化就少一处能漂的地方。
*/
export default function WordCount({
  scope = 'instance',
}: {
  scope?: WordCountScope;
}): ReactNode {
  const { plugin } = useRouteContext();

  if (scope === 'site' || plugin.name !== DOCS_PLUGIN) {
    return <SiteStats />;
  }

  return scope === 'instance' ? (
    <InstanceStats instance={plugin.id} />
  ) : (
    <DocStats scope={scope} />
  );
}
