import { wrapFunction } from 'markmap-common';
import { Transformer, builtInPlugins } from 'markmap-lib';

import type { MarkmapData } from '../types.mts';

// `markdown-it` 没随包给出类型（要另装 `@types/markdown-it`），而这里只用到它渲染器的
// 一处签名：按用到的形状声明，并把 `wrapFunction` 的类型参数钉成它，不让它退化成 any。
type RenderToken = { type?: string };
type RenderAttrs = (token: RenderToken) => string;

const transformer = new Transformer([
  ...builtInPlugins.filter((plugin) => plugin.name === 'frontmatter'),
  {
    name: 'target-blank',
    transform(transformHooks) {
      transformHooks.parser.tap((md) => {
        // markmap 的 parser hook 交出来的就是 md 实例本身，改链接行为只能改它的 renderer
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
