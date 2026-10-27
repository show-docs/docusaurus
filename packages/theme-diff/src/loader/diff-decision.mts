import { dirname, resolve } from 'node:path';

const DIFF_KEY = /^diff[ \t]*:(.*)$/m;

/**
`diff:` 的续行：这一行没写值、把内容折到下面几行时，把属于这把键的那几行读出来。

只收缩进的后续行，遇到顶格的行（frontmatter 里下一把键）就停；缩进去掉、注释跳过，
按行拼回一段交给 `splitDiffValue` 分形状。流式写法的 `{` / `}` 折成几行、块式写法的
`old:` / `new:` 各占一行，都从这里收下来。

**空行不终止**：YAML 的块映射里空行只是分隔，键还在同一把下面 ——
`diff:` 下面空一行再写 `old:` 与 `new:`，站点那边解析出来仍是两把键，这边也得收得回来。
按空行截断的话，收回来的只剩一项，形状会掉成「一份文件」，而那个值还是一句看不懂的话。
*/
function readContinuation(block: string, from: number): string {
  const lines: string[] = [];

  for (const raw of block.slice(from).split('\n').slice(1)) {
    if (raw.trim() === '') {
      continue;
    }

    if (!/^[ \t]/.test(raw)) {
      break;
    }

    const line = raw.trim();

    if (!line.startsWith('#')) {
      lines.push(line);
    }
  }

  return lines.join('\n').trim();
}

/**
frontmatter 里 `diff:` 那个值：`true`，或加不加引号的路径；也认把 `{ }` 或
`old:` / `new:` 折在下面几行的写法。

`false`、`null` 与空值都算没开；`true` 原样交回字符串，由调用方决定它指哪一份文件。
*/
export function readDiffValue(frontMatterBlock: string): string | undefined {
  const match = DIFF_KEY.exec(frontMatterBlock);

  if (!match) {
    return undefined;
  }

  const inline = match[1]!.trim();
  const value =
    inline || readContinuation(frontMatterBlock, match.index + match[0].length);

  if (!value || value === 'false' || value === 'null') {
    return undefined;
  }

  const quoted = /^(['"])(.*)\1$/s.exec(value);

  return (quoted?.[2] ?? value).trim();
}

/**
把那个值落成一份要读的文件地址：`true` 就是本文自己，写成路径时相对这份 md 所在目录去找。

站点里 md 的地址由 webpack 给（`this.resourcePath`），所以这里只做纯粹的地址换算。
*/
export function resolveDiffTarget(value: string, resourcePath: string): string {
  return value === 'true'
    ? resourcePath
    : resolve(dirname(resourcePath), value);
}

/**
`diff:` 那个值落成的形状。两种都用，第三条是写了但写坏了：

- `single`：一份文件，比它在 git 里的最近一次改动（`true` 就是本文自己）；
- `pair`：`{old: 旧, new: 新}`（或 `old:` / `new:` 各一行），两份磁盘文件互相对照，不经过 git 历史；
- `invalid`：凑不出正好 `old` 与 `new` 两个键。
*/
export type DiffSpec =
  | { kind: 'single'; value: string }
  | { kind: 'pair'; old: string; new: string }
  | { kind: 'invalid'; value: string };

const PAIR = /^\{(.*)\}$/s;

/** 一项 `键: 值`；只切第一个冒号，值里再带冒号（Windows 的盘符写法）都不受影响。 */
const ENTRY = /^([^:]+):(.*)$/;

/** 去掉一项外面配对的那对引号，与 `readDiffValue` 对整行值做的是同一件事。 */
function unquote(item: string): string {
  const quoted = /^(['"])(.*)\1$/s.exec(item);

  return quoted?.[2] ?? item;
}

/** 把一项一项的 `键: 值` 收成表；有一项读不成键值就整把作废（`undefined`）。 */
function entriesOf(items: Iterable<string>): Map<string, string> | undefined {
  const entries = new Map<string, string>();

  for (const raw of items) {
    const item = raw.trim();

    if (!item) {
      continue;
    }

    const entry = ENTRY.exec(item);

    if (!entry) {
      return undefined;
    }

    entries.set(unquote(entry[1]!.trim()), unquote(entry[2]!.trim()));
  }

  return entries;
}

/** 凑不出正好 `old` 与 `new` 两个键就当写坏了。 */
function toPair(entries: Map<string, string>, value: string): DiffSpec {
  const old = entries.get('old');
  const newer = entries.get('new');

  return !old || !newer || entries.size !== 2
    ? { kind: 'invalid', value }
    : { kind: 'pair', old, new: newer };
}

/**
把值分成「一份文件」与「两份文件」两种形状。两份那种有两种写法：流式映射
`diff: {old: a.md, new: b.md}`，以及块式映射 `old:` / `new:` 各占一行；`readDiffValue`
把折行写的那几行原样拼回来，所以两处都落到这里。**键名定角色**，两条写的先后无所谓，
`new` 那一份总是落在视图右边。逗号与空白都随意，键与值都可以加引号。

流式那条按逗号分项，因此地址里不能带逗号；块式按行分，没有这条限制。

凑不出正好这两个键就当写坏了 —— 缺一个就退回去猜另一份，比静默少比一份更难查；
多一个键也不认（`{old, new, extra}` 里 `extra` 是谁、该比哪两份，作者自己都没说清）。
*/
export function splitDiffValue(value: string): DiffSpec {
  const inside = PAIR.exec(value)?.[1];

  if (inside === undefined) {
    // 折行写成了块式：`old:` 与 `new:` 各一行，没有外层花括号
    if (!value.includes('\n')) {
      return { kind: 'single', value };
    }

    const entries = entriesOf(value.split('\n'));

    return entries ? toPair(entries, value) : { kind: 'invalid', value };
  }

  const entries = entriesOf(inside.split(','));

  return entries ? toPair(entries, value) : { kind: 'invalid', value };
}
