import { dirname, resolve } from 'node:path';

/**
`diff:` 那把键落成的形状。两种都用，第三条是写了但写坏了：

- `single`：一份文件，比它在 git 里的最近一次改动（`value` 是 `true` 时就是本文自己）；
- `pair`：`{old: 旧, new: 新}`，两份磁盘文件互相对照，不经过 git 历史；
- `invalid`：那一格写的东西落不成上面两种。

**键名定角色**，两条写的先后无关，`new` 那一份总是落在视图右边。

凑不出正好这两个键就当写坏了 —— 缺一个就退回去猜另一份，比静默少比一份更难查；
多一个键也不认（`{old, new, extra}` 里 `extra` 是谁、该比哪两份，作者自己都没说清）。
*/
export type DiffSpec =
  | { kind: 'single'; value: string }
  | { kind: 'pair'; old: string; new: string }
  | { kind: 'invalid'; reason: string };

/** 写坏了：交回**一句**说清哪儿不对的话，由 loader 拼成告警。 */
function invalid(seen: unknown, what: string): DiffSpec {
  return {
    kind: 'invalid',
    reason: `${what}（这一格写的是 ${JSON.stringify(seen)}）`,
  };
}

const NOT_PAIR = '写成 {old: 旧, new: 新} 时要正好这两个键';

/** 只有非空的「文本」算一个地址；空串与纯空白不算写了。 */
function address(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
frontmatter 里 `diff:` 那一格落成 {@link DiffSpec}；没写或关掉时交回 `undefined`
（那一页本来就不该有差异视图，不打扰）。

入参是**官方解析之后的那一整份 frontmatter**（`@docusaurus/utils` 的
`DEFAULT_PARSE_FRONT_MATTER`），所以这里的值是 YAML 给的类型：`diff: true` 是布尔、
`diff: {old: a, new: b}` 是对象。这一族不再自己切文本 —— 「这一页开没开差异视图」在
loader 与在站点（component-page 那条规则）读的是同一份解析结果，两套判据分叉的那些写法
（带引号的键名、`diff:true` 不带空格）因此只剩一种表现：**官方那份**。
*/
export function diffSpecOf(frontMatter: unknown): DiffSpec | undefined {
  // 官方解析失败或整段是个标量时，`frontMatter` 是那串原文而不是对象：不算写了这把键
  if (typeof frontMatter !== 'object' || frontMatter === null) {
    return undefined;
  }

  const { diff } = frontMatter as Record<string, unknown>;

  // 没写这把键、写成 `null`、写成 `false`：这一页本来就不该有差异视图，不打扰
  if (([undefined, null, false] as readonly unknown[]).includes(diff)) {
    return undefined;
  }

  // `diff: true`：比本文自己
  if (diff === true) {
    return { kind: 'single', value: 'true' };
  }

  const path = address(diff);

  if (path !== undefined) {
    return { kind: 'single', value: path };
  }

  // 对象：只认正好 `old` / `new` 两把、且两把都是地址
  if (typeof diff === 'object' && !Array.isArray(diff)) {
    const entries = Object.entries(diff as Record<string, unknown>);
    const old = address((diff as Record<string, unknown>).old);
    const newer = address((diff as Record<string, unknown>).new);

    return entries.length === 2 &&
      old !== undefined &&
      newer !== undefined &&
      entries.every(([key]) => key === 'old' || key === 'new')
      ? { kind: 'pair', old, new: newer }
      : invalid(diff, NOT_PAIR);
  }

  return invalid(
    diff,
    '`diff` 只能写 `true`、一份文件的地址，或 {old: 旧, new: 新}',
  );
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
