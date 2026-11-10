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
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    // 整仓那一遍的输出随提交数线性长（本仓 154 个提交约 130 KB）。默认 1 MB 在几千个
    // 提交的仓库上会先于 git 把 Node 撑爆；上限给足，真超了就走 `openRepoFrom()` 的 catch，
    // 与「读不到 git」同一档 —— 少一排徽标，不该让构建失败。
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** 「最近」的第二个口径：落在全仓最后 5 个提交里 */
const RECENT_COMMITS = 5;

/**
「最近」的第一个口径的天数：7 天。基准是**这一次构建打开仓库的那一刻**（`Repo.buildTime`），
不是每问一份文件重读一次墙上时钟 —— 见 {@link isRecent}。
*/
export const RECENT_DAYS = 7;

const DAY = 86_400;

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
  /**
  整仓那一遍建好的时刻表：仓库相对路径 → 提交过几次、最近一次。`timesOf()` 只查它，
  不再起 subprocess。
  */
  times: Map<string, GitTimes>;
  /**
  这一次打开仓库的那一刻（秒）：整场构建里「7 天窗口」唯一的基准。

  每问一份文件重读一次墙上时钟时，同一场构建的两页可以踩在窗口两侧（构建跑过一条秒级边界），
  而整仓那一遍的「7 天内」用的是打开那一刻 —— 两条口径会各按各的「此刻」算。
  */
  buildTime: number;
  /**
  这份检出被 `--depth` 截断过（CI 默认的 depth 1 就是它）。为真时，「历史到此为止」那一条提交
  带来的文件名单与每一行历史都不算信号 —— 见 {@link readHistory}。
  */
  shallow: boolean;
}

/** 一份文件的时刻表；不在仓库里就整份空着 */
export const noTimes: GitTimes = { created: undefined, updated: undefined };

/**
仓库根：从 `cwd` 往上找，并解析软链。`/tmp` 在 macOS 上是 `/private/tmp` 的软链，
Docusaurus 给的路径与 `git rev-parse` 给的那一条，得先站在同一套写法上才比得了。
不在仓库里就 `undefined` —— 那时徽标整块静默关掉。
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

/** 一份文件在整仓历史里的累计 */
interface History {
  /** 可信历史里有几次提交 */
  count: number;
  /** 可信历史里最近那一次的时刻（秒） */
  updated: number;
  /** 这份文件出现在截断点那一条的名单里 —— 更早的历史看不见了 */
  truncated: boolean;
}

/**
整仓读一遍：HEAD、最近动过的文件、每份文件的时刻表，**一条 `git log` 全给**。

```
git --no-pager -c log.showSignature=false log -M \
  --format=%x01%ct%x02%P --name-status
```

- `%x01` 起一段（一段 = 一次提交），`%ct` 是那次提交的时刻，`%x02%P` 是它的父项；
  `--name-status` 每行一条改动，最后一格永远是「这一次提交之后它叫什么」。
- `git log` 默认倒序，所以第一段就是 `HEAD`，段数就是提交次数。`R` 行的中间那格是旧名：
  把旧名接到**现名**上（现名在写入前已经解析过，所以取值只需一跳），更老的提交再遇到旧名时
  就归到现名头上 —— 改过名的文件，整条历史都算在它现在这个名字下。
- `-M` 是显式打开改名检测：仓库自己的 `diff.renames=false` 不该把改名看成「删一个、建一个」，
  那会把老文件判成新建。复制不接链（`-M` 不认复制，要 `-C` 才认）：复制出来的那份从复制那一次
  起算 —— 与旧实现逐文件跑 `--follow` 不同，后者会把内容一模一样的新建当成复制、往前多追一行。

浅克隆里「历史到此为止」那一条的文件名单是**整棵树**（对着空树比出来的），所以它的名单
不进 `recent`、不计提交次数，只给已经记下的那份文件盖上 `truncated`：那份历史被截过，
「只提交过一次」这个结论从此拿不住。
*/
function readHistory(
  root: string,
  shallow: boolean,
  buildTime: number,
): {
  head: number | undefined;
  recent: Set<string>;
  times: Map<string, GitTimes>;
} {
  const log = git(
    [
      '--no-pager',
      '-c',
      'log.showSignature=false',
      'log',
      '-M',
      '--format=%x01%ct%x02%P',
      '--name-status',
    ],
    root,
  );

  /** 旧名 → 当时的最终名字。写入前已经解析过，所以查一次就够，不会绕圈 */
  const aliases = new Map<string, string>();
  const currentName = (path: string): string => aliases.get(path) ?? path;

  const history = new Map<string, History>();
  const recent = new Set<string>();
  let head: number | undefined;
  let index = 0;

  const blocks = log.split('\u{1}').filter(Boolean);

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const [time, parents] = lines[0]!.split('\u{2}', 2);
    const at = Number(time);
    head ??= at;

    // 「没有父项」在浅克隆里是历史到此为止；完整检出里根提交也没有父项，所以先问 shallow
    const graft = shallow && !parents;
    const isRecentCommit =
      index < RECENT_COMMITS || buildTime - at <= RECENT_DAYS * DAY;
    index += 1;

    for (const line of lines.slice(1)) {
      const firstTab = line.indexOf('\t');
      const lastTab = line.lastIndexOf('\t');
      const status = line[0];
      const path = currentName(line.slice(lastTab + 1));

      if (status === 'R') {
        aliases.set(line.slice(firstTab + 1, lastTab), path);
      }

      if (graft) {
        // 截断那一条的名单是整棵树：不收进 `recent`、也不计提交次数，只给已经记过的
        // 那份文件盖一个记号 —— 它的历史被截过，「只提交过一次」从此拿不住
        const entry = history.get(path);

        if (entry) {
          entry.truncated = true;
        }

        continue;
      }

      const entry = history.get(path) ?? {
        count: 0,
        updated: at,
        truncated: false,
      };
      entry.count += 1;
      entry.updated = Math.max(entry.updated, at);
      history.set(path, entry);

      if (isRecentCommit) {
        recent.add(path);
      }
    }
  }

  const times = new Map<string, GitTimes>();

  for (const [path, entry] of history) {
    times.set(path, {
      created:
        entry.count === 1 && !entry.truncated ? entry.updated : undefined,
      updated: entry.updated,
    });
  }

  return { head, recent, times };
}

