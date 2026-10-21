# theme-diff 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、`git` 那几步怎么调、取不到历史时的几种落点、
以及这份数据被 webpack 缓存到哪一格。使用者要看的（怎么触发、对比的是哪份文件、有哪些局限）
在 [`README.md`](../README.md)，这里不重复。

## 组成

| 文件                            | 编译吗              | 职责                                                                                              |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| `src/index.mts`                 | ✅ `src/` → `dist/` | 入口：给出层目录、把那条 `enforce: 'post'` loader 挂到 `.md` 上、交出样式表与本包的 babel 规则    |
| `src/loader/diff-decision.mts`  | ✅                  | 纯函数两把：frontmatter 里 `diff:` 那把键的读法（`true` / 路径 / 引号 / `false`）、目标路径怎么解 |
| `src/loader/git-diff.mts`       | ✅                  | `git` 调用：找仓库根、取「最近一次改动」的 diff 与改动之前那份内容                                |
| `src/loader/md-diff-loader.mts` | ✅                  | `enforce: 'post'` 那一步：从磁盘上的源文件读判据，把结果追加成一条 `export const diff`            |
| `src/types.mts`                 | ✅（只出类型）      | `DiffData`（追加的那条导出的形状）与 `LoaderContextExtras`                                        |
| `theme/DocItem/index.tsx`       | ❌ 站点编译         | 本层那一格：命中就把视图摆在 `DocItem` **前面**，命不中原样交回                                   |
| `components/diff-view.tsx`      | ❌ 站点编译         | 浏览器侧：把 `git diff` 原文交给 `@git-diff-view/react`，配色跟站点的亮暗模式                     |
| `components/error-boundary.tsx` | ❌ 站点编译         | 初始化失败时那一条提示（三条视图层各有一份，见「跨包副本」）                                      |
| `components/hack-style.tsx`     | ❌ 站点编译         | 那一格正文容器需要的样式补丁（同上，三份逐字相同）                                                |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

## `git` 那三步

全在构建期，用 `execFileSync('git', 参数数组, { cwd })`：路径里有空格或引号时拼命令串会被
shell 拆开，`git log` 那一步还会把别人的路径当成参数。

1. `rev-parse --show-toplevel`（在目标文件所在目录跑）—— 仓库根；跑不起来就是「不在仓库里」。
2. `log --format=%H --follow -n 2 -- <仓库相对路径>` —— 动过这份文件的最后两个提交。
   少于两条就没有可对比的上一个版本：`--follow` 是改名之后还能顺着旧名找回去，
   列表里最后一条就是唯一那一次时，它自己就是「最近一次改动」，没有上一个。
3. `diff -M --follow <prev> HEAD -- <路径>` 拿差异；`--name-status` 那一步拿这次改动的类型与
   旧名（重命名时旧名在那一条里），新增（`A`）没有旧版本可读，其余用 `show <prev>:<路径>` 取。

仓库相对路径按 git 的口径把反斜杠换成正斜杠：git 在 Windows 上打出的也是正斜杠，
而这一串同时是视图上方显示的那一个文件名。

## 取不到历史时的几种落点

`md-diff-loader` 只有四种结果，每种都让这一页照常渲染正文：

| 情况                                          | 落点                                   |
| --------------------------------------------- | -------------------------------------- |
| frontmatter 没有 `diff:` 这把键               | 原样交回，什么都不追加，也不告警       |
| 写了路径但那个文件在磁盘上不存在              | 一条告警（带解析出来的绝对路径）       |
| 不在 git 仓库里，或这份文件只提交过一次       | 一条告警，说清是「没有可对比的上一次」 |
| `git` 本身出问题（仓库损坏、`git` 不在 PATH） | 一条告警，带 `git` 那句消息            |

三条告警都走 `this.emitWarning()`：只让这一页少一块视图，不让整站构建失败。
`LoaderContextExtras` 补的就是 `emitWarning` 这一件 —— webpack 跑 loader 时确实挂在上下文上，
但它对外发布的 `LoaderContext` 类型只拼了 loader-runner 那一半。

## 这份数据缓存到哪一格

差异是 loader 的产物，所以走 webpack 的模块缓存，输入只有这份 `.md` 自己：
「又提交了一次」不会让它重算，改动这份 md 或清掉构建缓存才会。这一格写进了 README 的
「已知限制」，改 loader 的入参时记得两边一起改。

## 厂商那份视图

`@git-diff-view/react` 的解析与展开都在 `DiffFile` 实例里做，换一份数据就重建、不做增量。
两处踩过的点：

- `setEnableFastDiffTemplate()` 是**全局**设置，且要在 `DiffFile.createInstance()` 之前设；
  放在 `useMemo` 里，重建实例前再设一遍没有代价。
- 展开与并排用 `onAllExpand('split')` 加 `DiffModeEnum.SplitGitHub`，视图写死在组件里，
  不做成选项。

## 用例与红线

- 构建期判据：`test/theme-diff.test.mts` —— 真 git 仓库（临时目录里真提交），
  `src/loader/` 三份挂在覆盖率红线上（`vitest.config.mts` 的 `coverage.include`）。
- 页面上那块视图：`test/e2e/features/diff.feature`。**不**断言具体改了哪几行 ——
  那是最近一次提交的内容，下一笔提交就会变。
- 跨包副本：`test/view-layer-copies.test.mts` 钉住 `hack-style.tsx` 三份逐字相同、
  `error-boundary.tsx` 与 `theme/DocItem/index.tsx` 只允许差在本层自己的名字与说法上，
  另钉两条 md loader 的 frontmatter 正则同口径、「键名 = 追加的导出名」。
