import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  readDiffValue,
  resolveDiffTarget,
} from '../theme/theme-diff/src/loader/diff-decision.mts';
import {
  findRepoRoot,
  readLastChange,
  repoPathFromRoot,
} from '../theme/theme-diff/src/loader/git-diff.mts';
import loader from '../theme/theme-diff/src/loader/md-diff-loader.mts';

import { mkdtempReal } from './helpers.mts';

/**
## theme-diff 的两段判据

这一层的产物是「最近一次提交的差异」，判据全在构建期：frontmatter 那把键怎么读、要读哪一份
文件、git 里那一次改动怎么落成一份数据。这一段没有浏览器参与，`pnpm build` 全绿也证明不了它
算得对 —— 只有单测能量；页面上那块视图对不对，由 `test/e2e/features/diff.feature` 钉。

git 那两组用例走**真实的 git**：临时目录里 `git init` 真提交几次，夹具造的仓库形状就是这一层
在读的那种。这里不 mock `execFileSync`，因为这一层最容易坏的地方恰恰是「参数怎么拼、git 的输出
长什么样」，替身把这些都替掉了。
*/

/** 编译好的 MDX 原文：这一层的 loader 只在它后面追加一条导出，内容本身无所谓。 */
const MDX_SOURCE = 'export default function MDXContent() {};\n';

/** 一次 loader 调用的三样产出：交回 webpack 的内容、错误、以及 `emitWarning` 收到的告警。 */
interface LoaderRun {
  output: string | null;
  error: string | null;
  warnings: string[];
}

/**
用一个假的 loader 上下文跑一遍本包那条 `enforce: 'post'` loader。

真实上下文由 webpack 逐次构造，这一层只用到 `cacheable` / `async` / `resourcePath` /
`emitWarning` 四件，其余一概不需要 —— 需要别的就是新增依赖，那时候这条替身会跟着变宽。
*/
function runLoader(resourcePath: string): LoaderRun {
  const warnings: string[] = [];
  const result: LoaderRun = { output: null, error: null, warnings };

  const context = {
    resourcePath,
    cacheable: () => undefined,
    emitWarning: (warning: string | Error) => {
      warnings.push(String(warning));
    },
    async: () => (error: Error | null, source?: string) => {
      result.error = error ? error.message : null;
      result.output = source ?? null;
    },
  };

  loader.call(context as never, MDX_SOURCE);
  return result;
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

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
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

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('frontmatter 那把键的读法', () => {
  it('`true` 与加不加引号的路径都算开了', () => {
    expect(readDiffValue('diff: true')).toBe('true');
    expect(readDiffValue('diff: ../docs/intro.md')).toBe('../docs/intro.md');
    expect(readDiffValue('diff: "../docs/intro.md"')).toBe('../docs/intro.md');
    expect(readDiffValue("diff: '../docs/intro.md'")).toBe('../docs/intro.md');
  });

  it('`false`、`null` 与空值都算没开', () => {
    expect(readDiffValue('diff: false')).toBeUndefined();
    expect(readDiffValue('diff: null')).toBeUndefined();
    expect(readDiffValue('diff:')).toBeUndefined();
    expect(readDiffValue('diff:    ')).toBeUndefined();
    expect(readDiffValue('title: 没有这把键')).toBeUndefined();
  });

  it('冒号前后的空白与制表符都吃得下，键名后面紧跟内容不算值', () => {
    expect(readDiffValue('diff:\t true ')).toBe('true');
    expect(readDiffValue('diffx: true')).toBeUndefined();
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

describe('git 里那一次改动落成一份数据', () => {
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

  it('只提交过一次：没有可对比的上一次', () => {
    const root = repo({ files: { 'docs/a.md': '唯一一版\n' } });
    expect(readLastChange('docs/a.md', root)).toBeUndefined();
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
});

describe('md loader 的四种落点', () => {
  it('命中时把差异追加成一条导出', () => {
    // 两次提交给出「上一次改动」，工作区里再把 frontmatter 写上（不必提交：判据从磁盘读，
    // 而 git 只看那两个提交）。
    const root = repo({
      files: { 'docs/a.md': '第一版\n' },
      changes: [{ message: 'second', write: { 'docs/a.md': '第二版\n' } }],
    });
    const file = writeMd(root, 'diff: true');

    const run = runLoader(file);
    expect(run.error).toBeNull();
    expect(run.warnings).toEqual([]);
    expect(run.output?.startsWith(MDX_SOURCE)).toBe(true);

    const exported = /export const diff = (.*);\n$/.exec(run.output ?? '')?.[1];
    expect(exported, '产物末尾该有一条 `export const diff`').toBeDefined();
    const data = JSON.parse(exported!) as {
      fileName: string;
      diff: string;
      old: string;
    };
    // 仓库相对路径用正斜杠，与视图上方那一行显示的同一个名字
    expect(data.fileName).toBe('docs/a.md');
    expect(data.old).toContain('第一版');
    expect(data.diff).toContain('第二版');
  });

  it('没写这把键：原样交回，什么都不追加', () => {
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, 'title: 没有这把键');
    const run = runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toEqual([]);
  });

  it('写成路径却找不到那个文件：告警一句，原样交回', () => {
    const root = repo({ files: { 'docs/a.md': '第一版\n' } });
    const file = writeMd(root, 'diff: ./不存在的.md');
    const run = runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain('这个文件不存在');
  });

  it('不在 git 仓库里：告警一句，原样交回', () => {
    const outside = mkdtempReal(path.join(os.tmpdir(), 'diff-loader-norepo-'));
    tempDirs.push(outside);
    const file = writeMd(outside, 'diff: true');
    const run = runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain('没有可对比的上一次改动');
  });

  it('git 自己出问题（仓库里一个提交都还没有）：只让这一页少一块视图', () => {
    const root = mkdtempReal(path.join(os.tmpdir(), 'diff-loader-empty-repo-'));
    git(root, ['init', '-b', 'main']);
    tempDirs.push(root);
    const file = writeMd(root, 'diff: true');
    const run = runLoader(file);
    expect(run.output).toBe(MDX_SOURCE);
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain('读取');
    expect(run.warnings[0]).toContain('git 历史失败');
  });
});
