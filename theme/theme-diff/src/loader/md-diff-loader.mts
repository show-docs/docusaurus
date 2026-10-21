import fs from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import type { LoaderContext } from 'webpack';

import type { DiffData, LoaderContextExtras } from '../types.mts';

import { findRepoRoot, readLastChange } from './git-diff.mts';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const DIFF_KEY = /^diff[ \t]*:[ \t]*(\S.*)$/m;

/** frontmatter 里那个值：`true`，或加不加引号的路径；`false` 与空值都算没开。 */
function readDiffValue(frontMatterBlock: string): string | undefined {
  const value = DIFF_KEY.exec(frontMatterBlock)?.[1]?.trim();

  if (!value || value === 'false' || value === 'null') {
    return undefined;
  }

  const quoted = /^(['"])(.*)\1$/.exec(value);

  return (quoted?.[2] ?? value).trim();
}

/**
差异数据；仓库外、或这份文件还没有「上一次改动」时返回 `undefined`。
路径按 git 的口径换成反斜杠为正斜杠，仓库相对路径也是视图上方显示的那一行。
*/
function buildDiffData(target: string): DiffData | undefined {
  const repoRoot = findRepoRoot(dirname(target));

  if (!repoRoot) {
    return undefined;
  }

  const fileName = relative(repoRoot, target).replaceAll('\\', '/');
  const lastChange = readLastChange(fileName, repoRoot);

  return lastChange && { fileName, ...lastChange };
}

// `enforce: 'post'` loader：跑在 `@docusaurus/mdx-loader` 之后，收到的 `source` 是
// 编译好的 MDX 模块。frontmatter 的判据从磁盘上的源文件读，不去解析生成代码里的
// `export const frontMatter = …`（那是 Docusaurus 的内部格式，随版本变）。
export default function loader(
  this: LoaderContext<unknown> & LoaderContextExtras,
  source: string,
): void {
  this.cacheable();

  const callback = this.async();

  const raw = fs.readFileSync(this.resourcePath, 'utf8');

  const frontMatterBlock = FRONT_MATTER.exec(raw)?.[1];
  const value = frontMatterBlock && readDiffValue(frontMatterBlock);

  if (!value) {
    callback(null, source);
    return;
  }

  // `diff: true` 对比本文自己；写成路径时相对这份 md 所在目录去找
  const target =
    value === 'true'
      ? this.resourcePath
      : resolve(dirname(this.resourcePath), value);

  if (!fs.existsSync(target)) {
    this.emitWarning(
      `frontmatter 的 diff 指向 ${value}，这个文件不存在：${target}`,
    );
    callback(null, source);
    return;
  }

  try {
    const data = buildDiffData(target);

    if (!data) {
      this.emitWarning(
        `${value} 没有可对比的上一次改动（不在 git 仓库里，或只提交过一次），这一页不渲染差异视图`,
      );
      callback(null, source);
      return;
    }

    callback(null, `${source}\nexport const diff = ${JSON.stringify(data)};\n`);
  } catch (error) {
    // git 本身出问题（仓库损坏、git 不在 PATH）只让这一页少一块视图，不让整站构建失败
    this.emitWarning(
      `读取 ${value} 的 git 历史失败，这一页不渲染差异视图：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    callback(null, source);
  }
}
