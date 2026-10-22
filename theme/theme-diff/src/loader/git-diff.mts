import { execFileSync } from 'node:child_process';
import { basename, dirname } from 'node:path';

/**
一次 git 调用的输出（去掉首尾空白）。用参数数组而不是拼命令串：路径里带空格或
引号时拼串会被 shell 拆开，`git log` 那步还会把别人的路径当成参数。
*/
function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** 从这份文件所在目录往上找仓库根；不在任何 git 仓库里时返回 `undefined`。 */
export function findRepoRoot(cwd: string): string | undefined {
  try {
    return git(['rev-parse', '--show-toplevel'], cwd);
  } catch {
    return undefined;
  }
}

/**
这份文件在仓库里的相对路径（`docs/a.md` 这种），**向 git 自己问**：`--show-prefix` 以文件
所在目录为 cwd，返回的那一段就是 git 认的 pathspec 前缀，正斜杠、带尾斜杠，仓库根上为空串。

为什么不用 `relative(repoRoot, target)`：`repoRoot` 出自 git，`target` 出自 webpack 的
`resourcePath`，两者对**同一个目录**可以给出两种写法。Windows 上 8.3 短名是这条缝的典型
—— 普通 `fs.realpathSync` 不展开短名（`C:\Users\RUNNER~1\…`），git 恒展开成长名
（`C:\Users\runneradmin\…`），逐段比对时第二个段就分叉，`relative()` 于是算出一条
`../../../../../RUNNER~1/…` 的地址，git 随即判定「outside repository」，这一页的差异视图
静默变成一句告警。构建从短名目录起手（`cd C:\PROFIL~1\site`、或检出落在短名 TEMP 里）
的用户会真撞上这一条，不只是测试夹具。

把 cwd 交给 git、由它报前缀，两种写法之间的字符串比较就从代码里消失了。
*/
export function repoPathFromRoot(target: string): string {
  return `${git(['rev-parse', '--show-prefix'], dirname(target))}${basename(target)}`;
}

export interface LastChange {
  /** `git diff` 原文 */
  diff: string;
  /** 改动之前那份内容；文件在这一次才出现时是空串 */
  old: string;
}

/**
两份磁盘文件之间比一次（`git diff --no-index`），**不读 git 历史**，也不要求这两份在仓库里。

两个地址按 `cwd` 的相对写法给（同一目录下的两份文件就是文件名）：git 把收到的写法原样写进
头部，绝对地址会被它加上引号、连盘符一起写进去，视图那边没必要吃那个形状。

没有差别时 git 退 0、输出为空，这里返回 `undefined`。有差别时它**退 1** —— 那不是失败，
`execFileSync` 却把它当错误抛出，差异文本挂在 `error.stdout` 上，取回来即可。

退 1 有两种，靠输出区分：读到差别就有文本，而 `Could not access`（那两份里有一份 git 读不到）
同样是退 1、但输出为空。把后者说成「两份没有差别」是指错了方向，所以它照原样抛出，由调用方按
「git 出问题」那一种落点处理。git 本身跑不起来（不在 PATH、目录不存在）退出码不是 1，也抛出。
*/
export function readFilesChange(
  fromPath: string,
  toPath: string,
  cwd: string,
): string | undefined {
  try {
    git(['diff', '--no-index', '--', fromPath, toPath], cwd);

    return undefined;
  } catch (error) {
    const { status, stdout } = error as { status?: number; stdout?: string };
    const diff = (stdout ?? '').trim();

    if (status !== 1 || !diff) {
      throw error;
    }

    return diff;
  }
}

/**
取「这份文件最近一次改动」：先找出动过它的最后两个提交，再对比这两者之间的差异。
用 `--follow` 是为了改名之后还能顺着旧名找到上一次；没有两个提交（只提交过一次、
或工作区里还没提交）就没有可对比的上一次，返回 `undefined`。
*/
export function readLastChange(
  pathFromRoot: string,
  repoRoot: string,
): LastChange | undefined {
  const commits = git(
    ['log', '--format=%H', '--follow', '-n', '2', '--', pathFromRoot],
    repoRoot,
  )
    .split('\n')
    .filter(Boolean);

  const prevHash = commits.at(-1);

  // 少于两个提交时，列表里最后一条就是唯一的那一次，没有可对比的上一个版本
  if (!prevHash || commits.length < 2) {
    return undefined;
  }

  // 能取到两个提交，这两个版本在这条路径上就必然不同（`git log` 只登记改动过它的那一次），
  // 对比结果不会是空串。
  const diff = git(
    ['diff', '-M', '--follow', prevHash, 'HEAD', '--', pathFromRoot],
    repoRoot,
  );

  // 这一次改动里这份文件原来叫什么：`--name-status` 在重命名那条给的是旧名。
  // 新增（`A`）没有旧版本可读，其余都按当前名取。
  const [type, oldName] = git(
    [
      'diff',
      '-M',
      '--follow',
      '--name-status',
      prevHash,
      'HEAD',
      '--',
      pathFromRoot,
    ],
    repoRoot,
  ).split('\t', 2);

  if (type?.startsWith('A')) {
    return { diff, old: '' };
  }

  const prevPath = type?.startsWith('R') && oldName ? oldName : pathFromRoot;

  return { diff, old: git(['show', `${prevHash}:${prevPath}`], repoRoot) };
}
