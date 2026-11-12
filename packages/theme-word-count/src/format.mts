import path from 'node:path';

/**
一页最终按哪一族语法数：取值与 `@docusaurus/mdx-loader` 的 `Format` 同。

站点按 `markdown.format`（配置项）与页面 frontmatter 的 `format`（覆盖）决定一份 md 是按
CommonMark（`md`）还是按 MDX（`mdx`）编译；`md` 下 `{…}`、`<Tag>`、`import` 是正文文字 / 原样 HTML，
`mdx` 下它们是表达式 / JSX / ESM，不进 `text`。字数要跟着渲染走，所以这一层得先判出同一格。
*/
export type MarkdownFormat = 'md' | 'mdx';

/** frontmatter 与站点配置那两格能写的取值；`detect` 表示「交给扩展名定」。 */
export type FormatInput = MarkdownFormat | 'detect';

/**
复刻 `@docusaurus/mdx-loader` `lib/format.js` 的 `mdFormatExtensions`：这些扩展名按 `md` 判，
其余一律偏向 `mdx`。

官方那份 `getFormat` 没从包出口暴露（入口只出 `mdxLoader` / `createMDXLoaderRule` / 类型），
`@docusaurus/mdx-loader/lib/format` 又不是一条对外承诺的可导入路径（`exports` 不含它，直接引迟早
`ERR_PACKAGE_PATH_NOT_EXPORTED`），所以这里照它的名单与真值表复算一份，改动跟着官方走，
由 `test/word-count.test.mts` 的整张真值表钉着 —— 上游改了取值或名单，那张表会红。
*/
const MD_FORMAT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.mdown',
  '.mkdn',
  '.mkd',
  '.mdwn',
  '.mkdown',
  '.ron',
]);

/** 按文件扩展名判 md / mdx（官方那条「未知扩展名偏向 mdx」）。 */
function formatByExtension(filePath: string): MarkdownFormat {
  return MD_FORMAT_EXTENSIONS.has(path.extname(filePath)) ? 'md' : 'mdx';
}

/**
这一页按哪一族语法数：frontmatter 的 `format` 优先，其次站点 `markdown.format`，两处都是
`detect`（或没写）时落到扩展名。逐格与官方 `getFormat` 同形。

`siteFormat` 在真实站点里恒有值（配置项有默认 `mdx`），这里容 `undefined` 只为了判据总有个落点：
缺省按 `detect` 处理，交给扩展名。
*/
export function resolveFormat(params: {
  filePath: string;
  frontMatterFormat?: FormatInput;
  siteFormat?: FormatInput;
}): MarkdownFormat {
  const { filePath, frontMatterFormat, siteFormat } = params;

  if (frontMatterFormat) {
    return frontMatterFormat === 'detect'
      ? formatByExtension(filePath)
      : frontMatterFormat;
  }

  return siteFormat && siteFormat !== 'detect'
    ? siteFormat
    : formatByExtension(filePath);
}
