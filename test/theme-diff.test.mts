import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_PARSE_FRONT_MATTER } from '@docusaurus/utils';

import {
  diffSpecOf,
  resolveDiffTarget,
} from '../packages/theme-diff/src/loader/diff-decision.mts';
import type { DiffSpec } from '../packages/theme-diff/src/loader/diff-decision.mts';
import {
  findRepoRoot,
  readFilesChange,
  readLastChange,
  repoPathFromRoot,
} from '../packages/theme-diff/src/loader/git-diff.mts';
import loader from '../packages/theme-diff/src/loader/md-diff-loader.mts';
import type { DiffData } from '../packages/theme-diff/src/types.mts';

import { mkdtempReal } from './helpers.mts';

/**
## theme-diff 的两段判据

这一层的产物是「上一个版本 → 此刻这一份」的差异，判据全在构建期：frontmatter 那把键怎么读、要读
哪一份文件、git 里那一次改动怎么落成一份数据。这一段没有浏览器参与，`pnpm build` 全绿也证明不了它
算得对 —— 只有单测能量；页面上那块视图对不对，由 `test/e2e/features/diff.feature` 钉。

git 那两组用例走**真实的 git**：临时目录里 `git init` 真提交几次，夹具造的仓库形状就是这一层
在读的那种。这里不 mock `execFileSync`，因为这一层最容易坏的地方恰恰是「参数怎么拼、git 的输出
长什么样」，替身把这些都替掉了。
*/

/** 编译好的 MDX 原文：这一层的 loader 只在它后面追加一条导出，内容本身无所谓。 */
const MDX_SOURCE = 'export default function MDXContent() {};\n';

/**
一次 loader 调用的四样产出：交回 webpack 的内容、错误、`emitWarning` 收到的告警，
以及 `addDependency` 登记的依赖。
*/
interface LoaderRun {
  output: string | null;
  error: string | null;
  warnings: string[];
  dependencies: string[];
}

/**
用一个假的 loader 上下文跑一遍本包那条 `enforce: 'post'` loader。

真实上下文由 webpack 逐次构造，这一层只用到 `cacheable` / `async` / `resourcePath` /
`emitWarning` / `addDependency` 五件，其余一概不需要 —— 需要别的就是新增依赖，那时候这条
替身会跟着变宽。判据走的是官方那份异步解析，所以要等回调真的被调用才收工。
*/
async function runLoader(resourcePath: string): Promise<LoaderRun> {
  const warnings: string[] = [];
  const dependencies: string[] = [];
  const result: LoaderRun = {
    output: null,
    error: null,
    warnings,
    dependencies,
  };
  const { promise, resolve } = Promise.withResolvers<LoaderRun>();

  const context = {
    resourcePath,
    cacheable: () => undefined,
    addDependency: (file: string) => {
      dependencies.push(file);
    },
    emitWarning: (warning: string | Error) => {
      warnings.push(String(warning));
    },
    async: () => (error: Error | null, source?: string) => {
      result.error = error ? error.message : null;
      result.output = source ?? null;
      resolve(result);
    },
  };

  loader.call(context as never, MDX_SOURCE);
  return promise;
}

/** 取出产物末尾那条 `export const diff`，按 `DiffData` 读回来。 */
function exportedDiff(output: string | null): DiffData {
  const raw = /export const diff = (.*);\n$/.exec(output ?? '')?.[1];

  expect(raw, '产物末尾该有一条 `export const diff`').toBeDefined();

  return JSON.parse(raw!) as DiffData;
}

/** 带 frontmatter 的 md 源文件，落在 `docs/a.md`；`diff:` 那把键由用例给。 */
function writeMd(dir: string, diffKey: string): string {
  const file = path.join(dir, 'docs/a.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `---\ntitle: a.md\n${diffKey}\n---\n\n正文一行。\n`,
    'utf8',
  );
  return file;
}

/**
临时仓库里的每一次 `git` 都带上 `commit.gpgsign=false`：宿主的全局配置若把签名打开了，
这些夹具提交会以 `gpg failed to sign the data` 全数失败 —— 那是环境的事，不是被测那份代码的事。
*/
function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

/** 把 `{ 仓库相对路径: 内容 }` 落到仓库里。 */
function writeFiles(root: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
}

/** 后续某一次改动：写这几份文件、删掉那几份，然后提交一句 `message`。 */
interface RepoChange {
  message: string;
  write?: Record<string, string>;
  remove?: string[];
}

