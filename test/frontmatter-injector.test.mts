import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_PARSE_FRONT_MATTER } from '@docusaurus/utils';

import { DEFAULT_INCLUDE } from '../packages/plugin-frontmatter-injector/src/docs-scope.mts';
import frontMatterInjectorPlugin, {
  applyRules,
  createScope,
  defaultRules,
  docsContentPath,
  findRepoRoot,
  mergeTags,
  NEW_TAG,
  noTimes,
  openRepo,
  openRepoFrom,
  repoPath,
  scopeOf,
  tagsOf,
  timesOf,
  UPDATE_TAG,
  wrapParseFrontMatter,
  type FrontMatterRule,
  type Repo,
  type RuleContext,
} from '../packages/plugin-frontmatter-injector/src/index.mts';

import { mkdtempReal } from './helpers.mts';

/**
## plugin-frontmatter-injector 的四段判据

这一包只做一件事：给 md 的 frontmatter 补 `tags`。判据分四层 —— 规则表怎么算（纯函数）、
地盘由文档插件的 `include` / `exclude` 怎么收窄、git 那份「最近」怎么读（真 git）、
包装层与插件接线（假解析器）。

git 那一组走**真实的 git**（临时仓库真提交几次，提交时刻自己给），不 mock `execFileSync`：
这一层最容易坏的地方恰恰是「参数怎么拼、`git log` 的输出长什么样」。
*/

const DOC = '/site/packages/README.md';

/** 调用方的入参就是官方 `ParseFrontMatter` 那一份 */
const params = (filePath = DOC) => ({
  filePath,
  fileContent: '',
  defaultParseFrontMatter: DEFAULT_PARSE_FRONT_MATTER,
});

type Params = ReturnType<typeof params>;

/** 夹具只要「吃得下官方入参、吐出 frontmatter 与正文」这一条 */
type ParseFrontMatterLike = (params: Params) => Promise<{
  frontMatter: Record<string, unknown>;
  content: string;
}>;

/** 假的解析器：传 `base` 就是「站点写过的那份」 */
const fakeParse =
  (base?: Record<string, unknown>) =>
  async ({ filePath }: Params) => ({
    frontMatter: { title: DOC, ...base, path: filePath },
    content: '正文',
  });

/** 每条用例自己那份规则表：断言不跟着 `defaultRules` 改 */
const rule = (
  match: FrontMatterRule['match'],
  frontMatter: FrontMatterRule['frontMatter'],
): FrontMatterRule => ({ name: 'stub', match, frontMatter });

/** 手写一份仓库形状：不碰磁盘，专门用来量「算值那一步」的分支 */
const fakeRepo = (overrides: Partial<Repo> = {}): Repo => ({
  root: '/site',
  head: 1_000_000,
  recent: new Set(['packages/README.md']),
  times: new Map([
    ['packages/README.md', { created: 1_000_000, updated: 1_000_000 }],
  ]),
  ...overrides,
});

/** 跑一遍包装层，只看 frontmatter */
async function frontMatterOf(
  parse: ReturnType<typeof wrapParseFrontMatter>,
  path_ = DOC,
) {
  const { frontMatter } = await parse(params(path_));

  return frontMatter;
}

/** 包一层：规则表、站点标签、仓库各给一份缺省 */
const wrap = (
  base: ParseFrontMatterLike,
  {
    rules = defaultRules,
    tags,
    repo,
  }: { rules?: FrontMatterRule[]; tags?: readonly string[]; repo?: Repo } = {},
) => wrapParseFrontMatter(base, rules, tags ?? [], () => repo);

