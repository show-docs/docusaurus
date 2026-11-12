import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { LoadContext, ParseFrontMatter } from '@docusaurus/types';
import { DEFAULT_PARSE_FRONT_MATTER } from '@docusaurus/utils';

import {
  badgeKindOf,
  PINNED_BADGE_KEY,
} from '../themes/theme-git-badge/src/badge.mts';
import {
  isPlainObject,
  normalizePath,
  wrapParseFrontMatter,
  WRAPPED,
} from '../themes/theme-git-badge/src/frontmatter.mts';
import {
  findRepoRoot,
  isRecent,
  noTimes,
  openRepo,
  openRepoFrom,
  RECENT_DAYS,
  repoPath,
  timesOf,
  type GitTimes,
  type Repo,
} from '../themes/theme-git-badge/src/git-info.mts';
import gitBadgeTheme from '../themes/theme-git-badge/src/index.mts';

import { canLinkDir, mkdtempReal } from './helpers.mts';

/**
## theme-git-badge 的三段判据

这一包只做一件事：给「新建」与「更新过」的页面在侧边栏挂一枚纯色点。判据分三段 ——
徽标种类怎么算（纯函数）、git 那份「最近」怎么读（真 git）、包装层与插件接线（假解析器）。

git 那一组走**真实的 git**（临时仓库真提交几次，提交时刻自己给），不 mock `execFileSync`：
这一层最容易坏的地方恰恰是「参数怎么拼、`git log` 的输出长什么样」。

判据那一层（`badge.mts`）反过来用**假仓库**喂：它是个纯函数，输入是「这一页提交过几次、
最近动过没有」，真 git 的那一半由下面那组用例钉住 —— 两边各钉各的，不互相冒充。
*/

/** 这一轮用到的临时目录：跑完一起删 */
const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** 建一个临时目录并登记（跑完删掉） */
const tempDir = (prefix: string): string => {
  const root = mkdtempReal(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);

  return root;
};

/** 调用方的入参就是官方 `ParseFrontMatter` 那一份 */
const params = (filePath = '/site/packages/README.md') => ({
  filePath,
  fileContent: '',
  defaultParseFrontMatter: DEFAULT_PARSE_FRONT_MATTER,
});

/** 夹具只要「吃得下官方入参、吐出 frontmatter 与正文」这一条 */
type ParseFrontMatterLike = (params: {
  filePath: string;
  fileContent: string;
  defaultParseFrontMatter: typeof DEFAULT_PARSE_FRONT_MATTER;
}) => Promise<{
  frontMatter: Record<string, unknown>;
  content: string;
}>;

/** 假的解析器：站点自己那份（标题与路径是它给的） */
const fakeParse =
  (): ParseFrontMatterLike =>
  async ({ filePath }) => ({
    frontMatter: { title: 'base 给的', path: filePath },
    content: '正文',
  });

/**
一份假仓库：时刻表已经填好，`timesOf` 直接命中缓存（不 spawn git）。

`root` 必须是**真实存在**的目录 —— `repoPath` 要拿它跟文件路径算相对路径。
`buildTime` 走真实默认值（构建那一刻），只有钉窗口基准的用例才覆盖它；`shallow` 一律 false，
浅克隆那条路由真 git 的用例走真实的检出。
*/
const fakeRepo = (
  root: string,
  times: Record<string, GitTimes>,
  recent: string[] = [],
  anchored: Partial<Pick<Repo, 'buildTime'>> = {},
): Repo => ({
  root,
  head: undefined,
  recent: new Set(recent),
  times: new Map(Object.entries(times)),
  buildTime: Math.floor(Date.now() / 1000),
  shallow: false,
  ...anchored,
});

/** 一份「碰一下就炸」的仓库：徽标被页面钉死时就不该问 git */
const explodingRepo = (): Repo => ({
  get root(): string {
    throw new Error('不该问 git');
  },
  head: undefined,
  recent: new Set<string>(),
  times: new Map<string, GitTimes>(),
  buildTime: Math.floor(Date.now() / 1000),
  shallow: false,
});

