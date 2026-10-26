import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';

import type { ErdExport, ErdThemeOptions } from './types.mts';

function requireString(value: unknown, field: string, where: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(
      `theme-erd 的 ${where}.${field} 要一个字符串，拿到的是 ${typeof value}`,
    );
  }

  if (value === '') {
    throw new Error(`theme-erd 的 ${where}.${field} 不能是空串`);
  }

  return value;
}

/**
校验站点给的清单形状，整条接过来。

只在校验该管的范围内做事：形状不对、`id` 撞车，都在这里当场红，而不是等构建期由
loader 报一句看不出所以然的错。这里不碰文件系统，也不解析路径 —— 站点根还没交进来。
*/
export function normalizeExports(declared: unknown): ErdExport[] {
  if (!Array.isArray(declared)) {
    throw new TypeError(
      `theme-erd 的 exports 要一个数组，拿到的是 ${typeof declared}`,
    );
  }

  const seen = new Set<string>();

  return declared.map((entry: unknown, index: number) => {
    const where = `exports[${index}]`;

    if (typeof entry !== 'object' || entry === null) {
      throw new Error(
        `theme-erd 的 ${where} 要一个对象，拿到的是${entry === null ? ' null' : ` ${typeof entry}`}`,
      );
    }

    const { id, label, lang, module } = entry as Partial<ErdExport>;

    const validated: ErdExport = {
      id: requireString(id, 'id', where),
      label: requireString(label, 'label', where),
      lang: requireString(lang, 'lang', where),
      module: requireString(module, 'module', where),
    };

    if (seen.has(validated.id)) {
      throw new Error(
        `theme-erd 的 ${where} 的 id「${validated.id}」和前面某一条撞了；同一页的页签 value 必须唯一`,
      );
    }

    seen.add(validated.id);

    return validated;
  });
}

/**
把一条 `module` 解析成绝对路径，认三种写法。

- 绝对路径：原样用。
- `./` / `../` 开头：相对**站点根**，不是相对本包 —— 外接模块住在站点的仓库里。
- 其余：当成包名或包的子路径，按站点根的视野问 Node 要绝对路径（目标包得在自己的
  `exports` 里放行那个子路径）。

解析不出来的包名在这里当场红，比让构建期的 `Cannot find module` 去猜哪个页签错了便宜。
*/
export function resolveExportModule(module: string, siteDir: string): string {
  if (isAbsolute(module)) {
    return module;
  }

  if (module.startsWith('./') || module.startsWith('../')) {
    return resolve(siteDir, module);
  }

  // 与 `plugin-prev-layer-resolver` 认包根同一手法：借一个站点根下的假入口要解析视野
  return createRequire(join(siteDir, 'noop.js')).resolve(module);
}

/**
配置期算出交给 loader 的那份清单：站点没写就是空 —— 本包不随带任何导出模板。

返回值必须全是可 JSON 序列化的纯数据 —— webpack 会把 loader 的 options 序列化进配置。
*/
export function planExports(
  options: ErdThemeOptions,
  { siteDir }: { siteDir: string },
): ErdExport[] {
  const declared =
    options.exports === undefined ? [] : normalizeExports(options.exports);

  return declared.map((entry) => ({
    ...entry,
    module: resolveExportModule(entry.module, siteDir),
  }));
}
