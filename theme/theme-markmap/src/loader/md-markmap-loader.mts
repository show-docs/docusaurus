import fs from 'node:fs';

import type { LoaderContext } from 'webpack';

import { buildMarkmapData } from './markmap-data.mjs';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const MARKMAP_KEY = /^markmap\s*:/m;

// `enforce: 'post'` loader：跑在 `@docusaurus/mdx-loader` 之后，收到的 `source` 是
// 编译好的 MDX 模块。frontmatter 的判据从磁盘上的源文件读，不去解析生成代码里的
// `export const frontMatter = …`（那是 Docusaurus 的内部格式，随版本变）。
export default function loader(
  this: LoaderContext<unknown>,
  source: string,
): void {
  this.cacheable();

  const callback = this.async();

  const raw = fs.readFileSync(this.resourcePath, 'utf8');

  const frontMatterBlock = FRONT_MATTER.exec(raw)?.[1];
  if (!frontMatterBlock || !MARKMAP_KEY.test(frontMatterBlock)) {
    callback(null, source);
    return;
  }

  let data;
  try {
    data = buildMarkmapData(raw);
  } catch (error) {
    // `transform()` 抛的就是 Error（markdown-it / markmap 自己），这里只是把 `catch` 到的
    // unknown 交回 webpack 回调要的签名
    callback(error as Error);
    return;
  }

  // `markmap: false` 视为没开启；值是对象时它同时是 markmap 的渲染选项
  if (!data.frontmatter?.markmap) {
    callback(null, source);
    return;
  }

  callback(
    null,
    `${source}\nexport const markmap = ${JSON.stringify(data)};\n`,
  );
}