describe('badgeKindOf：页面钉死的说了算，没钉才问 git', () => {
  const root = tempDir('git-badge-kind-');
  const outside = tempDir('git-badge-outside-');
  const now = Math.floor(Date.now() / 1000);
  const filePath = path.join(root, 'docs', 'a.md');
  /** 仓库相对路径：判据与 `timesOf` 用的都是这一种写法 */
  const REL = 'docs/a.md';

  it('页面钉了 `git_badge: new`：以页面为准，连 git 都不问', () => {
    expect(
      badgeKindOf({
        filePath,
        frontMatter: { [PINNED_BADGE_KEY]: 'new' },
        repo: explodingRepo(),
      }),
    ).toBe('new');
  });

  it('页面钉了 `git_badge: update`：以页面为准', () => {
    expect(
      badgeKindOf({
        filePath,
        frontMatter: { [PINNED_BADGE_KEY]: 'update' },
        repo: explodingRepo(),
      }),
    ).toBe('update');
  });

  it('钉的值不认（`old`）：不当成钉子，交给 git 判', () => {
    expect(
      badgeKindOf({
        filePath,
        frontMatter: { [PINNED_BADGE_KEY]: 'old' },
        repo: undefined,
      }),
    ).toBeUndefined();
  });

  it('没钉、站点不在 git 里：不表态', () => {
    expect(
      badgeKindOf({ filePath, frontMatter: {}, repo: undefined }),
    ).toBeUndefined();
  });

  it('没钉、文件不在这个仓库里：不表态', () => {
    const repo = fakeRepo(root, { [REL]: { created: now, updated: now } });

    expect(
      badgeKindOf({
        filePath: path.join(outside, 'a.md'),
        frontMatter: {},
        repo,
      }),
    ).toBeUndefined();
  });

  it('没钉、这份文件没有历史：不表态', () => {
    const repo = fakeRepo(root, { [REL]: noTimes });

    expect(badgeKindOf({ filePath, frontMatter: {}, repo })).toBeUndefined();
  });

  it('只提交过一次且最近动过：新建', () => {
    const repo = fakeRepo(root, {
      [REL]: { created: now - 60, updated: now - 60 },
    });

    expect(badgeKindOf({ filePath, frontMatter: {}, repo })).toBe('new');
  });

  it('提交过多次且最近动过：更新', () => {
    const repo = fakeRepo(root, {
      [REL]: { created: undefined, updated: now - 60 },
    });

    expect(badgeKindOf({ filePath, frontMatter: {}, repo })).toBe('update');
  });

  it('只提交过一次、但很久没动过：不表态', () => {
    const stale = now - 100 * 86_400;
    const repo = fakeRepo(root, { [REL]: { created: stale, updated: stale } });

    expect(badgeKindOf({ filePath, frontMatter: {}, repo })).toBeUndefined();
  });

  it('提交过多次、但很久没动过：不表态', () => {
    const stale = now - 100 * 86_400;
    const repo = fakeRepo(root, {
      [REL]: { created: undefined, updated: stale },
    });

    expect(badgeKindOf({ filePath, frontMatter: {}, repo })).toBeUndefined();
  });
});

describe('wrapParseFrontMatter：只补不覆盖', () => {
  const root = tempDir('git-badge-wrap-');
  const filePath = path.join(root, 'docs', 'a.md');
  const now = Math.floor(Date.now() / 1000);
  /** 这份文件只提交过一次、且刚动过 → 新建 */
  const repo = fakeRepo(root, {
    'docs/a.md': { created: now - 60, updated: now - 60 },
  });

  /** 包一层：仓库由用例自己给（这一层不碰 git） */
  const wrap = (base: ParseFrontMatterLike): ParseFrontMatter =>
    wrapParseFrontMatter(base as ParseFrontMatter, () => repo);

  it('注入叠在 base 的结果上：base 先跑，站点自己改写的那几格还在', async () => {
    const base = async () => ({
      frontMatter: { title: 'base 改过' },
      content: 'base 的正文',
    });

    const { frontMatter } = await wrap(base)(params(filePath));

    expect(frontMatter).toEqual({
      title: 'base 改过',
      sidebar_custom_props: { gitBadge: 'new' },
    });
  });

  it('注入只改元数据：content 原样交回，frontmatter 换一个新对象', async () => {
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const result = await wrap(async () => parsed)(params(filePath));

    expect(result.content).toBe('正文');
    expect(result.frontMatter).not.toBe(parsed.frontMatter);
    // base 那份没被动过
    expect(parsed.frontMatter).toEqual({ title: 'a' });
  });

  it('页面自己写了 `sidebar_custom_props`：让位，原样交回', async () => {
    const parsed = {
      frontMatter: { title: 'a', sidebar_custom_props: { mine: 1 } },
      content: '正文',
    };
    const result = await wrap(async () => parsed)(params(filePath));

    expect(result).toBe(parsed);
  });

  it('git 答不出来：不表态就不写那一格（不留 `sidebar_custom_props: undefined`）', async () => {
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const result = await wrapParseFrontMatter(
      async () => parsed,
      () => undefined,
    )(params(filePath));

    expect(result).toBe(parsed);
    expect(Object.hasOwn(result.frontMatter, 'sidebar_custom_props')).toBe(
      false,
    );
  });

  it('不再分内容根：任何被解析的 markdown 都判', async () => {
    let asked = 0;
    const outsideRepo = fakeRepo(root, {
      'tools/README.md': { created: now - 60, updated: now - 60 },
    });
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const wrapped = wrapParseFrontMatter(
      async () => parsed,
      () => {
        asked += 1;

        return outsideRepo;
      },
    );

    // 内容根之外的文件也照样问、照样写：读那一格的只有文档插件的侧边栏
    const result = await wrapped(params(path.join(root, 'tools', 'README.md')));
    expect(result.frontMatter).toMatchObject({
      sidebar_custom_props: { gitBadge: 'new' },
    });
    expect(asked).toBe(1);
  });

  it('frontmatter 不是普通对象时原样交回，不去改别人的返回值', async () => {
    for (const frontMatter of [undefined, null, ['a']]) {
      const parsed = { frontMatter, content: '正文' };
      const result = await wrap(async () => parsed as never)(params(filePath));

      expect(result).toEqual(parsed);
    }
  });

  it('包两次只有一层：第二次原样交回同一个函数', () => {
    const wrapped = wrap(fakeParse());

    expect(wrapParseFrontMatter(wrapped, () => repo)).toBe(wrapped);
  });

  it('包过的那份解析器带记号（重跑时认得出是自己）', () => {
    const wrapped = wrap(fakeParse());

    expect((wrapped as { [WRAPPED]?: true })[WRAPPED]).toBe(true);
  });

  it('包装不丢 base 的异常：抛就抛出去', async () => {
    const wrapped = wrap(() => Promise.reject(new Error('yaml 坏了')));

    await expect(wrapped(params(filePath))).rejects.toThrow('yaml 坏了');
  });

  it('路径先归一成一种写法（判据只面对正斜杠）', () => {
    expect(normalizePath(String.raw`C:\site\docs\a.md`)).toBe(
      'C:/site/docs/a.md',
    );
  });

  it('只有普通对象才算「能往里写」', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
  });

  it.runIf(path.sep === '\\')(
    '反斜杠写的文件路径照样判（Windows 上路径是这一种写法）',
    async () => {
      const wrapped = wrap(fakeParse());
      const { frontMatter } = await wrapped(
        params(filePath.split(path.sep).join('\\')),
      );

      expect(frontMatter).toMatchObject({
        sidebar_custom_props: { gitBadge: 'new' },
      });
    },
  );
});

