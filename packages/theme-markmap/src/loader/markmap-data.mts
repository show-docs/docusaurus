import { wrapFunction } from 'markmap-common';
import { builtInPlugins, Transformer } from 'markmap-lib';

import type { MarkmapData } from '../types.mts';

// `markdown-it` 没随包给出类型（要另装 `@types/markdown-it`），而这里只用到它渲染器的
// 两处签名：按用到的形状声明，并把 `wrapFunction` 的类型参数钉成它，不让它退化成 any。
type RenderToken = { type?: string };
type RenderAttrs = (token: RenderToken) => string;
// 原生 HTML 那两格渲染规则：收整份 tokens 与下标（其余参数原样转发），交回渲染好的 HTML。
type RenderRule = (
  tokens: unknown[],
  idx: number,
  ...rest: unknown[]
) => string;

/**
给原生 HTML 里的 `<a>` 开标签补 `target="_blank"`。markdown-it 开了 `html:true`，作者手写的
`<a href>` 走 `html_inline` / `html_block` 那两格、content 就是原文，不经 `renderAttrs`，
所以在那两格的渲染结果上补。已写过 target 的不动（尊重作者）；`<abbr>` / `<article>` 这类
别的标签不碰。属性段按引号配对收，免得属性值里那个 `>` 把开标签提前截断。
*/
function addTargetToAnchors(html: string): string {
  return html.replaceAll(/<a(?:\s(?:[^>"']|"[^"]*"|'[^']*')*)?>/giu, (match) =>
    /\btarget\s*=/iu.test(match)
      ? match
      : match.replace(/>$/u, ' target="_blank">'),
  );
}

const transformer = new Transformer([
  ...builtInPlugins.filter((plugin) => plugin.name === 'frontmatter'),
  {
    name: 'target-blank',
    transform(transformHooks) {
      transformHooks.parser.tap((md) => {
        // markmap 的 parser hook 交出来的就是 md 实例本身，改链接行为只能改它的 renderer。
        // markdown 链接走属性函数那一格：link_open 多挂一个 target。
        // eslint-disable-next-line no-param-reassign
        md.renderer.renderAttrs = wrapFunction<[RenderToken], string>(
          md.renderer.renderAttrs as RenderAttrs,
          (renderAttrs, token) => {
            let attrs = renderAttrs(token);

            if (token.type === 'link_open') {
              attrs += ' target="_blank"';
            }

            return attrs;
          },
        );

        // 原生 HTML 链接走 html_inline / html_block 那两格（不经属性函数），在渲染结果上补。
        for (const name of ['html_inline', 'html_block'] as const) {
          // eslint-disable-next-line no-param-reassign
          md.renderer.rules[name] = wrapFunction<
            Parameters<RenderRule>,
            string
          >(md.renderer.rules[name] as RenderRule, (render, ...args) =>
            addTargetToAnchors(render(...args)),
          );
        }
      });

      return {};
    },
  },
]);

// 把 markdown 源码转成 MindChart 需要的渲染数据。返回的 frontmatter 是 markmap
// 自己的那份（含 `markmap` 选项键），不是站点那份。
export function buildMarkmapData(source: string): MarkmapData {
  const { root, features, frontmatter } = transformer.transform(source);
  const { styles, scripts } = transformer.getUsedAssets(features);

  return { root, features, styles, scripts, frontmatter };
}
