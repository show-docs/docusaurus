/** `md-diff-loader` 追加到 md 编译结果里的那份数据，键名与 `export const diff` 一致。 */
export interface DiffData {
  /** 仓库相对路径，也是差异视图上方那一行显示的文件名 */
  fileName: string;
  /** `git diff` 的原文：`diff --git` 头部加各段 hunk，交给 `DiffFile` 解析 */
  diff: string;
  /** 上一次改动之前这份文件的内容，用于补全视图里未变化的上下文 */
  old: string;
}

/**
webpack 跑 loader 时确实把这几件挂在了 loader 上下文上（`lib/module/NormalModule.js` 的
JSDoc 里就是这么声明的），但它对外发布的 `LoaderContext` 类型只拼了 loader-runner 那一半，
取不到这几个成员。按运行时用到的形状补一次，不改 `LoaderContext` 本身。
*/
export interface LoaderContextExtras {
  emitWarning: (warning: string | Error) => void;
}