/**
初始化阶段一起读掉的那一下：HEAD 的时刻 + 最近动过的文件 + 每份文件的时刻表。

两次 git 调用：

- `--is-shallow-repository`：这份检出有没有被 `--depth` 截断过历史（先问这个，
  整仓那一遍要用它认截断点）；
- 那条整仓 `git log`：见 {@link readHistory}。

两次都不带路径：整仓历史一次读完，之后每个文件都在这张表里查 —— 文件几百页也只是查表，
不是几百次 subprocess。

`buildTime` 在这里读一次、记在仓库上：后面「7 天内」一律用它（见 {@link isRecent}），
不每问一份文件重读一次墙上时钟。
*/
export function openRepo(root: string): Repo {
  // 只认 `true`：老 git（<2.15）不认这个开关，`rev-parse` 会把未知项原样打印出来，
  // 那一律按「历史是完整的」处理 —— 认不准时别把判据关掉。
  const shallow =
    git(['rev-parse', '--is-shallow-repository'], root) === 'true';
  const buildTime = Math.floor(Date.now() / 1000);

  return { root, buildTime, shallow, ...readHistory(root, shallow, buildTime) };
}

/**
把这条路径的**目录**那一段解析掉软链，文件名那一截原样留着。

两边要比的是同一件事：仓库根是解析过的（见 {@link findRepoRoot}），传进来的文件路径若
还带着软链，两边就不在同一种写法上 —— `relative` 算出来的差会带着 `..`，每份文件都被
判成「不在这个仓库里」，那一刻就都读不出来。

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
这份文件算不算「最近」：上次提交落在 {@link RECENT_DAYS} 天内，或那份文件在最后
{@link RECENT_COMMITS} 个 commit 里出现过。

前一条按 `repo.buildTime` —— **这一次构建打开仓库的那一刻** —— 算，不按 HEAD 那次提交的时刻
算：仓库最后一次提交可能已经很久的以前（几个月没提交的那种），拿它当基准会把几十天前改过的
文件也算成「最近」。也不每问一份文件重读一次墙上时钟：一场构建只该有一个「此刻」，否则两页
可以踩在窗口两侧，而整仓那一遍的「7 天内」用的本来就是打开那一刻。
后一条由 `openRepo()` 那次扫描里「最后 5 段提交的路径」给。
*/
export function isRecent(repo: Repo, path: string, updatedAt: number): boolean {
  return (
    repo.recent.has(path) || repo.buildTime - updatedAt <= RECENT_DAYS * DAY
  );
}

/**
从给定目录（插件拿的是 `context.siteDir`）往上找仓库，把那个仓库读出来。**每个插件实例只读
一次**：第一次问历史时打开，之后（含 `reloadSite()` 重跑）每个文件都在这份结果里查。

读不到（站点不在 git 里、git 不在 PATH、仓库坏了）就返回 `undefined`，判定那边当「没有历史」
处理 —— 不阻断构建：一份 README 少挂一枚徽标，不该比构建失败更糟。
*/
export function openRepoFrom(cwd: string): Repo | undefined {
  const root = findRepoRoot(cwd);

  if (root === undefined) {
    return undefined;
  }

  try {
    return openRepo(root);
  } catch {
    // 仓库在、但读不动：最常见的是 `git init` 之后还没有第一个提交（`git log` 以 128 退出），
    // 其次是对象库损坏。两种都按「没有历史」处理 —— 上面那条契约不能只在文档里成立。
    return undefined;
  }
}

/**
这份文件在整仓那张表里的两个时刻。表是 `openRepo()` 一次建好的，这里只查，不再花 subprocess；
问一次也好、问十次也好，拿到的都是同一个对象。

不在仓库里的文件（生成出来的、或压根不在 git 管辖下）当它没有历史。
*/
export function timesOf(repo: Repo, filePath: string): GitTimes {
  const path = repoPath(repo, filePath);

  return path === undefined ? noTimes : (repo.times.get(path) ?? noTimes);
}