describe('applyRules：只补不覆盖', () => {
  const context = (frontMatter: Record<string, unknown>) => ({
    filePath: DOC,
    frontMatter,
    tags: [] as readonly string[],
    repo: undefined,
  });

  it('地盘命中时把缺的那几格补上，并交回补了哪几格', async () => {
    const frontMatter = { title: 'a' };

    expect(
      await applyRules(context(frontMatter), [
        rule('.md', { draft: true, custom: 'x' }),
      ]),
    ).toEqual(['draft', 'custom']);
    expect(frontMatter).toEqual({ title: 'a', draft: true, custom: 'x' });
  });

  it('已经有了的键一个都不动，算值那一步也不跑', async () => {
    const frontMatter = { title: '站点写的' };
    let called = false;

    expect(
      await applyRules(context(frontMatter), [
        rule('.md', {
          title: () => {
            called = true;
            return '规则写的';
          },
        }),
      ]),
    ).toEqual([]);
    expect(frontMatter.title).toBe('站点写的');
    expect(called).toBe(false);
  });

  it('值写成 undefined 也算「已经有了」，不再补', async () => {
    const frontMatter: Record<string, unknown> = { markmap: undefined };

    await applyRules(context(frontMatter), [rule('.md', { markmap: true })]);

    expect(Object.hasOwn(frontMatter, 'markmap')).toBe(true);
    expect(frontMatter.markmap).toBeUndefined();
  });

  it('原型链上的名字挡不住注入（用 hasOwn 判，不用 in）', async () => {
    const frontMatter: Record<string, unknown> = {};

    await applyRules(context(frontMatter), [
      rule('.md', { constructor: '我自己的' }),
    ]);

    expect(frontMatter.constructor).toBe('我自己的');
  });

  it('地盘没命中的规则整条跳过；字符串按后缀比，正则原样', async () => {
    const frontMatter: Record<string, unknown> = {};

    await applyRules({ ...context(frontMatter), filePath: '/site/blog/a.md' }, [
      rule(/\/docs\//, { draft: true }),
      rule('.md.bak', { draft: true }),
      rule('.md', { testing: true }),
    ]);

    expect(frontMatter).toEqual({ testing: true });
  });

  it('算值那一步返回 undefined：不写键', async () => {
    const frontMatter: Record<string, unknown> = { title: 'a' };

    expect(
      await applyRules(context(frontMatter), [
        rule('.md', { draft: () => undefined, custom: 'x' }),
      ]),
    ).toEqual(['custom']);
    expect(Object.hasOwn(frontMatter, 'draft')).toBe(false);
  });

  it('算值那一步拿得到文件路径、此刻的 frontmatter 与站点的 tags', async () => {
    const frontMatter: Record<string, unknown> = { title: 'a' };
    const contextWithTags = { ...context(frontMatter), tags: ['站点的'] };

    await applyRules(contextWithTags, [
      rule('.md', {
        slug: (ctx: RuleContext) =>
          `${ctx.filePath}:${String(ctx.frontMatter.title)}`,
        tags: (ctx: RuleContext) => ctx.tags,
      }),
    ]);

    expect(frontMatter.slug).toBe(`${DOC}:a`);
    expect(frontMatter.tags).toEqual(['站点的']);
  });

  it('算值那一步可以是异步的（问 git 那条路）', async () => {
    const frontMatter: Record<string, unknown> = {};

    await applyRules(context(frontMatter), [
      rule('.md', { tags: async () => ['异步'] }),
    ]);

    expect(frontMatter.tags).toEqual(['异步']);
  });

  it('tags 是例外：已有的与算出来的合并，不是整格让位', async () => {
    const frontMatter: Record<string, unknown> = { tags: ['页面'] };

    expect(
      await applyRules(context(frontMatter), [
        rule('.md', { tags: () => ['注入', '页面'] }),
      ]),
    ).toEqual(['tags']);
    // 去重后排序
    expect(frontMatter.tags).toEqual(['注入', '页面']);
  });

  it('页面写了单个字符串也收成数组，与注入的并起来', async () => {
    const frontMatter: Record<string, unknown> = { tags: 'blog' };

    await applyRules(context(frontMatter), [rule('.md', { tags: ['注入'] })]);

    expect(frontMatter.tags).toEqual(['blog', '注入']);
  });

  it('页面写了别的形状（数字、带对象的数组）就原样交回，不替它改类型', async () => {
    for (const owned of [42, [{ label: 'a' }], null]) {
      const frontMatter: Record<string, unknown> = { tags: owned };

      expect(
        await applyRules(context(frontMatter), [
          rule('.md', { tags: () => ['注入'] }),
        ]),
      ).toEqual([]);
      expect(frontMatter.tags).toBe(owned);
    }
  });

  it('合并结果与原来一模一样时不算补过（包装层靠这个决定换不换对象）', async () => {
    const frontMatter: Record<string, unknown> = { tags: ['a', 'b'] };

    expect(
      await applyRules(context(frontMatter), [
        rule('.md', {
          tags: () => ['a'],
          // 这一格是新的，整条规则因此仍算「补过」
          draft: true,
        }),
      ]),
    ).toEqual(['draft']);
    expect(frontMatter.tags).toEqual(['a', 'b']);
  });

  it('算出来那一串里非字符串的项丢掉（规则表写错不该污染 tags）', async () => {
    const frontMatter: Record<string, unknown> = { tags: ['页面'] };

    await applyRules(context(frontMatter), [
      rule('.md', { tags: () => ['注入', 42] }),
    ]);

    expect(frontMatter.tags).toEqual(['注入', '页面']);
  });

  it('算出来的 tags 不是数组：当没有，页面那几条原样留着', async () => {
    const frontMatter: Record<string, unknown> = { tags: ['页面'] };

    expect(
      await applyRules(context(frontMatter), [
        rule('.md', { tags: () => 'x' }),
      ]),
    ).toEqual([]);
    expect(frontMatter.tags).toEqual(['页面']);
  });
});

describe('mergeTags：去重、排序、形状判据', () => {
  it('并起来去重后排序', () => {
    expect(mergeTags(['b', 'a'], ['a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('单个字符串当作只有一条', () => {
    expect(mergeTags('blog', ['注入'])).toEqual(['blog', '注入']);
  });

  it('带非字符串的数组原样交回（不替页面改类型）', () => {
    const owned = ['a', 1];

    expect(mergeTags(owned, ['注入'])).toBe(owned);
  });

  it('什么都没有的时候就是注入那一份', () => {
    expect(mergeTags([], ['注入'])).toEqual(['注入']);
  });
});

describe('地盘：只对文档插件扫得到的那批文件动手', () => {
  // 假站点根也过一遍平台的 `resolve()`：Windows 上 `'/site'` 会补出当前盘（`D:/site`），
  // 与 `docsContentPath()` / `covers()` 里那一次 resolve 同一形状。钉的仍是那几件事
  // （缺省 `docs`、`path` 换根、include/exclude 的认领范围），不是钉 POSIX 那一串分隔符。
  const root = path.resolve('/site').replaceAll('\\', '/');

  /** 站点里真实的那一份：内容根是 `packages/`，按包点名收 */
  const scope = createScope(`${root}/packages`, {
    include: ['README.md', '*/README.md', '*/docs/**/*.{md,dbml}'],
    exclude: ['**/node_modules/**', '**/build/**', '**/.docusaurus/**'],
  });

  it('内容根默认是 `<站点根>/docs`，`path` 换成别的就跟着换', () => {
    expect(docsContentPath(root, {})).toBe(`${root}/docs`);
    expect(docsContentPath(root, { path: 'packages' })).toBe(
      `${root}/packages`,
    );
    expect(docsContentPath(root, { path: 'content/docs' })).toBe(
      `${root}/content/docs`,
    );
  });

  it('include 收的才收：内容根外的 README 与包根上的其他 md 不进站点', () => {
    for (const [path, expected] of [
      // 主页：内容根自己那一份，靠第一条点名收进来（`*/README.md` 差一整段）
      ['README.md', true],
      ['a/README.md', true],
      ['a/docs/internals.md', true],
      ['a/docs/demo.dbml', true],
      // 内容根之外：仓库根那份 README、顶层 `docs/`、`tools/`、`src/theme/` 都不进站点
      ['../README.md', false],
      ['../docs/intro.md', false],
      ['../tools/README.md', false],
      ['../src/theme/README.md', false],
      // 包根上的其他 md 不在 include 里：include 是点名的，不是按目录放开的
      ['a/NOTES.md', false],
      // include 明写 `.md`/`.dbml`：`*/docs/**` 下没有 `.mdx` 这一格
      ['a/docs/internals.mdx', false],
    ] as const) {
      expect(scope.covers(path), path).toBe(expected);
    }
  });

  it('exclude 挡掉的才不收：装出来的依赖与产物目录，连包里的 build 也算', () => {
    for (const path of [
      'node_modules/a/README.md',
      'a/node_modules/x/README.md',
      'build/docs/a.md',
      'a/build/README.md',
      '.docusaurus/a.md',
    ]) {
      expect(scope.covers(path), path).toBe(false);
    }
  });

  it('内容根之外的路径一律不收（官方匹配器只认自己那棵根，先自己判）', () => {
    expect(scope.covers('/elsewhere/docs/a.md')).toBe(false);
    // mdx-loader 递进来的那种带协议的假路径：折进内容根之后也不再是那几条 include 认得的样子
    expect(scope.covers('webpack:///./notes.md')).toBe(false);
  });

  it('相对内容根的路径也认；Windows 分隔符先归一', () => {
    // 形状照上面那份 include 取（内容根是 `packages/`，包内 docs 才被收）：这里钉的是
    // 「相对内容根 / 反斜杠 / 绝对反斜杠」三种写法归一到同一判定，不是钉某一条 include。
    expect(scope.covers('a/docs/b.md')).toBe(true);
    expect(scope.covers(String.raw`a\docs\b.md`)).toBe(true);
    expect(scope.covers(String.raw`${root}\packages\a\docs\b.md`)).toBe(true);
  });

  it('没转述 include 时按官方缺省收 md/mdx，`exclude` 不兜默认', () => {
    expect(DEFAULT_INCLUDE).toEqual(['**/*.{md,mdx}']);
    const bare = createScope(`${root}/docs`);

    // 不转述 include 时按官方的缺省口径收（`**/*.{md,mdx}`）
    expect(bare.covers(`${root}/docs/a.md`)).toBe(true);
    expect(bare.covers(`${root}/docs/sub/a.mdx`)).toBe(true);
    expect(bare.covers(`${root}/docs/sub/a.dbml`)).toBe(false);
    expect(bare.covers(`${root}/packages/a/README.md`)).toBe(false);
  });

  it('scopeOf 拿站点根与 docs.path 拼内容根，与文档插件自己算的口径一致', () => {
    expect(scopeOf(root, { path: 'packages' }).contentPath).toBe(
      `${root}/packages`,
    );
    expect(scopeOf(root, {}).contentPath).toBe(`${root}/docs`);
  });

  it('地盘之外的文件连一条规则都不跑（算值那一步不跑、git 也不问）', async () => {
    const frontMatter: Record<string, unknown> = {};
    let asked = false;

    expect(
      await applyRules(
        {
          filePath: '/site/README.md',
          frontMatter,
          tags: [],
          repo: undefined,
          scope,
        },
        [
          rule('.md', {
            tags: () => {
              asked = true;
              return ['不该来'];
            },
          }),
        ],
      ),
    ).toEqual([]);
    expect(frontMatter).toEqual({});
    expect(asked).toBe(false);
  });
});

describe('tags 那把键怎么算（不碰磁盘）', () => {
  const tagsOfFile = (
    filePath: string,
    tags: readonly string[],
    repo: Repo | undefined,
  ) => tagsOf({ filePath, frontMatter: {}, tags, repo });

  it('只有配置里那份时原样交回，不另加 git 判出来的那两个', () => {
    expect(tagsOfFile('/site/docs/a.md', ['站点'], undefined)).toEqual([
      '站点',
    ]);
  });

  it('一个 commit 就是全部历史、且落在窗口里：算新（也就算最近更新）', () => {
    const repo = fakeRepo();

    expect(tagsOfFile('/site/packages/README.md', [], repo)).toEqual([
      NEW_TAG,
      UPDATE_TAG,
    ]);
  });

  it('提交过两次以上：不再算新，但还算更新', () => {
    const repo = fakeRepo({
      times: new Map([
        ['packages/README.md', { created: undefined, updated: 1_000_000 }],
      ]),
    });

    expect(tagsOfFile('/site/packages/README.md', [], repo)).toEqual([
      UPDATE_TAG,
    ]);
  });

  it('窗口外的老文件：一个都不加', () => {
    const repo = fakeRepo({
      recent: new Set(),
      times: new Map([
        ['packages/README.md', { created: undefined, updated: 0 }],
      ]),
    });

    expect(tagsOfFile('/site/packages/README.md', [], repo)).toEqual([]);
  });

  it('一次都没提交过（或不在这个仓库里）的文件：只留配置里那份', () => {
    const repo = fakeRepo({
      times: new Map([['packages/README.md', noTimes]]),
    });

    expect(tagsOfFile('/site/packages/README.md', ['站点'], repo)).toEqual([
      '站点',
    ]);
    expect(tagsOfFile('/elsewhere/a.md', ['站点'], repo)).toEqual(['站点']);
  });
});

describe('git 那一侧（真 git 仓库）', () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const DAY = 86_400;
  const now = Math.floor(Date.now() / 1000);

  /** 空仓库骨架：`git init` + 自己给时刻的提交（重命名与空仓库两组都用） */
  function gitRepo(prefix: string) {
    const root = mkdtempReal(path.join(os.tmpdir(), prefix));
    roots.push(root);

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
    const { root, run } = gitRepo('frontmatter-git-');

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
      findRepoRoot(path.join(os.tmpdir(), 'frontmatter-no-such-dir', 'nested')),
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
    expect(
      tagsOf({ filePath: loose, frontMatter: {}, tags: [], repo }),
    ).toEqual([]);
  });

  it('七天内的算更新、只提交过一次的还算新；最后一个提交里的老文件也算更新', () => {
    const { root, repo } = makeRepo();

    expect(
      tagsOf({
        filePath: path.join(root, 'new.md'),
        frontMatter: {},
        tags: [],
        repo,
      }),
    ).toEqual([UPDATE_TAG]);
    expect(
      tagsOf({
        filePath: path.join(root, 'old.md'),
        frontMatter: {},
        tags: [],
        repo,
      }),
    ).toEqual([NEW_TAG, UPDATE_TAG]);
  });

  it('重命名过的文件按提交数算历史：不会把两段历史误判成「只提交过一次」', () => {
    const { root, run, commit } = gitRepo('frontmatter-rename-');
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

  it('空仓库（`git init` 还没有首个提交）：按「没有历史」处理，不阻断构建', () => {
    const { root } = gitRepo('frontmatter-empty-');

    // 找得到仓库根，但 `git log` 在空仓库上以 128 退出 —— 这一格以前会把构建直接抛停
    expect(findRepoRoot(root)).toBeDefined();
    expect(openRepoFrom(root)).toBeUndefined();
  });
});

describe('wrapParseFrontMatter：包装而非覆盖', () => {
  /** 站点形状的那份地盘：内容根是整棵站点，只收 `docs/` 下的 md */
  const docsOnly = () => createScope('/site', { include: ['docs/**/*.md'] });

  it('注入叠在 base 的结果上：base 先跑，站点自己改写的那几格还在', async () => {
    const base = async () => ({
      frontMatter: { title: 'base 改过' },
      content: 'base 的正文',
    });

    expect(
      await frontMatterOf(
        wrap(base, { rules: [rule('.md', { draft: true })] }),
      ),
    ).toEqual({ title: 'base 改过', draft: true });
  });

  it('注入只改元数据：content 原样交回，解析结果不动', async () => {
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const result = await wrap(async () => parsed, {
      rules: [rule('.md', { draft: true })],
    })(params());

    expect(result.content).toBe('正文');
    expect(result.frontMatter).toEqual({ title: 'a', draft: true });
    // 新对象：下游按引用比较时不至于以为「什么都没变」
    expect(result.frontMatter).not.toBe(parsed.frontMatter);
    expect(parsed.frontMatter).toEqual({ title: 'a' });
  });

  it('一条都没补上时原样交回 base 那份（连对象都不换）', async () => {
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const wrapped = wrap(async () => parsed, {
      rules: [rule(/\/blog\//, { draft: true })],
    });

    expect(await wrapped(params())).toBe(parsed);
  });

  it('frontMatter 不是普通对象时原样交回，不去改别人的返回值', async () => {
    for (const frontMatter of [undefined, null, ['a']]) {
      const parsed = { frontMatter, content: '正文' };
      const result = await wrap(async () => parsed as never, {
        rules: [rule('.md', { draft: true })],
      })(params());

      expect(result).toEqual(parsed);
    }
  });

  it('规则的地盘没命中时连 git 都不问', async () => {
    let asked = false;
    const wrapped = wrapParseFrontMatter(
      fakeParse(),
      [rule(/\/blog\//, { draft: true })],
      [],
      () => {
        asked = true;
        return undefined;
      },
    );
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const wrapped2 = wrapParseFrontMatter(
      async () => parsed,
      [rule(/\/blog\//, { draft: true })],
      [],
      () => {
        asked = true;
        return undefined;
      },
      docsOnly(),
    );

    expect(await wrapped2(params())).toBe(parsed);
    expect(await frontMatterOf(wrapped)).toMatchObject({ title: DOC });
    expect(asked).toBe(false);
  });

  it('文档插件地盘之外的文件原样交回：一条规则不跑，git 也不问', async () => {
    let asked = false;
    const parsed = { frontMatter: { title: 'a' }, content: '正文' };
    const wrapped = wrapParseFrontMatter(
      async () => parsed,
      [rule('.md', { draft: true })],
      [],
      () => {
        asked = true;
        return undefined;
      },
      docsOnly(),
    );

    // 同一份 md，但不在文档插件扫的那批里
    expect(await wrapped(params('/site/README.md'))).toBe(parsed);
    expect(asked).toBe(false);
    // 地盘之内的照旧补上
    expect(await frontMatterOf(wrapped, '/site/docs/a.md')).toMatchObject({
      draft: true,
    });
  });

  it('地盘那一步与 applyRules 那一步各判一次，谁单独在场都挡得住', async () => {
    const frontMatter: Record<string, unknown> = {};

    // 只给 applyRules 地盘：包装层放行，规则表那层自己挡
    expect(
      await applyRules(
        {
          filePath: '/site/README.md',
          frontMatter,
          tags: [],
          repo: undefined,
          scope: docsOnly(),
        },
        [rule('.md', { draft: true })],
      ),
    ).toEqual([]);
    expect(frontMatter).toEqual({});
  });

  it('Windows 路径先归一再比规则，正则那条规则也吃得到', async () => {
    const wrapped = wrap(fakeParse(), {
      rules: [rule(/\/docs\//, { draft: true })],
    });

    expect(
      await frontMatterOf(wrapped, String.raw`C:\site\docs\intro.md`),
    ).toMatchObject({ draft: true });
  });

  it('包两次只有一层：第二次原样交回同一个函数', () => {
    const wrapped = wrap(fakeParse(), {
      rules: [rule('.md', { draft: true })],
    });

    expect(
      wrapParseFrontMatter(
        wrapped,
        [rule('.md', { title: '第二次' })],
        [],
        () => undefined,
      ),
    ).toBe(wrapped);
  });

  it('包装不丢 base 的异常：抛就抛出去', async () => {
    const wrapped = wrap(() => Promise.reject(new Error('yaml 坏了')), {
      rules: [rule('.md', { testing: true })],
    });

    await expect(wrapped(params())).rejects.toThrow('yaml 坏了');
  });
});

describe('defaultRules：只补 tags 一把键', () => {
  it('md/mdx 都吃得到', async () => {
    const repo = fakeRepo();

    expect(
      await frontMatterOf(wrap(fakeParse(), { repo, tags: ['站点'] })),
    ).toEqual({
      title: DOC,
      path: DOC,
      tags: ['站点', NEW_TAG, UPDATE_TAG],
    });
  });

  it('页面自己写了 tags：与注入的那几条合并（去重、排序），不是整格让位', async () => {
    const repo = fakeRepo();

    expect(
      await frontMatterOf(
        wrap(fakeParse({ tags: ['站点自己写的', UPDATE_TAG] }), {
          repo,
          tags: ['站点'],
        }),
      ),
    ).toMatchObject({
      tags: [NEW_TAG, UPDATE_TAG, '站点', '站点自己写的'],
    });
  });

  it('不替主题层补它们自己的键', async () => {
    const frontMatter = await frontMatterOf(
      wrap(fakeParse(), { repo: fakeRepo() }),
    );

    for (const key of ['testing', 'markmap', 'diff', 'iframe', 'oas3']) {
      expect(Object.hasOwn(frontMatter, key)).toBe(false);
    }
  });

  it('管不到非 md 文件', async () => {
    const frontMatter: Record<string, unknown> = {};

    await applyRules(
      {
        filePath: '/site/docs/a.dbml',
        frontMatter,
        tags: [],
        repo: fakeRepo(),
      },
      defaultRules,
    );

    expect(frontMatter).toEqual({});
  });
});

describe('plugin-frontmatter-injector 插件接线', () => {
  /**
   接线那几层拿的是真站点根：`DOC` 那份 `/site/packages/README.md` 在磁盘上不存在，而地盘是按
   `siteDir + docs.path` 拼出来的 —— 所以 `docs.path` 指到测试文件所在的目录，`DOC` 也就落在
   地盘之内。这一格同时钉住「内容根跟着 `docs.path` 走」，不必为了测接线造一个假站点。
  */
  const DOCS_PATH = '__fixtures__/docs';

  /** 「站点不在 git 里」那条用例的临时内容根（相对临时站点根） */
  const outDocs = 'docs';

  /** 站点配置里共享的那份 `markdown`：除了解析器，还住着兄弟键 */
  const createMarkdown = (
    parseFrontMatter: ParseFrontMatterLike = fakeParse(),
  ) => ({
    parseFrontMatter,
    preprocessor: (params_: { fileContent: string }) => params_.fileContent,
    format: 'mdx',
  });

  function loadPlugin(
    options: Parameters<typeof frontMatterInjectorPlugin>[1] = undefined,
    markdown = createMarkdown(),
  ) {
    const context = {
      siteDir: path.dirname(DOC),
      siteConfig: { markdown },
    } as unknown as Parameters<typeof frontMatterInjectorPlugin>[0];

    return {
      markdown,
      plugin: frontMatterInjectorPlugin(context, {
        docs: { path: DOCS_PATH },
        ...options,
      }),
    };
  }

  /** 站点的两条消费路径读到的都是同一个属性，这里只造一次调用 */
  async function parseFrontMatter(markdown: ReturnType<typeof createMarkdown>) {
    const { frontMatter } = await markdown.parseFrontMatter(
      params(path.join(path.dirname(DOC), DOCS_PATH, 'intro.md')),
    );

    return frontMatter;
  }

  it('插件名就是包名，且不声明任何客户端模块', () => {
    const { plugin } = loadPlugin();

    expect(plugin.name).toBe(
      '@show-docs/docusaurus-plugin-frontmatter-injector',
    );
    expect(plugin.getClientModules).toBeUndefined();
    expect(plugin.getThemePath).toBeUndefined();
  });

  it('构造函数本身不碰站点配置：那时别的插件可能还没跑完', () => {
    const base = fakeParse();
    const { markdown } = loadPlugin(undefined, createMarkdown(base));

    expect(markdown.parseFrontMatter).toBe(base);
  });

  it('站点不在 git 里时也能装上：没有 git 那一半，构建照走', async () => {
    const cwd = process.cwd();
    const outside = mkdtempReal(path.join(os.tmpdir(), 'outside-repo-'));
    // 站点根挪到临时目录：`siteDir + docs.path` 因此也落在仓库之外
    const markdown = createMarkdown();

    try {
      process.chdir(outside);
      const plugin = frontMatterInjectorPlugin(
        {
          siteDir: outside,
          siteConfig: { markdown },
        } as unknown as Parameters<typeof frontMatterInjectorPlugin>[0],
        { tags: ['站点'], docs: { path: outDocs } },
      );

      plugin.loadContent?.();

      const { frontMatter } = await markdown.parseFrontMatter(
        params(path.join(outside, outDocs, 'intro.md')),
      );

      expect(frontMatter).toMatchObject({ tags: ['站点'] });
    } finally {
      process.chdir(cwd);
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('找仓库从 siteDir 起步：工作目录在仓库之外时 git 那一半照样生效', async () => {
    const cwd = process.cwd();
    const root = mkdtempReal(path.join(os.tmpdir(), 'injector-sitedir-'));
    const outside = mkdtempReal(path.join(os.tmpdir(), 'injector-cwd-'));
    try {
      const run = (args: string[]) =>
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

      // 关键那一格：工作目录挪到另一个临时目录，它本身不是仓库
      process.chdir(outside);

      const markdown = createMarkdown();
      frontMatterInjectorPlugin(
        {
          siteDir: root,
          siteConfig: { markdown },
        } as unknown as Parameters<typeof frontMatterInjectorPlugin>[0],
        { tags: ['站点'] },
      ).loadContent?.();

      const { frontMatter } = await markdown.parseFrontMatter(
        params(path.join(root, 'docs', 'intro.md')),
      );

      // 读到的必须是 siteDir 那个仓库：刚提交过的那份算「新」
      expect(frontMatter.tags).toEqual(
        expect.arrayContaining(['站点', NEW_TAG]) as string[],
      );
    } finally {
      process.chdir(cwd);
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('loadContent 之后站点那份解析器被包住，兄弟键连引用都不换', async () => {
    const { plugin, markdown } = loadPlugin();
    const { preprocessor } = markdown;

    plugin.loadContent?.();

    // 用例跑在仓库里，所以 git 那一侧真读得到：只断言 tags 这把键在
    expect(await parseFrontMatter(markdown)).toMatchObject({
      tags: expect.any(Array) as string[],
    });
    expect(markdown.preprocessor).toBe(preprocessor);
    expect(markdown.format).toBe('mdx');
  });

  it('两个阶段都调也不会套第二层（reloadSite 只重跑 contentLoaded）', () => {
    const { plugin, markdown } = loadPlugin();

    plugin.loadContent?.();
    const once = markdown.parseFrontMatter;
    plugin.contentLoaded?.({} as never);

    expect(markdown.parseFrontMatter).toBe(once);
  });

  it('只重跑 contentLoaded（reloadSite 那条路）时也包得上', async () => {
    const { plugin, markdown } = loadPlugin();

    plugin.contentLoaded?.({} as never);

    expect(await parseFrontMatter(markdown)).toMatchObject({
      tags: expect.any(Array) as string[],
    });
  });

  it('选件：rules 传空数组时一个字节都不改', () => {
    const base = fakeParse();
    const { plugin, markdown } = loadPlugin(
      { rules: [] },
      createMarkdown(base),
    );

    expect(() => plugin.loadContent?.()).not.toThrow();
    expect(() => plugin.contentLoaded?.({} as never)).not.toThrow();
    expect(markdown.parseFrontMatter).toBe(base);
  });

  it('选件：站点自己的 tags 跟着注入一起写进 frontmatter', async () => {
    const { plugin, markdown } = loadPlugin({ tags: ['站点'] });

    plugin.loadContent?.();

    expect(await parseFrontMatter(markdown)).toMatchObject({
      tags: expect.arrayContaining(['站点']) as string[],
    });
  });

  it('选件：自定义规则表说了算，只补不覆盖', async () => {
    const { plugin, markdown } = loadPlugin({
      rules: [rule('.md', { title: '被规则改掉' })],
    });

    plugin.loadContent?.();

    // `title` 是 base 给的，稳
    expect(await parseFrontMatter(markdown)).toMatchObject({ title: DOC });
  });

  it('选件：只给 `tags` 时内容根是 `<站点根>/docs`，别处的文件一个标签都不补', async () => {
    const markdown = createMarkdown();
    const context = {
      siteDir: path.dirname(DOC),
      siteConfig: { markdown },
    } as unknown as Parameters<typeof frontMatterInjectorPlugin>[0];

    frontMatterInjectorPlugin(context, { tags: ['站点'] }).loadContent?.();

    // 这个路径不在 `<站点根>/docs` 里（它在 `__fixtures__/docs`）
    const { frontMatter } = await markdown.parseFrontMatter(
      params(path.join(path.dirname(DOC), DOCS_PATH, 'intro.md')),
    );

    expect(Object.hasOwn(frontMatter, 'tags')).toBe(false);
  });

  it('选件：整个选项都不传时也一样（内容根跟着 docs 那份缺省走）', async () => {
    const markdown = createMarkdown();
    const context = {
      siteDir: path.dirname(DOC),
      siteConfig: { markdown },
    } as unknown as Parameters<typeof frontMatterInjectorPlugin>[0];

    expect(() =>
      frontMatterInjectorPlugin(context).loadContent?.(),
    ).not.toThrow();

    const { frontMatter } = await markdown.parseFrontMatter(
      params(path.join(path.dirname(DOC), DOCS_PATH, 'intro.md')),
    );

    expect(Object.hasOwn(frontMatter, 'tags')).toBe(false);
  });

  it('选件：构造插件时不读 git（那一次读留到第一次问历史）', () => {
    const base = fakeParse();
    const { markdown } = loadPlugin(undefined, createMarkdown(base));

    expect(markdown.parseFrontMatter).toBe(base);
  });

  it('站点没写 parseFrontMatter（官方填进来的默认值）时照样包得住', async () => {
    const markdown = createMarkdown(DEFAULT_PARSE_FRONT_MATTER);
    const context = {
      siteDir: path.dirname(DOC),
      siteConfig: { markdown },
    } as unknown as Parameters<typeof frontMatterInjectorPlugin>[0];

    frontMatterInjectorPlugin(context, {
      docs: { path: DOCS_PATH },
    }).loadContent?.();

    const result = await markdown.parseFrontMatter({
      ...params(path.join(path.dirname(DOC), DOCS_PATH, 'intro.md')),
      fileContent: '---\ntitle: 原文\n---\n\n# 标题 {#custom}\n',
    });

    // 真的走了 yaml 解析：原来那格在、注入那格也补上，且正文原样
    expect(result.frontMatter).toMatchObject({
      title: '原文',
      tags: expect.any(Array) as string[],
    });
    expect(result.content).toContain('{#custom}');
  });
});