/** 一个提交到底的临时仓库：`files` 是第一次提交里的内容，`changes` 依次是后续各次改动。 */
function makeRepo(options: {
  files?: Record<string, string>;
  changes?: RepoChange[];
}): string {
  const root = mkdtempReal(path.join(os.tmpdir(), 'diff-loader-repo-'));
  git(root, ['init', '-b', 'main']);
  const commit = (message: string) =>
    git(root, [
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.com',
      'commit',
      '-m',
      message,
    ]);

  writeFiles(root, options.files ?? {});
  git(root, ['add', '-A']);
  commit('first');

  const changes = options.changes ?? [];
  for (const change of changes) {
    writeFiles(root, change.write ?? {});

    const removed = change.remove ?? [];
    for (const name of removed) {
      fs.rmSync(path.join(root, name), { force: true });
    }

    git(root, ['add', '-A']);
    commit(change.message);
  }

  return root;
}

const tempDirs: string[] = [];
const repo = (options: Parameters<typeof makeRepo>[0]): string => {
  const root = makeRepo(options);
  tempDirs.push(root);
  return root;
};

/** 把仓库里此刻的内容提交一句 `second`：夹具用它把「工作区干净」这一形状造出来。 */
function commitAll(dir: string): void {
  git(dir, ['add', '-A']);
  git(dir, [
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '-m',
    'second',
  ]);
}

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
把一段 frontmatter 正文按**官方那一条**（`DEFAULT_PARSE_FRONT_MATTER`，docs 插件没换读法时
用的就是它）解析，再落成 {@link diffSpecOf} 的结果：这一族的判据与站点那条规则同源，用例也
就从同一份解析出发，不再自己切文本。
*/
async function specOf(frontMatterBlock: string): Promise<DiffSpec | undefined> {
  const { frontMatter } = await DEFAULT_PARSE_FRONT_MATTER({
    fileContent: `---\n${frontMatterBlock}\n---\n\n正文\n`,
    filePath: 'fixture.md',
  });
  return diffSpecOf(frontMatter);
}

describe('frontmatter 那把键的读法：与站点那条规则同一个来源', () => {
  it('`true` 与加不加引号的路径都算开了，值落成 YAML 给的那一种', async () => {
    expect(await specOf('diff: true')).toEqual({
      kind: 'single',
      value: 'true',
    });
    expect(await specOf('diff: ../docs/intro.md')).toEqual({
      kind: 'single',
      value: '../docs/intro.md',
    });
    expect(await specOf('diff: "../docs/intro.md"')).toEqual({
      kind: 'single',
      value: '../docs/intro.md',
    });
  });

  it('带引号的键名也算开了：以前只有站点那边认得，页面因此少半块视图', async () => {
    expect(await specOf('"diff": true')).toEqual({
      kind: 'single',
      value: 'true',
    });
    expect(await specOf("'diff': 'a.md'")).toEqual({
      kind: 'single',
      value: 'a.md',
    });
  });

  it('`diff:true` 不带空格：官方读不成一把键，两边一起看不见', async () => {
    // 自己切文本的那一套会把它当成写了这把键（站点却看不见），只剩这一种表现才算收敛
    expect(await specOf('diff:true')).toBeUndefined();
  });

  it('`false`、`null` 与空值都算没开', async () => {
    expect(await specOf('diff: false')).toBeUndefined();
    expect(await specOf('diff: null')).toBeUndefined();
    expect(await specOf('diff:')).toBeUndefined();
    expect(await specOf('diff:    ')).toBeUndefined();
    expect(await specOf('title: 没有这把键')).toBeUndefined();
  });

  it('冒号后面是制表符也吃得下', async () => {
    expect(await specOf('diff:\t true ')).toEqual({
      kind: 'single',
      value: 'true',
    });
  });

  it('值折行写在下面几行：流式与块式都是那两份，键名定角色', async () => {
    // 示例页的 frontmatter 就是流式折行那一种；块式是作者手写多行的那一种
    expect(
      await specOf('diff:\n  {\n    old: a.md,\n    new: b.md\n  }'),
    ).toEqual({ kind: 'pair', old: 'a.md', new: 'b.md' });
    expect(await specOf('diff:\n  new: b.md\n  old: a.md')).toEqual({
      kind: 'pair',
      old: 'a.md',
      new: 'b.md',
    });
    // 地址里带逗号：块式按行分，不受流式那一条限制
    expect(await specOf('diff:\n  old: a,b.md\n  new: c.md')).toEqual({
      kind: 'pair',
      old: 'a,b.md',
      new: 'c.md',
    });
  });

  it('缩进的注释与空行不改这把键的形状，下一个顶格键也不被吸进来', async () => {
    expect(
      await specOf(
        'diff:\n  # 对照哪两份\n  old: a.md\n  new: b.md\ntitle: 下一把键',
      ),
    ).toEqual({ kind: 'pair', old: 'a.md', new: 'b.md' });
    expect(
      await specOf('diff:\n  old: a.md\n\n  new: b.md\ntitle: 下一把键'),
    ).toEqual({ kind: 'pair', old: 'a.md', new: 'b.md' });
  });

  it('块式续行只有空白：与空值一样算没开', async () => {
    expect(await specOf('diff:\n   \ntitle: 下一把键')).toBeUndefined();
  });

  it('不是对象的那几种 frontmatter：整段是标量或数组时不算写了这把键', () => {
    // 官方解析失败、或整段是个标量时，交回的是那串原文而不是对象
    expect(diffSpecOf('diff:true')).toBeUndefined();
    expect(diffSpecOf(['a', 'b'])).toBeUndefined();
    expect(diffSpecOf(undefined)).toBeUndefined();
    expect(diffSpecOf(null)).toBeUndefined();
  });

  it('`resolveDiffTarget`：`true` 指本文自己，路径相对这份 md 所在目录', () => {
    // 取一个真实的绝对地址：`path.join` 在 Windows 上会把 `/site/...` 这种串当成
    // 「相对当前盘」，拼出来的结果与 Unix 不同口径，断言就跟着平台走。
    const self = path.join(path.resolve('fixture-site'), 'docs', 'page.md');
    expect(resolveDiffTarget('true', self)).toBe(self);
    expect(resolveDiffTarget('../other.md', self)).toBe(
      path.join(path.resolve('fixture-site'), 'other.md'),
    );
    expect(resolveDiffTarget('sub/other.md', self)).toBe(
      path.join(path.resolve('fixture-site'), 'docs', 'sub', 'other.md'),
    );
  });
});