describe('isRecent：最近动过没有', () => {
  const PATH = 'packages/README.md';

  it('落在全仓最后那几个提交里的那份文件算最近', () => {
    expect(isRecent(fakeRepo('/', { [PATH]: noTimes }, [PATH]), PATH, 0)).toBe(
      true,
    );
  });

  it('不在那几次提交里，但七天之内动过：也算最近', () => {
    const now = Math.floor(Date.now() / 1000);

    expect(
      isRecent(fakeRepo('/', {}), PATH, now - (RECENT_DAYS - 1) * 86_400),
    ).toBe(true);
  });

  it('窗口外的老文件：不算最近', () => {
    const now = Math.floor(Date.now() / 1000);

    expect(
      isRecent(fakeRepo('/', {}), PATH, now - (RECENT_DAYS + 1) * 86_400),
    ).toBe(false);
  });

  it('窗口按「打开仓库那一刻」算，不按每问一份文件重读的时钟', () => {
    // 这份仓库的基准是 8 天前（构建跑久了、或拿着老 `Repo` 再问一次），文件在那之后的
    // 第 6 天动过。按 `buildTime` 是 6 天 = 窗口内；读墙上时钟就是 14 天 = 窗口外，
    // 于是同一场构建里两页能踩在窗口两侧。
    const buildTime = Math.floor(Date.now() / 1000) - 8 * 86_400;

    expect(
      isRecent(
        fakeRepo('/', {}, [], { buildTime }),
        PATH,
        buildTime - (RECENT_DAYS - 1) * 86_400,
      ),
    ).toBe(true);
  });
});

