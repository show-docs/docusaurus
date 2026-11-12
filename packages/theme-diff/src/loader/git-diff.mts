import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/**
一次 git 调用的输出。用参数数组而不是拼命令串：路径里带空格或引号时拼串会被 shell 拆开，
`git log` 那步还会把别人的路径当成参数。

`core.quotepath=false` 显式关：默认会把非 ASCII 路径转义成 `"\346\226\207…"`，那串转义文本
与真实路径对不上 —— 改名那条拿旧名去 `git show` 会读不到（与 theme-git-badge 同口径）。
`maxBuffer` 给足：默认 1 MB，大文件的 `git show` / `git diff` 会先于 git 把 Node 撑爆（ENOBUFS）。

`trim` 默认去掉首尾空白（路径、哈希、差异原文都该去）；读文件内容（`git show`）那一格传
`false`：那份内容的首尾空行与结尾换行是文件本身的一部分，trim 掉会让视图展开上下文时行号错位。
*/
function git(args: string[], cwd: string, trim = true): string {
  const out = execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  return trim ? out.trim() : out;
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
  /** `git diff` 原文：左边是上一个版本，右边是磁盘上此刻这一份 */
  diff: string;
  /** 上一个版本那份内容；这份文件才出现、还没有上一个版本可读时是空串 */
  old: string;
}

/** 一次 `git diff` 的产出：差异原文，加上 `--name-status` 那两格。 */
interface Change {
  diff: string;
  /** 改动类型（`M`、`A`、`R100` 这种）；`--name-status` 没输出时它就没有这一格 */
  type: string | undefined;
  /** 重命名那条给的旧名；不是重命名就没有这一格 */
  oldName: string | undefined;
}

/**
一次对比的两端，写成参数数组里那一段：`['--follow', 上一个, 'HEAD']` 比历史两个提交，
`['HEAD']` 让 git 拿那次提交比工作区。差异与状态各问一次。

`--name-status` 在重命名那条给的是旧名；新增（`A`）没有旧版本可读，所以类型先拿出来，
由调用方决定去哪里读左边那一份。
*/
function changeBetween(
  revs: string[],
  pathFromRoot: string,
  repoRoot: string,
): Change {
  const [type, oldName] = git(
    ['diff', '-M', '--name-status', ...revs, '--', pathFromRoot],
    repoRoot,
  ).split('\t', 2);

  return {
    diff: git(['diff', '-M', ...revs, '--', pathFromRoot], repoRoot),
    type,
    oldName,
  };
}

/**
取「这份文件的上一个版本 → 现在这一份」那一次改动。**右边恒是磁盘上此刻这一份**：工作区里还有
未提交的改动时，那些改动就出现在右边，左边是这份文件上一次被提交的那一版；工作区干净时，此刻
这一份就是它最后一次被提交的结果，于是上一个版本往这份文件自己的历史里再退一次。

历史那一条用 `--follow`，是为了改名之后还能顺着旧名找到上一个版本；工作区那一条不比历史，
用不上它。没有上一个版本可读时返回 `undefined`：这份文件一次都没提交过，或者只提交过一次
且提交之后没有再改。
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

  // 一次都没提交过：磁盘这一份不在历史里，没有上一个版本可对比
  if (commits.length === 0) {
    return undefined;
  }

  const worktree = changeBetween(['HEAD'], pathFromRoot, repoRoot);

  // 有输出就是工作区相对这份文件上一次被提交的那一版还有改动。带 rev 的这种比法只退 0，
  // 退 1 是 `--no-index` 那一条的事（见 `readFilesChange`），这里不用管退出码。
  // `HEAD:<路径>` 取到的正是这份文件最后一次被提交的内容 —— 后面的提交没动过它时，
  // 它在 `HEAD` 里就是那一份。
  if (worktree.diff) {
    // 文件从索引里删了、却又以未跟踪的身份留在磁盘上（`git rm --cached` 后写回，或删了又重建
    // 但没 add）：`git diff HEAD` 只看到「删了」，而右边本该是磁盘此刻这一份。拿 HEAD 那一份与磁盘比。
    if (
      worktree.type?.startsWith('D') &&
      existsSync(join(repoRoot, pathFromRoot))
    ) {
      return headVsDiskChange(pathFromRoot, repoRoot);
    }

    return {
      diff: worktree.diff,
      old: worktree.type?.startsWith('A')
        ? ''
        : git(['show', `HEAD:${pathFromRoot}`], repoRoot, false),
    };
  }

  const prevHash = commits.at(-1);

  // 少于两个提交时，列表里最后一条就是唯一的那一次；工作区又和它一致，就没有上一个版本可对比
  if (!prevHash || commits.length < 2) {
    return undefined;
  }

  // 工作区干净，比的就是这份文件自己那两次提交之间的差异；能取到两次提交，这两版在这条路径上
  // 就必然不同（`git log` 只登记改动过它的那一次），差异不会是空串。
  const last = changeBetween(
    ['--follow', prevHash, 'HEAD'],
    pathFromRoot,
    repoRoot,
  );

  if (last.type?.startsWith('A')) {
    return { diff: last.diff, old: '' };
  }

  const prevPath =
    last.type?.startsWith('R') && last.oldName ? last.oldName : pathFromRoot;

  return {
    diff: last.diff,
    old: git(['show', `${prevHash}:${prevPath}`], repoRoot, false),
  };
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
HEAD 里那一份与磁盘此刻这一份互相比一次：专给「索引里删了、磁盘上却还在（未跟踪）」那种局面。

`git diff HEAD` 看不见未跟踪文件，只会报「删了」；这里把 HEAD 那份内容落到一个临时文件，
交给 `readFilesChange`（`--no-index`）与磁盘比，右边于是仍是磁盘此刻这一份。临时文件用完即删。
磁盘那份按仓库相对路径给（git 认的正斜杠写法），临时那份是绝对地址 —— 差异头部里它会被加上
引号，但视图显示的名字取自 `fileName`（见 `md-diff-loader.mts`），不读头部那一格，所以不外露。
两份内容一样时 `readFilesChange` 给 `undefined`，这里也交回 `undefined`（没有可显示的改动）。
*/
function headVsDiskChange(
  pathFromRoot: string,
  repoRoot: string,
): LastChange | undefined {
  const old = git(['show', `HEAD:${pathFromRoot}`], repoRoot, false);
  const dir = mkdtempSync(join(tmpdir(), 'theme-diff-'));
  const headFile = join(dir, 'head');

  try {
    writeFileSync(headFile, old);
    const diff = readFilesChange(headFile, pathFromRoot, repoRoot);

    return diff === undefined ? undefined : { diff, old };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
