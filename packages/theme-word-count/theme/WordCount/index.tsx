import type { ReactNode } from 'react';

import { useDoc } from '@docusaurus/plugin-content-docs/client';
import useRouteContext from '@docusaurus/useRouteContext';
// 全站那一份统计：本包在配置期算好、铺进 Docusaurus 的生成目录，由 `@generated` 那条别名读回来。
// 形状在本包 `types/word-count-specifiers.d.ts`（那一句 `import` 的类型来自它），
// 算它的是 `src/content.mts`。
import { stats } from '@generated/theme-word-count/stats';

import type {
  WordCount as WordCountData,
  WordCountScope,
} from '../../types/word-count.ts';

import css from './metrics.module.css';
import { ofFolder, ofInstance, ofPage } from './scope.ts';

/** docs 插件在路由上下文里的名字：只有这一种上下文才谈得上「这一页属于哪份实例」。 */
const DOCS_PLUGIN = 'docusaurus-plugin-content-docs';

/** 明细的一格：项目名与取哪一格数。 */
type Metric = readonly [
  label: string,
  value: (totals: WordCountData) => number,
];

/**
四栏明细：文件、文字、标题、正文结构。

一栏一张两列表、各带一句表头，宽屏两行两列、窄屏叠放 —— 比一张二十多行的两列长表好扫。
按行数配对（3 / 4 / 7 / 8）是为了两列各自填满、不在矮的那一栏下面空出一截。
分栏只改排布：四栏里的数与合计读的是同一整格。
*/
const METRIC_GROUPS: readonly (readonly [
  caption: string,
  metrics: readonly Metric[],
])[] = [
  [
    '文件',
    [
      ['文件数量', (totals) => totals.pages],
      ['草稿数量', (totals) => totals.drafts],
      ['Frontmatter', (totals) => totals.frontmatter],
    ],
  ],
  [
    '文字',
    [
      ['词数', (totals) => totals.words],
      ['中日韩文字', (totals) => totals.cjk],
      ['其余文字', (totals) => totals.latin],
      ['字符数', (totals) => totals.characters],
    ],
  ],
  [
    '标题',
    [
      ['Heading ID', (totals) => totals.headingIds],
      ['一级标题数', (totals) => totals.h1],
      ['二级标题数', (totals) => totals.h2],
      ['三级标题数', (totals) => totals.h3],
      ['四级标题数', (totals) => totals.h4],
      ['五级标题数', (totals) => totals.h5],
      ['六级标题数', (totals) => totals.h6],
    ],
  ],
  [
    '正文结构',
    [
      ['代码段', (totals) => totals.codeBlocks],
      ['代码段行数', (totals) => totals.codeLines],
      ['图像', (totals) => totals.images],
      ['描述性图表', (totals) => totals.graphs],
      ['表格', (totals) => totals.tables],
      ['外部链接', (totals) => totals.externalLinks],
      ['内部链接', (totals) => totals.internalLinks],
      ['引用文本段', (totals) => totals.blockquotes],
    ],
  ],
];

