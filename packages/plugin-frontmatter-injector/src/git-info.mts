import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';

/** 一次 git 调用的输出（去掉首尾空白）。用参数数组而不是拼命令串 */
function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** 「最近」的第二个口径：落在全仓最后 5 个 commit 里 */
export const RECENT_COMMITS = 5;

/**
 「最近」的第一个口径：7 天内。交给 `git log --since`，**不带 `--max-count`** ——
 带上它就成了「最后 5 个提交里还落在窗内的」，两条口径会被悄悄并成一条。
*/
export const RECENT_WINDOW = '7 days ago';

const POSIX = (path: string) => path.replaceAll('\\', '/');

/** 这份文件在 git 里的两件事 */
export interface GitTimes {
  /** 这份文件只有一次提交时，那一次的时刻（秒）；提交过两次以上就不算「新」了 */
  created: number | undefined;
  /** 最后一次被提交的时刻（秒）；一次都没提交过是 `undefined` */
  updated: number | undefined;
}

/** 本次构建唯一要读的那个 git 仓库 */
export interface Repo {
  /** 仓库根：已解析软链、正斜杠 */
  root: string;
  /** 最近一次提交的时刻（秒）；空仓库、或 git 跑不起来时 `undefined` */
  head: number | undefined;
  /** 最近那五个提交里动过的文件，仓库相对路径（正斜杠） */
  recent: ReadonlySet<string>;
  /** 逐文件读过的两个时刻。这就是那个「只读一次」的缓存 */
  times: Map<string, GitTimes>;
}

/** 一份文件的时刻表；不在仓库里就整份空着 */
export const noTimes: GitTimes = { created: undefined, updated: undefined };

/**
 仓库根：从 `cwd` 往上找，并解析软链。`/tmp` 在 macOS 上是 `/private/tmp` 的软链，
 Docusaurus 给的路径与 `git rev-parse` 给的那一条，得先站在同一套写法上才比得了。
 不在仓库里就 `undefined` —— 那时注入整块静默关掉。
*/
export function findRepoRoot(cwd: string): string | undefined {
  // git 退出 128（不在仓库里、仓库坏了）与「git 不在 PATH」是同一件事：这条构建没有 git
  // 可用。用 `spawnSync` 而不是 `execFileSync`：后者遇到非 0 退出码就抛，而这几种都不是异常
  const { stdout } = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  });
  // `cwd` 不存在时进程根本没起来，`stdout` 是 `null`（`spawnSync` 的 error 那格）；
  // 这和「不在仓库里」是同一件事：这条构建没有 git 可用。
  const root = (stdout ?? '').trim();

  // 软链要解析掉：`/tmp` 在 macOS 上是 `/private/tmp` 的软链，Docusaurus 给的路径与 git 给的
  // 这一条得站在同一套写法上才比得了
  return root === '' ? undefined : POSIX(realpathSync(root));
}

/** `git log` 的输出切段：一段 = 一次提交，头一行是时刻（`%x01` 是段首，`%ct` 是秒） */
function splitCommits(log: string): { time: number; files: string[] }[] {
  return log
    .split('\u{1}')
    .filter(Boolean)
    .map((block) => {
      const [time, ...files] = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      return { time: Number(time), files };
    });
}

/**
 初始化阶段一起读掉的那一下：HEAD 的时刻 + 最近动过的那些文件。

 两次 `git log`，两条口径各一次：

 - `--max-count` 那条：全仓最后 {@link RECENT_COMMITS} 个提交，与时间无关；
 - `--since` 那条：窗口内的全部提交（**不能**同时带 `--max-count`，见常量注释）。

 两次都不带路径 —— 这就是「一次读所有 docs 的 git 情况」：路径只在后面逐份文件时才出现，
 而答案大多也在这里就齐了（窗口内的文件、最后五个提交动过的文件）。
*/
export function openRepo(root: string): Repo {
  const at = (extra: string[]) =>
    splitCommits(
      git(['log', ...extra, '--format=%x01%ct', '--name-only'], root),
    );
  const latest = at([`--max-count=${RECENT_COMMITS}`]);
  const window = at([`--since=${RECENT_WINDOW}`]);

  return {
    root,
    head: latest[0]?.time,
    recent: new Set([...latest, ...window].flatMap(({ files }) => files)),
    times: new Map(),
  };
}

