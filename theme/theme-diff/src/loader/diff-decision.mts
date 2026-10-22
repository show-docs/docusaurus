import { dirname, resolve } from 'node:path';

const DIFF_KEY = /^diff[ \t]*:[ \t]*(\S.*)$/m;

/**
frontmatter 里 `diff:` 那个值：`true`，或加不加引号的路径。

`false`、`null` 与空值都算没开；`true` 原样交回字符串，由调用方决定它指哪一份文件。
*/
export function readDiffValue(frontMatterBlock: string): string | undefined {
  const value = DIFF_KEY.exec(frontMatterBlock)?.[1]?.trim();

  if (!value || value === 'false' || value === 'null') {
    return undefined;
  }

  const quoted = /^(['"])(.*)\1$/.exec(value);

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
- `pair`：`[旧, 新]`，两份磁盘文件互相对照，不经过 git 历史；
- `invalid`：方括号里的项数不是两份。
*/
export type DiffSpec =
  | { kind: 'single'; value: string }
  | { kind: 'pair'; from: string; to: string }
  | { kind: 'invalid'; value: string };

const PAIR = /^\[(.*)\]$/s;

/** 去掉一项外面配对的那对引号，与 `readDiffValue` 对整行值做的是同一件事。 */
function unquote(item: string): string {
  const quoted = /^(['"])(.*)\1$/s.exec(item);

  return quoted?.[2] ?? item;
}

/**
把值分成「一份文件」与「两份文件」两种形状。逗号两边空白随意，两项都可以加引号。

方括号里的项数不是二就当写坏了 —— 猜成「取前两份」会把 `diff: [a, b, c]` 静默变成 a 与 b
的对照，页面看着正常、比的不是作者要的那两份。
*/
export function splitDiffValue(value: string): DiffSpec {
  const inside = PAIR.exec(value)?.[1];

  if (inside === undefined) {
    return { kind: 'single', value };
  }

  const items = inside
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => unquote(item));

  if (items.length !== 2) {
    return { kind: 'invalid', value };
  }

  // 上一条已经钉死「正好两项」，这里只是把下标读法收成一份元组类型
  const [from, to] = items as [string, string];

  return { kind: 'pair', from, to };
}