describe('git 那一侧（真 git 仓库）', () => {
  const DAY = 86_400;
  const now = Math.floor(Date.now() / 1000);

  /** 空仓库骨架：`git init` + 自己给时刻的提交（重命名与空仓库两组都用） */
  function gitRepo(prefix: string) {
    const root = mkdtempReal(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);

    const run = (args: string[], at?: number): string =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        env:
          at === undefined
            ? process.env
            : {
                ...process.env,
                GIT_AUTHOR_DATE: `${String(at)} +0000`,
                GIT_COMMITTER_DATE: `${String(at)} +0000`,
              },
      }).trim();

    run(['init', '-q']);
    run(['config', 'user.email', 'test@example.com']);
    run(['config', 'user.name', 'test']);
    run(['config', 'commit.gpgsign', 'false']);

    return {
      root,
      run,
      commit: (message: string, at: number): void => {
        run(['add', '-A']);
        run(['commit', '-q', '-m', message, '--no-verify'], at);
      },
    };
  }

  /** 一个真仓库：两份文件，各提交过一次 —— `new.md` 是一分钟前那次，`old.md` 是 21 天前那次 */
  function makeRepo(): { root: string; repo: Repo } {
    const { root, run } = gitRepo('git-badge-git-');

    fs.writeFileSync(path.join(root, 'old.md'), 'old\n');
    fs.writeFileSync(path.join(root, 'new.md'), 'new\n');
    run(['add', '.']);
    run(['commit', '-q', '-m', '旧的', '--no-verify'], now - 21 * DAY);

    // 第二次提交再动一次 `new.md`：它因此「提交过两次」，但最后一次就在窗口里
    fs.appendFileSync(path.join(root, 'new.md'), 'again\n');
    run(['add', '.']);
    run(['commit', '-q', '-m', '新的', '--no-verify'], now - 60);

    return { root, repo: openRepo(root) };
  }

  /**
  `git clone --depth <n>` 一份到临时目录：CI 默认那种检出（`actions/checkout` 不带
  `fetch-depth` 时就是 depth 1）。`--no-local` 是必须的：本地路径的克隆走 hardlink 快速通道，
  git 会**忽略** `--depth` 并提示改用 `file://` —— 那样克隆出来的是一份完整历史，用例白测。
  */
  function shallowCloneOf(sourceRoot: string, depth: number): string {
    const base = mkdtempReal(path.join(os.tmpdir(), 'git-badge-shallow-'));
    tempRoots.push(base);
    const target = path.join(base, 'clone');

    execFileSync(
      'git',
      [
        'clone',
        '-q',
        '--no-local',
        '--depth',
        String(depth),
        sourceRoot,
        target,
      ],
      { encoding: 'utf8' },
    );

    return target;
  }

  /**
  三次提交的仓库，浅克隆那几条用例都从它 clone：
  根提交建 `root.md`（之后没再动）与 `old.md`；`fresh.md` 只在 6 天前那一次里出现；
  最新那次又动了 `old.md`。

  `root.md` 是「只在根提交里出现过」那一格：完整检出里它没有父提交、但那是**真**根提交，仍然要
  给出 `created` —— 少了这份文件，「没有父提交」这条就可以不判 `shallow` 也全绿。

  三份内容互不相同只是让夹具一眼分得清谁是谁；内容相同也不会多算一行 —— 扫描只认改名，
  复制不接链（旧实现逐文件跑 `--follow` 时会多追一行，见「复制不接链」那条用例）。
  */
  function makeThreeCommitRepo(): string {
    const { root, commit } = gitRepo('git-badge-history-');

    fs.writeFileSync(path.join(root, 'root.md'), 'root v1\n');
    fs.writeFileSync(path.join(root, 'old.md'), 'old v1\n');
    commit('建 root 与 old', now - 30 * DAY);

    fs.writeFileSync(path.join(root, 'fresh.md'), 'fresh v1\n');
    commit('建 fresh', now - 6 * DAY);

    fs.appendFileSync(path.join(root, 'old.md'), 'old v2\n');
    commit('又动 old', now - 60);

    return root;
  }

  it('仓库根解析软链、正斜杠；不在仓库里时返回 undefined', () => {
    const { root } = makeRepo();

    expect(findRepoRoot(root)).toBe(
      fs.realpathSync.native(root).replaceAll('\\', '/'),
    );
    // 正常仓库这一侧：`openRepoFrom` 真的把仓库读出来（catch 那条另一侧见空仓库用例）
    expect(openRepoFrom(root)?.root).toBe(findRepoRoot(root));
    // 临时目录的上一级不是仓库（`/tmp` 与 `os.tmpdir()` 都不是）
    expect(findRepoRoot(os.tmpdir())).toBeUndefined();
    // 目录根本不存在：spawn 没起来，`stdout` 是 null，同样按「没有 git」处理
    expect(
      findRepoRoot(path.join(os.tmpdir(), 'git-badge-no-such-dir', 'nested')),
    ).toBeUndefined();
  });

  it('HEAD 与「最近这几个提交动过的文件」是一次读出来的', () => {
    const { repo } = makeRepo();

    // 两次提交都在窗口里（21 天前那份不在，但它出现在最后 5 个提交里）
    expect(repo.head).toBeGreaterThan(now - 3600);
    expect([...repo.recent].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'new.md',
      'old.md',
    ]);
  });

  it('一份文件两个时刻：只提交过一次的才给 created', () => {
    const { repo } = makeRepo();

    // 提交过两次：只有「更新」，没有「创建」
    expect(timesOf(repo, path.join(repo.root, 'new.md'))).toEqual({
      created: undefined,
      updated: now - 60,
    });
    expect(timesOf(repo, path.join(repo.root, 'old.md'))).toEqual({
      created: expect.any(Number) as number,
      updated: now - 21 * DAY,
    });
    // 只提交过一次：那一次既是「创建」也是「更新」
    expect(timesOf(repo, path.join(repo.root, 'old.md'))?.created).toBe(
      now - 21 * DAY,
    );
    // 第二次问走缓存，不会再花一次 subprocess
    expect(timesOf(repo, path.join(repo.root, 'new.md'))).toBe(
      timesOf(repo, path.join(repo.root, 'new.md')),
    );
  });

  it('不在这个仓库里的路径、从没提交过的文件：都没有历史', () => {
    const { root, repo } = makeRepo();
    const loose = path.join(root, 'loose.md');

    fs.writeFileSync(loose, 'loose\n');

    expect(repoPath(repo, '/elsewhere/a.md')).toBeUndefined();
    expect(timesOf(repo, '/elsewhere/a.md')).toBe(noTimes);
    expect(timesOf(repo, loose)).toEqual(noTimes);
  });

  it('非 ASCII 文件名：路径不转义，时刻表与徽标都查得到', () => {
    const { root, commit } = gitRepo('git-badge-quotepath-');

    fs.writeFileSync(path.join(root, '中文页面.md'), '你好\n');
    commit('建中文页面', now - 60);

    const repo = openRepo(root);
    const file = path.join(root, '中文页面.md');

    // git 默认把非 ASCII 路径转义成 `"\\344\\270\\255…"`：不显式关 quotepath，
    // 这张表按转义文本建键，按真实路径查永远 miss
    expect(timesOf(repo, file)).toEqual({
      created: now - 60,
      updated: now - 60,
    });
    expect(repo.recent.has('中文页面.md')).toBe(true);
    expect(badgeKindOf({ filePath: file, frontMatter: {}, repo })).toBe('new');
  });

  it('「最近」的两个口径：七天内的算最近；最后一个提交里的老文件也算最近', () => {
    const { root, repo } = makeRepo();

    const fresh = timesOf(repo, path.join(root, 'new.md'));
    const stale = timesOf(repo, path.join(root, 'old.md'));

    expect(fresh.updated).toBe(now - 60);
    expect(stale.updated).toBe(now - 21 * DAY);

    // `new.md` 60 秒前动过：落在 7 天窗口里
    expect(isRecent(repo, 'new.md', fresh.updated ?? 0)).toBe(true);
    // `old.md` 21 天前动过：窗口外，但出现在最后 5 个提交里
    expect(isRecent(repo, 'old.md', stale.updated ?? 0)).toBe(true);
  });

  it('浅克隆：截断处那一条提交的名单与历史都不算信号', () => {
    const source = makeThreeCommitRepo();
    const full = openRepo(source);

    expect(full.shallow).toBe(false);
    expect([...full.recent].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'fresh.md',
      'old.md',
      'root.md',
    ]);
    // 完整检出是「应该长什么样」的那一侧：各自的历史都看得见，一次提交的给 created
    expect(timesOf(full, path.join(source, 'fresh.md'))).toEqual({
      created: now - 6 * DAY,
      updated: now - 6 * DAY,
    });
    // 根提交里建的那份：没有父提交，但这是**真**根提交，不是 `--depth` 的截断点
    expect(timesOf(full, path.join(source, 'root.md'))).toEqual({
      created: now - 30 * DAY,
      updated: now - 30 * DAY,
    });
    expect(
      badgeKindOf({
        filePath: path.join(source, 'fresh.md'),
        frontMatter: {},
        repo: full,
      }),
    ).toBe('new');

    // depth 1：只剩「历史到此为止」那一条，它的名单是整棵树（实测：截断点被 git 当成没有父
    // 提交的那一条来展示，对着空树比，三个文件都在）—— 挡住它以后，三份都没有可信历史，
    // 全站不表态
    const one = openRepo(shallowCloneOf(source, 1));

    expect(one.shallow).toBe(true);
    expect(one.head).toBe(now - 60);
    expect(one.recent.size).toBe(0);
    for (const file of ['old.md', 'fresh.md', 'root.md']) {
      expect(timesOf(one, path.join(one.root, file))).toBe(noTimes);
      expect(
        badgeKindOf({
          filePath: path.join(one.root, file),
          frontMatter: {},
          repo: one,
        }),
      ).toBeUndefined();
    }

    // depth 2：截断处往前还看得见一次真提交 —— 真的动过的那份照常判「更新」，
    // 只在截断那份名单里出现过的仍然没有历史
    const two = openRepo(shallowCloneOf(source, 2));

    expect(two.head).toBe(now - 60);
    expect([...two.recent]).toEqual(['old.md']);
    expect(timesOf(two, path.join(two.root, 'old.md'))).toEqual({
      created: undefined,
      updated: now - 60,
    });
    expect(timesOf(two, path.join(two.root, 'fresh.md'))).toBe(noTimes);
    expect(
      badgeKindOf({
        filePath: path.join(two.root, 'old.md'),
        frontMatter: {},
        repo: two,
      }),
    ).toBe('update');

    // depth 3 == 整个历史都在：git 仍然把这份检出记成浅的，所以「没有父提交」那一条
    // （这里是真根提交）也一律不算信号。徽标与完整检出逐个一样，代价落在只在根提交里
    // 建过的那份文件上 —— 它这里没有历史，也就是不表态（少贴，不贴错）。
    const three = openRepo(shallowCloneOf(source, 3));

    expect(three.shallow).toBe(true);
    expect(timesOf(three, path.join(three.root, 'fresh.md'))).toEqual({
      created: now - 6 * DAY,
      updated: now - 6 * DAY,
    });
    expect(
      badgeKindOf({
        filePath: path.join(three.root, 'fresh.md'),
        frontMatter: {},
        repo: three,
      }),
    ).toBe('new');
    expect(timesOf(three, path.join(three.root, 'old.md'))).toEqual({
      created: undefined,
      updated: now - 60,
    });
    expect(timesOf(three, path.join(three.root, 'root.md'))).toBe(noTimes);
  });

  it('重命名过的文件按提交数算历史：不会把两段历史误判成「只提交过一次」', () => {
    const { root, run, commit } = gitRepo('git-badge-rename-');
    const created = now - 30 * DAY;
    const renamed = now - 60;

    fs.writeFileSync(path.join(root, 'before.md'), 'v1\n');
    commit('创建', created);
    run(['mv', 'before.md', 'after.md']);
    commit('重命名', renamed);

    const repo = openRepo(root);
    // 两次提交：只有「更新」。旧实现把改名那次的旧名行滤掉，历史只剩 1 行 → 误报成新文件。
    expect(timesOf(repo, path.join(root, 'after.md'))).toEqual({
      created: undefined,
      updated: renamed,
    });
  });

  it('连续改名：整条链上的提交都算这份文件的历史', () => {
    const { root, run, commit } = gitRepo('git-badge-rename-chain-');
    const created = now - 30 * DAY;
    const renamed = now - 2 * DAY;
    const renamedAgain = now - 60;

    fs.writeFileSync(path.join(root, 'a.md'), 'v1\n');
    commit('创建', created);
    run(['mv', 'a.md', 'b.md']);
    commit('第一次改名', renamed);
    run(['mv', 'b.md', 'c.md']);
    commit('第二次改名', renamedAgain);

    const repo = openRepo(root);
    // 三次提交：最老那次在最早的旧名下，仍然要算进现在这个名字
    expect(timesOf(repo, path.join(root, 'c.md'))).toEqual({
      created: undefined,
      updated: renamedAgain,
    });
  });

  it('旧路径后来被新文件复用：两段历史各算各的', () => {
    const { root, run, commit } = gitRepo('git-badge-rename-reuse-');
    const created = now - 30 * DAY;
    const renamed = now - 2 * DAY;
    const recreated = now - 60;

    fs.writeFileSync(path.join(root, 'a.md'), 'old\n');
    commit('创建 a', created);
    run(['mv', 'a.md', 'b.md']);
    commit('改名成 b', renamed);
    fs.writeFileSync(path.join(root, 'a.md'), 'brand new\n');
    commit('新的 a', recreated);

    const repo = openRepo(root);
    // 新 a 只提交过一次：旧 a 的历史已经跟着改名走到 b 了，不能并回来
    expect(timesOf(repo, path.join(root, 'a.md'))).toEqual({
      created: recreated,
      updated: recreated,
    });
    expect(timesOf(repo, path.join(root, 'b.md'))).toEqual({
      created: undefined,
      updated: renamed,
    });
  });

  it('复制不接链：内容一模一样的新建仍只算一次提交', () => {
    const { root, commit } = gitRepo('git-badge-copy-');
    const created = now - 30 * DAY;
    const copied = now - 60;

    fs.writeFileSync(path.join(root, 'a.md'), 'same\n');
    commit('创建 a', created);
    fs.writeFileSync(path.join(root, 'b.md'), 'same\n');
    commit('复制成 b', copied);

    const repo = openRepo(root);
    // 旧实现逐文件跑 `--follow`：b 被认成 a 的复制、往前多追一行 → created 拿不到。
    // 扫描只开 `-M`（改名），复制的这份从自己那一次起算。
    expect(timesOf(repo, path.join(root, 'b.md'))).toEqual({
      created: copied,
      updated: copied,
    });
    expect(timesOf(repo, path.join(root, 'a.md'))).toEqual({
      created,
      updated: created,
    });
  });

  it('最后 5 个提交之外的提交：落在 7 天窗口里才算最近', () => {
    const { root, commit } = gitRepo('git-badge-window-');

    fs.writeFileSync(path.join(root, 'old.md'), 'old\n');
    commit('很老的 old', now - 30 * DAY);

    fs.writeFileSync(path.join(root, 'middle.md'), 'middle\n');
    commit('六天前的 middle', now - 6 * DAY);

    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      fs.writeFileSync(path.join(root, `${name}.md`), `${name}\n`);
      commit(`最近的 ${name}`, now - 50);
    }

    const repo = openRepo(root);
    // 最后 5 段提交只覆盖 a..e；middle 在这个范围外，但落在 7 天窗口里
    expect([...repo.recent].toSorted((a, b) => a.localeCompare(b))).toEqual([
      'a.md',
      'b.md',
      'c.md',
      'd.md',
      'e.md',
      'middle.md',
    ]);
    expect(isRecent(repo, 'middle.md', now - 6 * DAY)).toBe(true);
    expect(isRecent(repo, 'old.md', now - 30 * DAY)).toBe(false);
  });

  it.runIf(canLinkDir)(
    '软链那条路进来的文件也算在仓库里（仓库根与文件路径同一种写法）',
    () => {
      const { root, commit } = gitRepo('git-badge-link-');

      fs.writeFileSync(path.join(root, 'a.md'), 'a\n');
      commit('初始', now - 60);

      // 仓库根之外的一条链接指向仓库根：站点从链接那条路进来时，两边不在同一种写法上
      const link = path.join(path.dirname(root), `${path.basename(root)}-link`);
      fs.symlinkSync(root, link, 'junction');

      const repo = openRepo(root);

      expect(repoPath(repo, path.join(link, 'a.md'))).toBe('a.md');
      const times = timesOf(repo, path.join(link, 'a.md'));
      expect(times.updated).toBe(now - 60);
      expect(isRecent(repo, 'a.md', times.updated ?? 0)).toBe(true);
    },
  );

  it('目录压根不存在（生成出来的文件）：往上找到第一个存在的祖先，剩下的段按原序接回去', () => {
    const { root, repo } = makeRepo();

    // 三段都不存在：倒序那一段必须只倒一次 —— 倒着攒、边倒边攒会把段的次序搅乱
    const generated = path.join(root, 'out', 'a', 'b', 'new.md');

    expect(repoPath(repo, generated)).toBe('out/a/b/new.md');
  });

  it('最后一次提交很久以前：几十天前改过的文件不算「最近」（按此刻算，不按 HEAD 算）', () => {
    const { root, commit } = gitRepo('git-badge-stale-');
    const stale = now - 100 * DAY;

    fs.writeFileSync(path.join(root, 'stale.md'), 'v1\n');
    commit('老提交', stale);

    // 再补五次提交，把 `stale.md` 挤出「最后 5 个 commit」；每次另起一个文件
    for (let index = 0; index < 5; index += 1) {
      fs.writeFileSync(path.join(root, `filler-${index}.md`), `${index}\n`);
      commit(`填充 ${index}`, stale);
    }

    const repo = openRepo(root);

    // 这份文件既不在 7 天窗口里，也不在最后 5 个 commit 里
    expect(repo.recent.has('stale.md')).toBe(false);
    expect(repo.head).toBe(stale);
    // HEAD 与这次提交同时刻：以 HEAD 当基准时差是 0 天，会误判成「最近」
    expect(isRecent(repo, 'stale.md', stale)).toBe(false);
  });

  it('空仓库（`git init` 还没有首个提交）：按「没有历史」处理，不阻断构建', () => {
    const { root } = gitRepo('git-badge-empty-');

    // 找得到仓库根，但 `git log` 在空仓库上以 128 退出 —— 这一格以前会把构建直接抛停
    expect(findRepoRoot(root)).toBeDefined();
    expect(openRepoFrom(root)).toBeUndefined();
  });
});