/**
把这条路径的**目录**那一段解析掉软链，文件名那一截原样留着。

 两边要比的是同一件事：仓库根是解析过的（见 {@link findRepoRoot}），传进来的文件路径若
 还带着软链，两边就不在同一种写法上 —— `relative` 算出来的差会带着 `..`，每份文件都被
 判成「不在这个仓库里」，标签一个都补不上。

 只解析目录：文件自己可能是个软链，而 git 记下的是**那个软链**（它的路径），不是软链
 指向的地方 —— 把最后一截也解析掉，路径反而与 git 记的不一样了。

 目录可能压根不存在（生成出来的文件）：那就找出最深的那一层存在的祖先目录，解析它，再把
 底下那几段按原序接回去。
*/
function realpathOfDir(filePath: string): string {
  const absolute = resolve(filePath);
  const base = basename(absolute);
  const { root } = parse(absolute);

  // 从文件系统根往下逐段走：走得到的那几段构成「最深的存在的祖先目录」，走不到的（目录
  // 不存在）按原序记下来，最后整体接在解析过的那一层底下。
  let current = root;
  const missing: string[] = [];
  const segments = relative(root, dirname(absolute)).split(sep).filter(Boolean);

  for (const segment of segments) {
    const next = join(current, segment);

    try {
      // `native` 展开 8.3 短名（Windows CI 的 `%TEMP%` 就是短名形式），与 git 给的长名同口径
      realpathSync.native(next);
      current = next;
    } catch {
      // 这一段不存在：底下那几段也不可能存在（父目录都没有），于是原样记下来
      missing.push(segment);
    }
  }

  return POSIX(join(realpathSync.native(current), ...missing, base));
}

/** 绝对路径 → 仓库相对路径；不在这个仓库里就 `undefined` */
export function repoPath(repo: Repo, filePath: string): string | undefined {
  const path = relative(repo.root, realpathOfDir(filePath));

  // 越界有两种写法：`..` 开头，或（Windows 上跨盘）直接回一条绝对路径 —— 上面那句注释说的就是这一对
  return path.startsWith('..') || isAbsolute(path) ? undefined : POSIX(path);
}

/**
 一份文件的两个时刻，**一次 `git log` 拿到**。

 `%ct` 一行一个提交（`git log` 默认倒序），所以行数就是「提交过几次」，第一行就是最近那次。
 不数 `--name-only` 的文件名行：重命名那一步会同时吐新旧两个名字，而 `--follow` 更早的提交
 里只有旧名 —— 按名字过滤计数会把历史数少，把重命名过的文件误判成「只提交过一次」。
 只提交过一次，那一次既是「创建」也是「更新」；两次以上就只有「更新」。
*/
function readTimes(repo: Repo, path: string): GitTimes {
  const commits = git(
    ['log', '--follow', '--format=%ct', '--', path],
    repo.root,
  )
    .split('\n')
    .filter(Boolean)
    .map(Number);

  if (commits.length === 0) {
    return noTimes;
  }

  const [updated] = commits;

  return { created: commits.length === 1 ? updated : undefined, updated };
}

/**
 逐文件的两个时刻，读过一次就记住（`index` 回读时会拿着同一批路径再来问一遍）。
 不在仓库里的文件（生成出来的、或压根不在 git 管辖下）当它没有历史。
*/
export function timesOf(repo: Repo, filePath: string): GitTimes {
  const path = repoPath(repo, filePath);

  if (path === undefined) {
    return noTimes;
  }

  const cached = repo.times.get(path);

  if (cached) {
    return cached;
  }

  const times = readTimes(repo, path);

  repo.times.set(path, times);

  return times;
}