describe('git 里的上一个版本与此刻这一份落成一份数据', () => {
  /** git 在 Windows 上把地址打成正斜杠，比较前先归一到同一口径。 */
  const samePath = (a: string): string => a.replaceAll('\\', '/');

  it('在仓库里就找得到根，不在仓库里返回 undefined', () => {
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    expect(samePath(findRepoRoot(path.join(root, 'docs')) ?? '')).toBe(
      samePath(fs.realpathSync(root)),
    );
    const outside = mkdtempReal(path.join(os.tmpdir(), 'diff-loader-norepo-'));
    tempDirs.push(outside);
    expect(findRepoRoot(outside)).toBeUndefined();
  });

  it('仓库相对路径向 git 问：子目录带前缀，仓库根上就只剩文件名', () => {
    const root = repo({
      files: { 'docs/a.md': '第一版\n', 'keep.md': '占位\n' },
    });
    // `--show-prefix` 带尾斜杠、仓库根上为空串，两种形状都要走到：拼出来的名字与 git
    // 自己的 pathspec 同一个口径，`git log -- <name>` 才不会被判成「outside repository」。
    expect(repoPathFromRoot(path.join(root, 'docs', 'a.md'))).toBe('docs/a.md');
    expect(repoPathFromRoot(path.join(root, 'keep.md'))).toBe('keep.md');
  });

  it('改过两次的文件：给出这次差异与改动之前那份内容', () => {
    const root = repo({
      files: { 'docs/a.md': '第一版\n' },
      changes: [{ message: 'second', write: { 'docs/a.md': '第二版\n' } }],
    });

    const last = readLastChange('docs/a.md', root);
    expect(last?.old).toContain('第一版');
    expect(last?.diff).toContain('第二版');
    expect(last?.diff).toContain('docs/a.md');
  });

  it('工作区里还有未提交的改动：改动落在右边，左边是这份文件上一次被提交的那一版', () => {
    const root = repo({
      files: { 'docs/a.md': '第一版\n' },
      changes: [{ message: 'second', write: { 'docs/a.md': '第二版\n' } }],
    });
    fs.writeFileSync(
      path.join(root, 'docs/a.md'),
      '第二版\n还没提交的一行\n',
      'utf8',
    );

    const last = readLastChange('docs/a.md', root);
    expect(last?.old).toContain('第二版');
    expect(last?.old, '上一个版本里不该有那行没提交的内容').not.toContain(
      '还没提交的一行',
    );
    expect(last?.diff).toContain('还没提交的一行');
  });

  it('只提交过一次、之后又改了：左边就是那一次提交里的内容', () => {
    const root = repo({ files: { 'docs/a.md': '唯一一版\n' } });
    fs.writeFileSync(
      path.join(root, 'docs/a.md'),
      '唯一一版\n改了的一行\n',
      'utf8',
    );

    const last = readLastChange('docs/a.md', root);
    expect(last?.old).toContain('唯一一版');
    expect(last?.diff).toContain('改了的一行');
  });

  it('还没提交过的文件：历史里没有它的上一个版本', () => {
    const root = repo({ files: { 'keep.md': '占位\n' } });
    writeFiles(root, { 'docs/new.md': '全新的一份\n' });

    expect(readLastChange('docs/new.md', root)).toBeUndefined();
  });

  it('只提交过一次且没有再改：没有可对比的上一次', () => {
    const root = repo({ files: { 'docs/a.md': '唯一一版\n' } });
    expect(readLastChange('docs/a.md', root)).toBeUndefined();
  });

  it('上一次提交删掉了它、这一版又加回来（还 staged）：这一版没有左边那一份', () => {
    // `git diff HEAD` 认索引里的新的一份，`--name-status` 因此给 `A` —— 与「提交里加回来」
    // 那一条走的是不同的分支：那一条比的是两个提交，这一条比的是提交与工作区。
    const root = repo({
      files: { 'docs/a.md': '第一版\n', 'keep.md': '占位\n' },
      changes: [{ message: 'remove', remove: ['docs/a.md'] }],
    });
    writeFiles(root, { 'docs/a.md': '重新加回来、还没提交\n' });
    git(root, ['add', '-A']);

    const last = readLastChange('docs/a.md', root);
    expect(last?.old).toBe('');
    expect(last?.diff).toContain('重新加回来、还没提交');
  });

  it('改名之后还能顺着旧名拿到上一版内容', () => {
    const root = repo({
      files: { 'docs/old.md': '旧名字里写的内容\n' },
      changes: [
        {
          message: 'rename',
          write: { 'docs/new.md': '旧名字里写的内容\n改了一行\n' },
          remove: ['docs/old.md'],
        },
      ],
    });

    const last = readLastChange('docs/new.md', root);
    expect(last?.old).toContain('旧名字里写的内容');
    expect(last?.diff).toContain('改了一行');
  });

  it('删掉又重新加回来的文件：这一次没有旧版本可读', () => {
    const root = repo({
      files: { 'docs/a.md': '第一版\n', 'keep.md': '占位\n' },
      changes: [
        { message: 'remove', remove: ['docs/a.md'] },
        { message: 're-add', write: { 'docs/a.md': '重新加回来\n' } },
      ],
    });

    const last = readLastChange('docs/a.md', root);
    expect(last?.old).toBe('');
    expect(last?.diff).toContain('重新加回来');
  });

  it('改名前的旧名是中文：旧名不被转义，上一版内容读得到（core.quotepath=false）', () => {
    // 默认 git 把非 ASCII 旧名转义成 "\346\226\207…"，拿那串去 git show 会读不到、整条抛。
    const root = repo({
      files: { 'docs/文档.md': '旧名字里写的内容\n' },
      changes: [
        {
          message: 'rename',
          write: { 'docs/new.md': '旧名字里写的内容\n改了一行\n' },
          remove: ['docs/文档.md'],
        },
      ],
    });

    const last = readLastChange('docs/new.md', root);
    expect(last?.old).toContain('旧名字里写的内容');
    expect(last?.diff).toContain('改了一行');
  });

  it('上一版内容的首尾空行与结尾换行原样保留（trim 掉会让视图展开上下文行号错位）', () => {
    const root = repo({
      files: { 'docs/a.md': '\n\n第一版\n最后一行\n\n' },
      changes: [
        {
          message: 'second',
          write: { 'docs/a.md': '\n\n第一版改了\n最后一行\n\n' },
        },
      ],
    });

    expect(readLastChange('docs/a.md', root)?.old).toBe(
      '\n\n第一版\n最后一行\n\n',
    );
  });

  it('工作区那一条同样保留上一版的首尾空行', () => {
    const root = repo({ files: { 'docs/a.md': '\n\n唯一一版\n\n' } });
    fs.writeFileSync(
      path.join(root, 'docs/a.md'),
      '\n\n唯一一版\n改了\n\n',
      'utf8',
    );

    expect(readLastChange('docs/a.md', root)?.old).toBe('\n\n唯一一版\n\n');
  });

  it('索引里删了、磁盘上却以未跟踪身份留着：比的是 HEAD 与磁盘，不是一句「删了」', () => {
    // git rm --cached 后再写回（或删了又重建但没 add）：git diff HEAD 看不见未跟踪文件，
    // 只报删除；右边本该是磁盘此刻这一份，所以拿 HEAD 那一份与磁盘比。
    const root = repo({
      files: { 'docs/a.md': '第一版\n', 'keep.md': '占位\n' },
    });
    git(root, ['rm', '--cached', '-q', 'docs/a.md']);
    fs.writeFileSync(
      path.join(root, 'docs/a.md'),
      '第二版（未跟踪）\n',
      'utf8',
    );

    const last = readLastChange('docs/a.md', root);
    expect(last?.old).toBe('第一版\n');
    expect(last?.diff).toContain('第二版（未跟踪）');
    expect(last?.diff).not.toContain('deleted file mode');
  });

  it('索引里删了、磁盘上那份与 HEAD 一样：没有可显示的改动', () => {
    const root = repo({
      files: { 'docs/a.md': '第一版\n', 'keep.md': '占位\n' },
    });
    git(root, ['rm', '--cached', '-q', 'docs/a.md']);

    expect(readLastChange('docs/a.md', root)).toBeUndefined();
  });

  it('真删了（磁盘上也没有）：仍是一句删除的差异，左边是 HEAD 那一份', () => {
    const root = repo({
      files: { 'docs/a.md': '第一版\n', 'keep.md': '占位\n' },
    });
    git(root, ['rm', '-q', 'docs/a.md']);

    const last = readLastChange('docs/a.md', root);
    expect(last?.old).toBe('第一版\n');
    expect(last?.diff).toContain('deleted file mode');
  });

  it('大文件的上一版内容读得到（默认 1 MB 的 maxBuffer 会 ENOBUFS）', () => {
    const big = `${'x'.repeat(2 * 1024 * 1024)}\n`;
    const root = repo({
      files: { 'docs/a.md': big },
      changes: [
        {
          message: 'second',
          write: { 'docs/a.md': `${'y'.repeat(2 * 1024 * 1024)}\n` },
        },
      ],
    });

    expect(readLastChange('docs/a.md', root)?.old).toBe(big);
  });
});