describe('theme-git-badge 插件接线', () => {
  /** 站点配置里共享的那份 `markdown`：除了解析器，还住着兄弟键 */
  const createMarkdown = (
    parseFrontMatter: ParseFrontMatter = fakeParse() as ParseFrontMatter,
  ) => ({
    parseFrontMatter,
    preprocessor: (params_: { fileContent: string }) => params_.fileContent,
    format: 'mdx',
  });

  /** 一份够用的站点上下文：入口只读 `siteConfig.markdown` */
  const contextWith = (siteDir: string, markdown: unknown): LoadContext =>
    ({
      siteDir,
      siteConfig: {
        markdown,
        plugins: [],
        themes: [],
      },
    }) as unknown as LoadContext;

  /** 一份带 git 历史的站点：根目录就是仓库，`docs/intro.md` 刚提交过（→ 新建） */
  function makeSite(prefix: string): {
    root: string;
    run: (args: string[]) => string;
  } {
    const root = mkdtempReal(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);

    const run = (args: string[]): string =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

    run(['init', '-q']);
    run(['config', 'user.email', 'test@example.com']);
    run(['config', 'user.name', 'test']);
    run(['config', 'commit.gpgsign', 'false']);
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs', 'intro.md'),
      '---\ntitle: 首页\n---\n',
    );
    run(['add', '.']);
    run(['commit', '-q', '-m', '初始', '--no-verify']);

    return { root, run };
  }

  it('插件名就是包名', () => {
    const plugin = gitBadgeTheme(contextWith('/site', createMarkdown()));

    expect(plugin.name).toBe('@show-docs/docusaurus-theme-git-badge');
  });

  it('构造函数里就包住站点那份解析器：工厂期接线，不等 loadContent', () => {
    const base = fakeParse();
    const markdown = createMarkdown(base as ParseFrontMatter);
    gitBadgeTheme(contextWith('/site', markdown));

    expect(markdown.parseFrontMatter).not.toBe(base);
  });

  it('工厂一返回，解构走的那份就带注入（docs 的 loadContent 就是这么读的）', async () => {
    const { root } = makeSite('git-badge-race-');
    const markdown = createMarkdown();

    gitBadgeTheme(contextWith(root, markdown));
    // docs 插件在它自己的 loadContent() 里解构的是函数引用：那一刻注入必须已经在。
    // initPlugins 把所有工厂 await 完才跑各插件的 loadContent，所以工厂期接线没有竞态。
    const { parseFrontMatter } = markdown;

    const { frontMatter } = await parseFrontMatter(
      params(path.join(root, 'docs', 'intro.md')),
    );

    expect(frontMatter).toMatchObject({
      sidebar_custom_props: { gitBadge: 'new' },
    });
  });

  it('构造之后站点那份解析器被包住，兄弟键连引用都不换', async () => {
    const { root } = makeSite('git-badge-site-');
    const markdown = createMarkdown();
    const { preprocessor } = markdown;

    gitBadgeTheme(contextWith(root, markdown));

    const { frontMatter } = await markdown.parseFrontMatter(
      params(path.join(root, 'docs', 'intro.md')),
    );

    // 判据与载体都接上了：这一格就是侧边栏那枚点子读的那一格
    expect(frontMatter).toMatchObject({
      sidebar_custom_props: { gitBadge: 'new' },
    });
    expect(markdown.preprocessor).toBe(preprocessor);
    expect(markdown.format).toBe('mdx');
  });

  /**
  一份**两棵内容根**的站点：`packages/a/README.md`、`themes/theme-x/README.md` 与
  `tools/README.md` 各刚提交一次。
  */
  function makeTwoRootSite(): { root: string } {
    const site = makeSite('git-badge-two-roots-');
    const { root, run } = site;
    for (const rel of [
      path.join('packages', 'a', 'README.md'),
      path.join('themes', 'theme-x', 'README.md'),
      path.join('tools', 'README.md'),
    ]) {
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `---\ntitle: ${rel}\n---\n`);
    }
    run(['add', '.']);
    run(['commit', '-q', '-m', '两棵根', '--no-verify']);

    return site;
  }

  it('不按内容根筛：两棵根里的页都有徽标，根外的文件也照样判', async () => {
    const { root } = makeTwoRootSite();
    const markdown = createMarkdown();

    gitBadgeTheme(contextWith(root, markdown));

    // 三份都被判：没有 `docs` 选项，也没有内容根过滤 —— 读那一格的只有文档插件的侧边栏，
    // 所以「跟哪一棵根」不再由本层区分
    for (const rel of [
      path.join('packages', 'a', 'README.md'),
      path.join('themes', 'theme-x', 'README.md'),
      path.join('tools', 'README.md'),
    ]) {
      const file = path.join(root, rel);
      const { frontMatter } = await markdown.parseFrontMatter(params(file));
      expect(frontMatter, rel).toMatchObject({
        sidebar_custom_props: { gitBadge: 'new' },
      });
    }
  });

  it('重复构造不会套第二层（reloadSite 重跑的是工厂）', () => {
    const { root } = makeSite('git-badge-once-');
    const markdown = createMarkdown();

    gitBadgeTheme(contextWith(root, markdown));
    const once = markdown.parseFrontMatter;
    gitBadgeTheme(contextWith(root, markdown));

    expect(markdown.parseFrontMatter).toBe(once);
  });

  it('loadContent 再调一次也不套第二层（reloadPlugin 复用实例重跑那一阶段）', async () => {
    const { root } = makeSite('git-badge-reload-');
    const markdown = createMarkdown();
    const plugin = gitBadgeTheme(contextWith(root, markdown));
    const once = markdown.parseFrontMatter;

    plugin.loadContent?.();

    expect(markdown.parseFrontMatter).toBe(once);
    const { frontMatter } = await markdown.parseFrontMatter(
      params(path.join(root, 'docs', 'intro.md')),
    );
    expect(frontMatter).toMatchObject({
      sidebar_custom_props: { gitBadge: 'new' },
    });
  });

  it('别的插件在工厂期换了那一格：loadContent 兜底重包，注入不丢', async () => {
    const { root } = makeSite('git-badge-rewrap-');
    const markdown = createMarkdown();
    const plugin = gitBadgeTheme(contextWith(root, markdown));

    // 共享可变对象：后来者在自己的工厂里直接赋值，把本包那层整个换掉
    markdown.parseFrontMatter = fakeParse() as ParseFrontMatter;
    plugin.loadContent?.();

    const { frontMatter } = await markdown.parseFrontMatter(
      params(path.join(root, 'docs', 'intro.md')),
    );
    expect(frontMatter).toMatchObject({
      sidebar_custom_props: { gitBadge: 'new' },
    });
  });

  it('同一次构建里答案稳定：后来再提交一次，徽标不跟着变（仓库只读一次）', async () => {
    const { root, run } = makeSite('git-badge-stable-');
    const markdown = createMarkdown();

    gitBadgeTheme(contextWith(root, markdown));

    const file = path.join(root, 'docs', 'intro.md');
    const first = await markdown.parseFrontMatter(params(file));

    expect(first.frontMatter).toMatchObject({
      sidebar_custom_props: { gitBadge: 'new' },
    });

    // 再提交一次：按 git 算这份文件从此提交过两次（那是「更新」）
    fs.appendFileSync(file, '\n再加一行\n');
    run(['add', '.']);
    run(['commit', '-q', '-m', '再改一次', '--no-verify']);

    const second = await markdown.parseFrontMatter(params(file));

    // 插件实例只读一次仓库：构建期间的答案不漂移
    expect(second.frontMatter).toMatchObject({
      sidebar_custom_props: { gitBadge: 'new' },
    });
  });

  it('站点不在 git 里：装得上，那一格不表态', async () => {
    const root = tempDir('git-badge-nogit-');
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    const file = path.join(root, 'docs', 'intro.md');
    fs.writeFileSync(file, '---\ntitle: 首页\n---\n');

    const markdown = createMarkdown();
    gitBadgeTheme(contextWith(root, markdown));

    const { frontMatter } = await markdown.parseFrontMatter(params(file));

    expect(Object.hasOwn(frontMatter, 'sidebar_custom_props')).toBe(false);
    expect(frontMatter.title).toBe('base 给的');
  });

  it('找仓库从 siteDir 起步：工作目录在仓库之外时照样生效', async () => {
    const { root } = makeSite('git-badge-sitedir-');
    const outside = tempDir('git-badge-cwd-');
    const cwd = process.cwd();

    try {
      process.chdir(outside);

      const markdown = createMarkdown();
      gitBadgeTheme(contextWith(root, markdown));

      const { frontMatter } = await markdown.parseFrontMatter(
        params(path.join(root, 'docs', 'intro.md')),
      );

      expect(frontMatter).toMatchObject({
        sidebar_custom_props: { gitBadge: 'new' },
      });
    } finally {
      process.chdir(cwd);
    }
  });

  it('站点没写 parseFrontMatter（官方填进来的默认值）时照样包得住', async () => {
    const { root } = makeSite('git-badge-official-');
    const markdown = createMarkdown(DEFAULT_PARSE_FRONT_MATTER);

    gitBadgeTheme(contextWith(root, markdown));

    const result = await markdown.parseFrontMatter({
      ...params(path.join(root, 'docs', 'intro.md')),
      fileContent: '---\ntitle: 原文\n---\n\n# 标题 {#custom}\n',
    });

    // 真的走了 yaml 解析：原来那格在、徽标那格也补上，且正文原样
    expect(result.frontMatter).toMatchObject({
      title: '原文',
      sidebar_custom_props: { gitBadge: 'new' },
    });
    expect(result.content).toContain('{#custom}');
  });
});
