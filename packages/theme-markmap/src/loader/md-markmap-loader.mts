import fs from 'node:fs';

import type { LoaderContext } from 'webpack';

import { DEFAULT_PARSE_FRONT_MATTER } from '@docusaurus/utils';

import { buildMarkmapData } from './markmap-data.mts';

/** 一个可以按键取的对象：整段 frontmatter 是标量或数组时不是，那一格里也没有这把键。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
「这一页开没开导图」：官方那份 frontmatter 里那把键的形状，与站点那条规则判的同一个 ——
`{ key: 'markmap', match: 'options' }` 只认真布尔 `true` 或一个选项对象。
文本、数字、数组那些写法站点判不成导图页，这里也就不生成数据。
*/
function markmapOn(frontMatter: unknown): boolean {
  // 官方解析失败或整段是个标量时，交回的是那串原文而不是对象：不算写了这把键
  if (!isRecord(frontMatter)) {
    return false;
  }

  const { markmap } = frontMatter;

  return markmap === true || isRecord(markmap);
}

// `enforce: 'post'` loader：跑在 `@docusaurus/mdx-loader` 之后，收到的 `source` 是
// 编译好的 MDX 模块。frontmatter 的判据从磁盘上的源文件读，但读法用**官方那一条**
// （`DEFAULT_PARSE_FRONT_MATTER`：docs 插件没换读法时用的就是它），不去解析生成代码里的
// `export const frontMatter = …`（那是 Docusaurus 的内部格式，随版本变）—— 站点那边那条规则
// 读的也是官方解析之后的那一整份，两套判据分叉时「页面判成导图页、数据却没生成」就是静默的半块视图。
export default function loader(
  this: LoaderContext<unknown>,
  source: string,
): void {
  this.cacheable();

  const callback = this.async();

  markmapModule(this, source)
    .then((output) => callback(null, output))
    // `transform()` 抛的就是 Error（markdown-it / markmap 自己），这里把它交回 webpack；
    // 源文件读不到也走这一条。少这一句，回调永远不会被调用，webpack 会一直等这一页。
    .catch((error: unknown) => callback(error as Error));
}

/** 这一页最终的模块文本：开了导图就在末尾追加一条 `export const markmap`，否则原样交回。 */
async function markmapModule(
  context: LoaderContext<unknown>,
  source: string,
): Promise<string> {
  const raw = fs.readFileSync(context.resourcePath, 'utf8');

  // 官方那一条读的是磁盘上这一份；整段 frontmatter 解析不了就当「没写这把键」——
  // 真到构建里，mdx-loader 在那一步已经先报错了。
  const { frontMatter } = await DEFAULT_PARSE_FRONT_MATTER({
    fileContent: raw,
    filePath: context.resourcePath,
  }).catch(() => ({ frontMatter: undefined as unknown }));

  if (!markmapOn(frontMatter)) {
    return source;
  }

  // 交回的 `data.frontmatter` 是 markmap 自己那份（渲染选项的来源，含 `markmap` 那把键）；
  // 「开没开」已经按官方那份判过了，这里不再判第二遍。
  return `${source}\nexport const markmap = ${JSON.stringify(buildMarkmapData(raw))};\n`;
}
