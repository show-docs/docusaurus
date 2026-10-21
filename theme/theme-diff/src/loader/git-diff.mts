import { execFileSync } from 'node:child_process';

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

export interface LastChange {
  /** `git diff` 原文 */
  diff: string;
  /** 改动之前那份内容；文件在这一次才出现时是空串 */
  old: string;
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
