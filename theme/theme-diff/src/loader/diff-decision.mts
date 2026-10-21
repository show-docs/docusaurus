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