/** 四种范围共用的四栏明细：项目名做行头，右边是数。四栏各是一张 Infima 卡片。 */
function Metrics({ totals }: { totals: WordCountData }): ReactNode {
  return (
    <div className={css.panels}>
      {METRIC_GROUPS.map(([caption, metrics]) => (
        <div className="card" key={caption}>
          <div className={`card__body ${css.body}`}>
            <table>
              <caption>{caption}</caption>
              <tbody>
                {metrics.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{value(totals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
四种范围共用的一块：左边标题，右边交代「这是哪一格」的定位；下面是四栏明细。

不进 callout：这一块讲的是正文自己的数，不是需要读者留意的旁注；四张 Infima 卡片直接排在正文里，
`aria-label` 让它在读屏与判据里仍然有名字。定位放右端是为了让抬头占满一整行 —— 写在标题
后面时，右边会空出大半截。
*/
function StatsBlock({
  title,
  meta,
  totals,
}: {
  title: string;
  meta?: ReactNode;
  totals: WordCountData;
}): ReactNode {
  return (
    <section className={css.block} aria-label={title}>
      <p className={css.header}>
        <span className={css.title}>{title}</span>
        {meta === undefined ? null : <span className={css.meta}>{meta}</span>}
      </p>
      <Metrics totals={totals} />
    </section>
  );
}

/**
全站那一份：站点里没有文档时也走这里（所有数都是 0）。

版本只有一个时只写一次：逐个分组抄一遍会读成「内容根 A · 版本 Next、内容根 B · 版本 Next」，
「内容根」「版本」两副字样各重复一遍，说的却是同一件事。版本不止一个时退回逐组写 ——
那时每个内容根用的是哪一版，不是一句话能说清的。
*/
function SiteStats(): ReactNode {
  const roots = [...new Set(stats.groups.map((group) => group.instance))];
  const versions = [...new Set(stats.groups.map((group) => group.version))];

  return (
    <StatsBlock
      title="全站字数"
      meta={
        stats.groups.length === 0 ? (
          '站点里还没有加载到任何文档'
        ) : versions.length === 1 ? (
          <>
            统计范围：内容根{' '}
            {roots.map((root, index) => (
              <span key={root}>
                <code>{root}</code>
                {index === roots.length - 1 ? null : '、'}
              </span>
            ))}{' '}
            <span>
              · 版本 <code>{versions[0]}</code>
            </span>
          </>
        ) : (
          <>
            统计范围：
            {stats.groups.map((group, index) => (
              <span key={`${group.instance}/${group.version}`}>
                内容根 <code>{group.instance}</code> · 版本{' '}
                <code>{group.version}</code>
                {index === stats.groups.length - 1 ? null : '、'}
              </span>
            ))}
          </>
        )
      }
      totals={stats}
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
      meta={
        <>
          内容根 <code>{instance}</code> · 版本{' '}
          {own.map((group, index) => (
            <span key={group.version}>
              <code>{group.version}</code>
              {index === own.length - 1 ? null : '、'}
            </span>
          ))}
        </>
      }
      totals={totals}
    />
  );
}

/**
本页 / 本文件夹：需要这一页的源地址，`useDoc()` 只在 docs 页面里有。

块是正文里的一个普通组件，而 `theme-classic` 的 `DocItem` 把 `<DocProvider>` 包在整棵正文外面，
所以这里拿到的 `metadata.source` 与配置期清单里的 `source` 是同一个 `@site/…`。
两种范围各查各的表：本页查 `docs`，本文件夹查 `folders`（配置期已含子目录）。生成模块只铺
写了 `page` / `folder` 指令的那几格，所以本文件夹这一格不拿「本页在不在明细里」当前提 ——
写了 `folder` 的页未必写了 `page`。挑不出来（开发期重载中间的那一瞬）就退回全站，不安静显示 0。
*/
function DocStats({ scope }: { scope: 'page' | 'folder' }): ReactNode {
  const { metadata } = useDoc();

  if (scope === 'page') {
    const page = ofPage(stats, metadata.source);

    if (page === undefined) {
      return <SiteStats />;
    }

    return (
      <StatsBlock
        title="本页字数"
        meta={
          <>
            文件 <code>{metadata.source.replace(/^@site\//, '')}</code>
          </>
        }
        totals={page}
      />
    );
  }

  const folder = ofFolder(stats, metadata.source);

  if (folder === undefined) {
    return <SiteStats />;
  }

  return (
    <StatsBlock
      title="本文件夹字数"
      meta={
        metadata.sourceDirName === '.' ? (
          '内容根根目录'
        ) : (
          <>
            文件夹 <code>{metadata.sourceDirName}</code>
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

四种范围都摆同一份四栏明细，各自取生成模块里已经合好的那一格，页面里不做加法。数字只出现在
表里：标题左、定位右，只交代「这是哪一格」，不再用一句话把词数、页数那些数重复一遍。

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