describe('md loader 的四种落点', () => {
  it('命中时把差异追加成一条导出', async () => {
    // 两次提交、提交完就收工：工作区干净时右边就是这份文件最后一次被提交的结果，
    // 比的是它自己那两次提交之间的差异。
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, 'diff: true');
    commitAll(root);

    const run = await runLoader(file);
    expect(run.error).toBeNull();
    expect(run.warnings).toEqual([]);
    expect(run.output?.startsWith(MDX_SOURCE)).toBe(true);

    const data = exportedDiff(run.output);
    // 仓库相对路径用正斜杠，与视图上方那一行显示的同一个名字
    expect(data.fileName).toBe('docs/a.md');
    expect(data.old).toContain('第一版');
    expect(data.diff).toContain('正文一行');
  });

  it('`diff: true` 比的是这份 md 自己：不往 webpack 登记额外依赖', async () => {
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, 'diff: true');
    commitAll(root);

    const run = await runLoader(file);
    expect(run.dependencies).toEqual([]);
  });

  it('写成另一份文件：那一份变了这一页才该重算，所以登记成依赖', async () => {
    const root = repo({
      files: { 'docs/a.md': '第一版\n', 'docs/other.md': '别的第一版\n' },
      changes: [
        { message: 'second', write: { 'docs/other.md': '别的第二版\n' } },
      ],
    });
    const file = writeMd(root, 'diff: ./other.md');

    const run = await runLoader(file);
    expect(run.error).toBeNull();
    expect(exportedDiff(run.output).fileName).toBe('docs/other.md');
    expect(run.dependencies).toEqual([path.join(root, 'docs', 'other.md')]);
  });

  it('判据读的是磁盘上那一份的官方解析结果：产物里有没有 frontmatter 不相干', async () => {
    // loader 收到的 `source` 是编译好的 MDX（不含 frontmatter）；带引号的键名以前只有
    // 站点那条规则认得，于是页面判成差异页、数据却没生成 —— 现在两边读同一份解析。
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, '"diff": true');
    commitAll(root);

    const run = await runLoader(file);

    expect(exportedDiff(run.output).source).toBe('commit');
  });

  it('`diff:true` 不带空格：站点看不见这把键，这一页也不产出数据', async () => {
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, 'diff:true');
    commitAll(root);

    const run = await runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toEqual([]);
  });

  it('工作区里还有未提交的改动：导出的右边就是磁盘上此刻这一份', async () => {
    // 同一份夹具，frontmatter 这次不提交：判据与差异都读到磁盘上这一份，未提交的那段就在右边。
    const root = repo({
      files: { 'docs/a.md': '第一版\n' },
      changes: [{ message: 'second', write: { 'docs/a.md': '第二版\n' } }],
    });
    const file = writeMd(root, 'diff: true');

    const run = await runLoader(file);
    const data = exportedDiff(run.output);
    expect(data.old).toContain('第二版');
    expect(data.diff).toContain('正文一行');
  });

  it('没写这把键：原样交回，什么都不追加', async () => {
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, 'title: 没有这把键');
    const run = await runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toEqual([]);
  });

  it('整段 frontmatter 解析不了：原样交回，不卡住这条 loader', async () => {
    // 官方那一条解析是异步出口，坏掉的 YAML 以拒绝收场：这一格把它当成「没写这把键」。
    // 真到构建里，mdx-loader 在那之前就把这一页判死了。
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, 'foo: : bar\ndiff: true');
    commitAll(root);

    const run = await runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.error).toBeNull();
  });

  it('磁盘上那一份读不到：把那份错误交回 webpack，不让回调悬着', async () => {
    // webpack 读过一次、这一层再读一次（判据要的是源文件而不是编译产物）：
    // 中间被删掉或没权限时，这一页以构建错误收场，而不是永远等不到回调。
    const dir = mkdtempReal(path.join(os.tmpdir(), 'diff-loader-gone-'));
    tempDirs.push(dir);

    const run = await runLoader(path.join(dir, 'docs', '没有这一份.md'));

    expect(run.output).toBeNull();
    expect(run.error).toContain('ENOENT');
  });

  it('写成路径却找不到那个文件：告警一句，原样交回', async () => {
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, 'diff: ./不存在的.md');
    const run = await runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain('这个文件不存在');
  });

  it('不在 git 仓库里：告警一句，原样交回', async () => {
    const outside = mkdtempReal(path.join(os.tmpdir(), 'diff-loader-norepo-'));
    tempDirs.push(outside);
    const file = writeMd(outside, 'diff: true');
    const run = await runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain('没有可对比的上一个版本');
  });

  it('git 自己出问题（仓库里一个提交都还没有）：只让这一页少一块视图', async () => {
    const root = mkdtempReal(path.join(os.tmpdir(), 'diff-loader-empty-repo-'));
    git(root, ['init', '-b', 'main']);
    tempDirs.push(root);
    const file = writeMd(root, 'diff: true');
    const run = await runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain('向 git 取');
    expect(run.warnings[0]).toContain('差异失败');
  });
});

