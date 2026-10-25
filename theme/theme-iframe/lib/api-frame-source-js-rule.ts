/**
本包那条 `.tsx?` babel 规则要不要真去接管一个文件。

## 为什么会有这条规则

官方那条 babel 规则按 `excludeJS` 排除整个 `node_modules`、只给 `docusaurus*.js` 开例外，
所以装了 npm 包之后本仓那些**未编译**的 `.tsx` 会报 `Module parse failed`。补一条覆盖包根的规则
把这一格接上。

## 为什么要判一下

工作区里 pnpm 的软链把源码解析到 `node_modules` 之外，**官方那条规则本来就会编译它们**；我们的规则
再命中一次，babel 就对同一份文件跑第二遍。产物不变，只是白花一遍编译时间。

所以只在官方规则放行的范围之外才认领，判据照 `excludeJS` 抄一份：

- 落在包根之外的，不碰；
- 不带 `.ts` / `.tsx` 的，不碰（同一条规则里的 md、css 归别的规则）；
- 路径里不带 `node_modules` 的，官方本来就在编，交回去；
- 带 `node_modules` 但文件名是 `docusaurus…js[x]` 的，官方给过例外，也不抢。

装进真项目时包确实躺在 `node_modules` 里，最后那一格因此仍然成立；判据失效的症状是
`Module parse failed`，一构建就看得见。

这份 `.ts` 与 `lib/api-frame-theme.mts` 一样站在**配置期**：跑在 Node 里（jiti 直接吃源码），
不引 React、不引 DOM。写成 `.ts` 而不是 `.mts` 是因为 `src/` 那两个入口也要用它 ——
它们进 `tsc`，而 `rewriteRelativeImportExtensions` 只改相对路径的扩展名。
*/

import { isAbsolute, relative } from 'node:path';

const DOT_TS = /\.tsx?$/;

/** 官方 `excludeJS` 里那条例外：`node_modules` 下只有 `docusaurus*.js[x]` 由它自己编译。 */
const DOCUSAURUS_JS = /docusaurus(?:(?!node_modules).)*\.jsx?$/;

export function needsSiteJsRule(
  packageRoot: string,
  modulePath: string,
): boolean {
  const packageRelative = relative(packageRoot, modulePath);
  const inPackage =
    packageRelative === '' ||
    (!packageRelative.startsWith('..') && !isAbsolute(packageRelative));

  return (
    DOT_TS.test(modulePath) &&
    inPackage &&
    modulePath.includes('node_modules') &&
    !DOCUSAURUS_JS.test(modulePath)
  );
}
