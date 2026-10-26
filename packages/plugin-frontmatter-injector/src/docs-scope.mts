import { isAbsolute, relative, resolve } from 'node:path';

import { createAbsoluteFilePathMatcher, posixPath } from '@docusaurus/utils';

/**
 `@docusaurus/plugin-content-docs` 那份选项里管「扫哪些文件」的两格。

 站点可以把 `docs` 选项写在自己的一个预设里（本仓就是 classic 预设里那一份），插件在手
 上拿不到 —— 所以这两格由站点转述给本插件（站点配置里点名的那一处）。
*/
export interface DocsScope {
  /** 内容根：相对站点根（仓库根那个 `docs` 就是一格点），默认 `docs` */
  path?: string;
  /** 收哪些文件：相对内容根的 glob，默认 `**\/*.{md,mdx}` */
  include?: string[];
  /** 挡掉哪些：同样相对内容根，默认是官方那一条 `GlobExcludeDefault` */
  exclude?: string[];
}

/** 文档插件的缺省 include，与 `plugin-content-docs` 的 `DEFAULT_OPTIONS.include` 同值 */
export const DEFAULT_INCLUDE = ['**/*.{md,mdx}'];

/** 本插件不再往哪里注入（`git-new` / `git-update` 也就不会出现在那些文件上） */
export interface Scope {
  /** 内容根的绝对路径，正斜杠 */
  contentPath: string;
  /** 收不收这份文件：绝对路径，或相对内容根的路径；分隔符两种都认 */
  covers(filePath: string): boolean;
}

/** 统一成一种写法：`relative()`、路径比较、`include` 匹配都只面对正斜杠 */
function normalize(path: string): string {
  return posixPath(path.replaceAll('\\', '/'));
}

/**
 一份内容根：`from`（站点根或仓库根）与 `path` 拼起来。站点不在 git 里时 `from` 也是站点根 ——
 有没有历史是一件事，这份文件归不归文档插件管是另一件事。
*/
export function docsContentPath(from: string, { path = 'docs' }: DocsScope) {
  return normalize(resolve(from, path));
}

/**
 把「内容根 + `include` / `exclude`」折成一个判定。口径与 docs 插件自己扫文件时同源：都走
 `@docusaurus/utils` 的 `createAbsoluteFilePathMatcher`（`Globby` 底下的 micromatch）。

 用官方的匹配器而不是自己写一遍，是因为文档插件那一步就是 `Globby(include, {cwd: 内容根,
 ignore: exclude})`，两边同源靠的是匹配器外面那两格：绝对路径按「相对内容根」折（官方匹配器
 只认自己那棵根，喂别处的路径直接抛），以及 `exclude` 压过 `include`。glob 语义本身是同一个
 引擎（`Globby` 底下就是 micromatch），不是要复刻的东西。

 `include` 的缺省跟着官方走（`**\/*.{md,mdx}`）：站点没转述时至少「md 才算页面」这条还在。
 `exclude` 不兜默认值 —— 官方缺省那几条（`**\/_*` / `**\/__tests__`）是「扫描时顺手跳过」，
 不是「这些文件不归文档插件管」。
*/
export function createScope(
  contentPath: string,
  options: DocsScope = {},
): Scope {
  // 与 `covers()` 那一句同一个形状：根也过一遍 `resolve()`，否则 Windows 上「站点根没盘符、
  // 文件路径有盘符」这一对会互相认不出来。
  const root = normalize(resolve(contentPath));
  const included = createAbsoluteFilePathMatcher(
    options.include ?? DEFAULT_INCLUDE,
    [root],
  );
  const excluded = createAbsoluteFilePathMatcher(options.exclude ?? [], [root]);

  return {
    contentPath: root,
    covers(filePath: string) {
      // 两种写法都先 `resolve()` 再归一：Windows 上 `'/site/docs/a.md'` 这种「没有盘符的绝对路径」
      // 会被 `path.win32.resolve()` 补成当前盘（`D:/site/...`），而 `relative()` 也照样补 ——
      // 少补这一边，两边就不是同一形状，官方匹配器那句 `startsWith(rootFolder + '/')` 会直接抛。
      const path = normalize(
        resolve(isAbsolute(filePath) ? filePath : resolve(root, filePath)),
      );
      // 内容根之外的路径交给官方匹配器会抛（它只认自己那棵根），先自己判一下
      const inside = relative(root, path);

      return (
        !(inside.startsWith('..') || isAbsolute(inside)) &&
        included(path) &&
        !excluded(path)
      );
    },
  };
}
