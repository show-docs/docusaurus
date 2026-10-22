/** `md-diff-loader` 追加到 md 编译结果里的那份数据，键名与 `export const diff` 一致。 */
export interface DiffData {
  /**
  这份差异从哪儿来：`commit` 是同一份文件在 git 里的最近一次改动，`files` 是磁盘上两份文件
  互相对照。视图上方那一行的说法跟着它走。
  */
  source: 'commit' | 'files';
  /**
  视图上方显示的那一个名字：一份文件时就是仓库相对路径，两份文件时是 `old → new`。
  */
  caption: string;
  /**
  左边那一份（改动之前）的文件名，也是语法高亮取后缀的那一个。两份文件对照时它是 `old` 那一份，
  右边那一份的名字在 `git diff` 原文的头部里。
  */
  fileName: string;
  /** `git diff` 的原文：`diff --git` 头部加各段 hunk，交给 `DiffFile` 解析 */
  diff: string;
  /**
  左边那一份的内容，用于补全视图里未变化的上下文：`commit` 是上一次改动之前那份，
  `files` 就是 `old` 那一个键给的那一份。
  */
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
