import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const thisDir = dirname(fileURLToPath(import.meta.url));

export default function theme() {
  return {
    name: '@show-docs/docusaurus-theme-markmap',
    getThemePath() {
      return resolve(thisDir, './theme');
    },
    configureWebpack() {
      return {
        module: {
          rules: [
            {
              test: /\.markmap$/,
              loader: require.resolve('./loader/markmap-loader.cjs'),
            },
            {
              // md 由官方 mdx-loader 编译，这里只能在其产物后追加导出
              enforce: 'post',
              test: /\.md$/,
              loader: require.resolve('./loader/md-markmap-loader.cjs'),
            },
          ],
        },
      };
    },
  };
}