describe('值的形状：一份文件还是两份文件，写坏了就点名', () => {
  it('花括号里正好 `old` 与 `new` 两个键就是两份对照，引号与空白都吃得下', async () => {
    expect(await specOf('diff: {old: a.md, new: b.md}')).toEqual({
      kind: 'pair',
      old: 'a.md',
      new: 'b.md',
    });
    expect(await specOf(`diff: {"old":\t'a.md', 'new': "./b.md"}`)).toEqual({
      kind: 'pair',
      old: 'a.md',
      new: './b.md',
    });
  });

  it('两条的先后不重要：角色是键名定的', async () => {
    expect(await specOf('diff: {new: b.md, old: a.md}')).toEqual({
      kind: 'pair',
      old: 'a.md',
      new: 'b.md',
    });
  });

  it('值里带冒号（绝对地址的盘符）不被切成两段', async () => {
    // YAML 只在冒号后面跟空白时才分键值，所以 `C:/tmp/a.md` 整串还是那一个值
    expect(await specOf('diff: {old: C:/tmp/a.md, new: b.md}')).toEqual({
      kind: 'pair',
      old: 'C:/tmp/a.md',
      new: 'b.md',
    });
  });

  it('`true` 与单个路径仍是一份文件，走它自己在 git 里的最近一次改动', async () => {
    expect(await specOf('diff: true')).toEqual({
      kind: 'single',
      value: 'true',
    });
    expect(await specOf('diff: ../docs/intro.md')).toEqual({
      kind: 'single',
      value: '../docs/intro.md',
    });
  });

  it('凑不出正好这两个键就点名，不猜作者要比什么', async () => {
    // 缺一个键就退回去猜另一份，比静默少比一份更难查；多出来的键同样是「作者没说要比谁」
    for (const block of [
      'diff: {}',
      'diff: {old: a.md}',
      'diff: {old: a.md, new: }',
      'diff: {old: a.md, new: b.md, extra: c.md}',
      'diff: {a.md, b.md}',
    ]) {
      const spec = await specOf(block);
      expect(spec, block).toMatchObject({ kind: 'invalid' });
      expect((spec as { reason: string }).reason, block).toContain(
        '要正好这两个键',
      );
    }
  });

  it('写成数组、数字这些落不成地址的值：点名可以怎么写', async () => {
    for (const block of ['diff: [a.md, b.md]', 'diff: 3']) {
      const spec = await specOf(block);
      expect(spec, block).toMatchObject({ kind: 'invalid' });
      expect((spec as { reason: string }).reason, block).toContain('只能写');
    }
  });

  it('告警里带上这一格实际写的那一份', async () => {
    const spec = await specOf('diff: {old: a.md}');
    expect((spec as { reason: string }).reason).toContain('{"old":"a.md"}');
  });
});

