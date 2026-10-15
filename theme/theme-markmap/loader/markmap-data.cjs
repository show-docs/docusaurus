'use strict';

const { wrapFunction } = require('markmap-common');
const { Transformer, builtInPlugins } = require('markmap-lib');

const transformer = new Transformer([
  ...builtInPlugins.filter((plugin) => plugin.name === 'frontmatter'),
  {
    name: 'target-blank',
    transform(transformHooks) {
      transformHooks.parser.tap((md) => {
        // markmap 的 parser hook 交出来的就是 md 实例本身，改链接行为只能改它的 renderer
        // eslint-disable-next-line no-param-reassign
        md.renderer.renderAttrs = wrapFunction(
          md.renderer.renderAttrs,
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
function buildMarkmapData(source) {
  const { root, features, frontmatter } = transformer.transform(source);
  const { styles, scripts } = transformer.getUsedAssets(features);

  return { root, features, styles, scripts, frontmatter };
}

module.exports = { buildMarkmapData };
