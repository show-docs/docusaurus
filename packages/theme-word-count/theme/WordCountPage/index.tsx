import type { ComponentPageProps } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import DocItem from '@theme-init/DocItem';

import type { ComponentType, ReactNode } from 'react';

import useRouteContext from '@docusaurus/useRouteContext';
import Admonition from '@theme/Admonition';
// 全站那一份统计：本包在配置期算好、铺进 Docusaurus 的生成目录，由 `@generated` 那条别名读回来。
// 形状在本包 `types/word-count-specifiers.d.ts`（那一句 `import` 的类型来自它），
// 算它的是 `src/content.mts`。
import { stats } from '@generated/theme-word-count/stats';

/** docs 插件在路由上下文里的名字：只有这一种上下文才谈得上「这一页属于哪份实例」。 */
const DOCS_PLUGIN = 'docusaurus-plugin-content-docs';

// `content` 是 component-page 交进来的正文组件；`frontMatter` / `value` 这一页不用 ——
// 命不命中已经由 component-page 判过，数又不从这一页来。
type Props = ComponentPageProps & {
  content?: ComponentType<Record<string, unknown>>;
};

/**
本层交给 `@show-docs/docusaurus-theme-component-page` 的那一页（`src/index.mts` 的
`loadContent()` 交出的 `wordCount` 那一把键）：它判中后整页换成这个组件，所以这里**不再判键**，
只把统计摆在正文上方。

统计是**整站**在配置期算好的，但这一页只显示**自己所在的那一份内容根**：`useRouteContext()`
给出当前路由的 `plugin.id`，那是 docs 实例的 id，与配置期分组用的 `instance` 同源
（两处都是 `plugin.options.id`，见 `docs/internals.md` 的「这一页怎么知道自己在哪一格」）。
同一个根里的另一页再命中，看到的是同一份数；版本化的实例显示该实例各版本的合计。

这一格不进 `ViewLayerDocItem` 那个共用外壳：那一只外壳是为「正文上方一块懒加载的视图」准备的
（错误边界 + `Suspense` + 放宽容器），这里三份都不需要 —— 数在配置期就算好了，
读它只是一句对象取值，容器也要保持文档那一栏的宽度。

数字直接写出来，不加千分位：同一份数在静态渲染与服务端注水里要写成同一个字符串，
少一处格式化就少一处能漂的地方。
*/
export default function WordCountPage({ content }: Props): ReactNode {
  const { plugin } = useRouteContext();
  /** 这一页所在实例的那几格（版本化的实例有几格）；路由不是 docs、或挑不出格时是空的。 */
  const own =
    plugin.name === DOCS_PLUGIN
      ? stats.groups.filter((group) => group.instance === plugin.id)
      : [];
  const located = own.length > 0;
  const summary = own.reduce(
    (total, group) => ({
      cjk: total.cjk + group.cjk,
      latin: total.latin + group.latin,
      words: total.words + group.words,
      pages: total.pages + group.pages,
    }),
    { cjk: 0, latin: 0, words: 0, pages: 0 },
  );
  // 挑不出格时退回整份统计：`@theme/DocItem` 只有 docs 用，这条分支理论上到不了，
  // 但真走到了，页面上仍然是那份算好的数，不会安静消失。
  const shown = located ? summary : stats;

  let details: ReactNode;

  if (located) {
    // 一个实例只有一个版本时，合计那一句已经说完了；多版本才把各格摊开。
    details = own.length > 1 && (
      <ul>
        {own.map((group) => (
          <li key={group.version}>
            版本 <code>{group.version}</code>：{group.pages} 页、{group.words}{' '}
            词
          </li>
        ))}
      </ul>
    );
  } else if (stats.groups.length === 0) {
    details = <p>站点里还没有加载到任何文档，所以三个数都是 0。</p>;
  } else {
    details = (
      <ul>
        {stats.groups.map((group) => (
          <li key={`${group.instance}/${group.version}`}>
            内容根 <code>{group.instance}</code> · 版本{' '}
            <code>{group.version}</code>： {group.pages} 页、{group.words} 词
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="container padding-top--md">
        <Admonition title={located ? '内容根字数' : '全站字数'} type="note">
          <p>
            {located ? (
              <>
                内容根 <code>{plugin.id}</code>：
              </>
            ) : null}
            共 <strong>{shown.words}</strong> 个词，来自 {shown.pages}{' '}
            页：中日韩文字按字 {shown.cjk} 个， 其余文字按词 {shown.latin} 个。
          </p>
          {details}
        </Admonition>
      </div>
      <DocItem content={content} />
    </>
  );
}
