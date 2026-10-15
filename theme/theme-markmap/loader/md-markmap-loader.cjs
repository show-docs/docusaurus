'use strict';

const fs = require('node:fs');

const { buildMarkmapData } = require('./markmap-data.cjs');

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const MARKMAP_KEY = /^markmap\s*:/m;

// `enforce: 'post'` loader：跑在 `@docusaurus/mdx-loader` 之后，收到的 `source` 是
// 编译好的 MDX 模块。frontmatter 的判据从磁盘上的源文件读，不去解析生成代码里的
// `export const frontMatter = …`（那是 Docusaurus 的内部格式，随版本变）。
module.exports = function loader(source) {
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
    callback(error);
    return;
  }

  // `markmap: false` 视为没开启；值是对象时它同时是 markmap 的渲染选项
  if (!data.frontmatter.markmap) {
    callback(null, source);
    return;
  }

  callback(
    null,
    `${source}\nexport const markmap = ${JSON.stringify(data)};\n`,
  );
};