describe('两份磁盘文件对照（用 git 的差别算法，不读 git 的历史）', () => {
  /** 一个不带仓库的临时目录，里面两份不同、两份相同。 */
  function pairDir(): string {
    const dir = mkdtempReal(path.join(os.tmpdir(), 'diff-pair-'));
    tempDirs.push(dir);
    for (const [name, content] of [
      ['x.txt', '第一行\n相同的一行\n'],
      ['y.txt', '第二行\n相同的一行\n'],
      ['same.txt', '第一行\n相同的一行\n'],
      ['sub/z.txt', '第一行\n相同的一行\n别的行\n'],
    ] as const) {
      const file = path.join(dir, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
    }
    return dir;
  }

  it('两份不同：给出 `git diff` 原文，头部用的是相对 cwd 的写法', () => {
    const dir = pairDir();
    const diff = readFilesChange('x.txt', 'y.txt', dir);

    expect(diff).toBeDefined();
    expect(diff).toContain('-第一行');
    expect(diff).toContain('+第二行');
    expect(diff).toContain('a/x.txt');
    expect(diff).toContain('b/y.txt');
  });

  it('子目录里的两份：相对写法带目录，git 头部跟着它', () => {
    // 夹具里 `sub/z.txt` 比 `x.txt` 多一行，所以那几行在 `+` 侧
    const diff = readFilesChange('x.txt', 'sub/z.txt', pairDir());

    expect(diff).toContain('b/sub/z.txt');
    expect(diff).toContain('+别的行');
  });

  it('两份一样：返回 `undefined`，这一页没什么可显示', () => {
    expect(readFilesChange('x.txt', 'same.txt', pairDir())).toBeUndefined();
  });

  it('有一份 git 读不到：抛出来，不把它说成「两份没有差别」', () => {
    // `git diff --no-index` 读不到文件时也退 1，靠输出区分：差别有文本，读不到是空
    expect(() =>
      readFilesChange('x.txt', '没有这一份.txt', pairDir()),
    ).toThrow();
  });

  it('git 跑不起来（连目录都不在）：退码不是 1，照旧抛', () => {
    expect(() =>
      readFilesChange(
        'x.txt',
        'y.txt',
        path.join(os.tmpdir(), 'diff-pair-没有这个目录'),
      ),
    ).toThrow();
  });
});

describe('md loader 的两份文件落点', () => {
  /** 在 `dir/docs` 里放两份文件，返回这份 md 的地址（frontmatter 由用例给）。 */
  function pairPage(dir: string, diffKey: string): string {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });

    for (const [name, content] of [
      ['x.txt', '第一行\n相同的一行\n'],
      ['y.txt', '第二行\n相同的一行\n'],
    ] as const) {
      fs.writeFileSync(path.join(dir, 'docs', name), content, 'utf8');
    }

    return writeMd(dir, diffKey);
  }

  it('命中：追加一条对照数据，来源是 `files`，左边那份的内容取自磁盘', async () => {
    // 这份 md 不在任何 git 仓库里：对照那一种不需要仓库
    const dir = mkdtempReal(path.join(os.tmpdir(), 'diff-pair-page-'));
    tempDirs.push(dir);
    const file = pairPage(dir, 'diff: {old: x.txt, new: y.txt}');
    const run = await runLoader(file);

    expect(run.error).toBeNull();
    expect(run.warnings).toEqual([]);

    const exported = /export const diff = (.*);\n$/.exec(run.output ?? '')?.[1];
    expect(exported, '产物末尾该有一条 `export const diff`').toBeDefined();
    const data = JSON.parse(exported!) as DiffData;
    expect(data.source).toBe('files');
    expect(data.fileName).toBe('x.txt');
    expect(data.caption).toBe('x.txt → y.txt');
    expect(data.old).toContain('第一行');
    expect(data.diff).toContain('+第二行');
  });

  it('那两份都在这份 md 之外：都登记成依赖，改了才触发重建', async () => {
    const dir = mkdtempReal(path.join(os.tmpdir(), 'diff-pair-deps-'));
    tempDirs.push(dir);
    const run = await runLoader(
      pairPage(dir, 'diff: {old: x.txt, new: y.txt}'),
    );

    expect(run.dependencies).toEqual([
      path.join(dir, 'docs', 'x.txt'),
      path.join(dir, 'docs', 'y.txt'),
    ]);
  });

  it('frontmatter 折行写：`{ }` 落在下面几行，视图数据照样产出', async () => {
    // 示例页（docs/diff-pair-demo.md）就是这个形状，曾经因为判据只读原文那一行而静默失效
    const dir = mkdtempReal(path.join(os.tmpdir(), 'diff-pair-folded-'));
    tempDirs.push(dir);
    const run = await runLoader(
      pairPage(dir, 'diff:\n  {\n    old: x.txt,\n    new: y.txt\n  }'),
    );

    expect(run.error).toBeNull();
    expect(run.warnings).toEqual([]);
    const data = exportedDiff(run.output);
    expect(data.source).toBe('files');
    expect(data.caption).toBe('x.txt → y.txt');
    expect(data.diff).toContain('+第二行');
  });

  it('先写 `new` 也一样：左右两格由键名定，不由写法先后定', async () => {
    const dir = mkdtempReal(path.join(os.tmpdir(), 'diff-pair-order-'));
    tempDirs.push(dir);
    const run = await runLoader(
      pairPage(dir, 'diff: {new: y.txt, old: x.txt}'),
    );
    const exported = /export const diff = (.*);\n$/.exec(run.output ?? '')?.[1];
    expect(exported, '产物末尾该有一条 `export const diff`').toBeDefined();
    expect((JSON.parse(exported!) as DiffData).caption).toBe('x.txt → y.txt');
  });

  it('缺一份：告警点名是哪一个键，正文照常', async () => {
    for (const [key, victim, word] of [
      ['new', 'y.txt', 'new（改动之后）'],
      ['old', 'x.txt', 'old（改动之前）'],
    ] as const) {
      const dir = mkdtempReal(
        path.join(os.tmpdir(), `diff-pair-missing-${key}-`),
      );
      tempDirs.push(dir);
      const file = pairPage(dir, 'diff: {old: x.txt, new: y.txt}');
      fs.rmSync(path.join(dir, 'docs', victim));
      const run = await runLoader(file);

      expect(run.output).toBe(MDX_SOURCE);
      expect(run.warnings).toHaveLength(1);
      expect(run.warnings[0]).toContain(`${word} 那一份不存在`);
      expect(run.warnings[0]).toContain(path.join('docs', victim));
    }
  });

  it('两份一模一样：告警说没有差别', async () => {
    const dir = mkdtempReal(path.join(os.tmpdir(), 'diff-pair-same-'));
    tempDirs.push(dir);
    const file = pairPage(dir, 'diff: {old: x.txt, new: y.txt}');
    // 把 `new` 那一份写成与 `old` 同一份内容
    fs.copyFileSync(
      path.join(dir, 'docs', 'x.txt'),
      path.join(dir, 'docs', 'y.txt'),
    );
    const run = await runLoader(file);

    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain('没有差别');
  });

  it('只写了一份：告警说正好那两个键，不去猜作者要比什么', async () => {
    const dir = mkdtempReal(path.join(os.tmpdir(), 'diff-pair-shape-'));
    tempDirs.push(dir);
    const run = await runLoader(pairPage(dir, 'diff: {old: x.txt}'));

    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain('要正好这两个键');
  });
});
