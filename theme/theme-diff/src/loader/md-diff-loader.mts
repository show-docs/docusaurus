import fs from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import type { LoaderContext } from 'webpack';

import type { DiffData, LoaderContextExtras } from '../types.mts';

import {
  readDiffValue,
  resolveDiffTarget,
  splitDiffValue,
} from './diff-decision.mts';
import {
  findRepoRoot,
  readFilesChange,
  readLastChange,
  repoPathFromRoot,
} from './git-diff.mts';

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
一份文件在它自己 git 历史里的最近一次改动。仓库外、或还没有「上一次改动」时 `undefined`。
仓库相对路径向 git 问（理由见 `repoPathFromRoot`），它同时是视图上方显示的那一个名字。
*/
function buildCommitData(target: string): DiffData | undefined {
  const repoRoot = findRepoRoot(dirname(target));

  if (!repoRoot) {
    return undefined;
  }

  const fileName = repoPathFromRoot(target);
  const lastChange = readLastChange(fileName, repoRoot);

  return (
    lastChange && {
      source: 'commit',
      caption: fileName,
      fileName,
      ...lastChange,
    }
  );
}

/**
两份磁盘文件互相对照（`diff: [旧, 新]`）：地址相对这份 md 所在目录，两边都不必在 git 仓库里。

左边那一份的内容从磁盘读，用来补全视图里未变化的上下文；显示与交给 git 的都是那个相对写法，
所以视图上方那一行与实际比的那两份是同一个来源。写法按 git 的口径换成正斜杠（`relative()` 在
Windows 上给反斜杠，而反斜杠在 pathspec 里是转义符，子目录那一份会读不到）。
没有差别时 `readFilesChange` 给 `undefined`。
*/
function buildFilesData(
  baseDir: string,
  fromTarget: string,
  toTarget: string,
): DiffData | undefined {
  const spec = (target: string): string =>
    relative(baseDir, target).replaceAll('\\', '/');
  const fromSpec = spec(fromTarget);
  const toSpec = spec(toTarget);
  const diff = readFilesChange(fromSpec, toSpec, baseDir);

  if (diff === undefined) {
    return undefined;
  }

  return {
    source: 'files',
    caption: `${fromSpec} → ${toSpec}`,
    fileName: fromSpec,
    diff,
    old: fs.readFileSync(fromTarget, 'utf8'),
  };
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

  // 这一页不渲染差异视图：告警一句，正文原样交回
  const skip = (warning: string): void => {
    this.emitWarning(warning);
    callback(null, source);
  };

  const spec = splitDiffValue(value);

  if (spec.kind === 'invalid') {
    skip(
      `frontmatter 的 diff 写成 [a, b] 时要正好两份，这一页不渲染差异视图：${value}`,
    );
    return;
  }

  // 地址一律相对这份 md 所在目录（`diff: true` 就是本文自己）
  const baseDir = dirname(this.resourcePath);

  try {
    if (spec.kind === 'pair') {
      const sides = ['旧', '新'] as const;
      const targets = [
        resolve(baseDir, spec.from),
        resolve(baseDir, spec.to),
      ] as const;
      const missing = targets.findIndex((target) => !fs.existsSync(target));

      if (missing !== -1) {
        skip(
          `frontmatter 的 diff 写成两份，${sides[missing]}那一份不存在，这一页不渲染差异视图：${targets[missing]}`,
        );
        return;
      }

      const pair = buildFilesData(baseDir, targets[0], targets[1]);

      if (!pair) {
        skip(`${spec.from} 与 ${spec.to} 没有差别，这一页不渲染差异视图`);
        return;
      }

      callback(
        null,
        `${source}\nexport const diff = ${JSON.stringify(pair)};\n`,
      );
      return;
    }

    const target = resolveDiffTarget(spec.value, this.resourcePath);

    if (!fs.existsSync(target)) {
      skip(`frontmatter 的 diff 指向 ${spec.value}，这个文件不存在：${target}`);
      return;
    }

    const data = buildCommitData(target);

    if (!data) {
      skip(
        `${spec.value} 没有可对比的上一次改动（不在 git 仓库里，或只提交过一次），这一页不渲染差异视图`,
      );
      return;
    }

    callback(null, `${source}\nexport const diff = ${JSON.stringify(data)};\n`);
  } catch (error) {
    // git 本身出问题（仓库损坏、git 不在 PATH）只让这一页少一块视图，不让整站构建失败。
    // 抛出来的是 Error（`execFileSync` 与下面的读取都是），这里只是把 `catch` 到的 unknown
    // 取回一句可读的消息。
    skip(
      `读取 ${value} 的 git 历史失败，这一页不渲染差异视图：${(error as Error).message}`,
    );
  }
}
