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
- `pair`：`{old: 旧, new: 新}`，两份磁盘文件互相对照，不经过 git 历史；
- `invalid`：花括号里凑不出正好 `old` 与 `new` 两个键。
*/
export type DiffSpec =
  | { kind: 'single'; value: string }
  | { kind: 'pair'; old: string; new: string }
  | { kind: 'invalid'; value: string };

const PAIR = /^\{(.*)\}$/s;

/** 一项 `键: 值`；只切第一个冒号，值里再带冒号（Windows 的盘符写法）都不受影响。 */
const ENTRY = /^([^:]+):(.*)$/s;

/** 去掉一项外面配对的那对引号，与 `readDiffValue` 对整行值做的是同一件事。 */
function unquote(item: string): string {
  const quoted = /^(['"])(.*)\1$/s.exec(item);

  return quoted?.[2] ?? item;
}

/**
把值分成「一份文件」与「两份文件」两种形状。两份那种是 YAML 的流式映射：
`diff: {old: a.md, new: b.md}`，**键名定角色**，所以两条写的先后无所谓，`new` 那一份
总是落在视图右边。逗号两边空白随意，键与值都可以加引号。

凑不出正好这两个键就当写坏了 —— 缺一个就退回去猜另一份，比静默少比一份更难查；
多一个键也不认（`{old, new, extra}` 里 `extra` 是谁、该比哪两份，作者自己都没说清）。
*/
export function splitDiffValue(value: string): DiffSpec {
  const inside = PAIR.exec(value)?.[1];

  if (inside === undefined) {
    return { kind: 'single', value };
  }

  const entries = new Map<string, string>();

  for (const raw of inside.split(',')) {
    const item = raw.trim();

    if (!item) {
      continue;
    }

    const entry = ENTRY.exec(item);

    if (!entry) {
      return { kind: 'invalid', value };
    }

    entries.set(unquote(entry[1]!.trim()), unquote(entry[2]!.trim()));
  }

  const old = entries.get('old');
  const newer = entries.get('new');

  return !old || !newer || entries.size !== 2
    ? { kind: 'invalid', value }
    : { kind: 'pair', old, new: newer };
}
