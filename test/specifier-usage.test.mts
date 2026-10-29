import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
## 层里引哪把 specifier：没有第二层覆盖就用 `@theme-init`

`@theme-prev/X` 是一条链：它解析到**导入者下方最近一层**提供的 X，代价是按导入者算一次落点。
只有真有两层在覆盖同一个组件时才需要它。仓库里只有一个层提供 X 时，「下面那层」就是最初那一份，
`@theme-init/X`（官方别名）指向同一个文件，所以普通包裹用 `@theme-init` 就够；反之，有多个提供者
却用 `@theme-init`，就会跳过中间那一层。规则书在仓库根 README 的「基础设施包」一节。

这一份读磁盘：把每个 `theme/` 根提供的组件列出来（组件名 = 相对路径去掉扩展名与结尾的
`/index`，与官方建别名同口径），再看各层源码里的 import。三层判据：

1. 一个提供者 → 只能 `@theme-init`；
2. 两个以上提供者 → 只能 `@theme-prev`；
3. 一个提供者都没有 → 两把都解析不到，谁写谁红。
*/

const repoRoot = path.resolve(import.meta.dirname, '..');

const componentExt = /\.(?:ts|tsx|js|jsx)$/;

const isComponentFile = (name: string): boolean =>
  componentExt.test(name) && !name.endsWith('.d.ts');

/** 一个目录下的文件（递归，跳过 `node_modules` 与产物）。 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist'
        ? []
        : sourceFiles(file);
    }

    return file;
  });
}

/** 一个 `theme/` 根提供的组件名：相对路径去掉扩展名与结尾的 `/index`，与官方别名同口径。 */
function componentsOf(root: string): string[] {
  return sourceFiles(root)
    .filter((file) => isComponentFile(path.basename(file)))
    .map((file) =>
      path
        .relative(root, file)
        .split(path.sep)
        .join('/')
        .replace(componentExt, '')
        .replace(/\/index$/, ''),
    );
}

/** 有 `theme/` 目录的包（`packages/*`、`tools/*`）与站点自己那一格。 */
function themeRoots(): string[] {
  const packageRoots = ['packages', 'tools'].flatMap((group) =>
    readdirSync(path.join(repoRoot, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(repoRoot, group, entry.name, 'theme')),
  );

  return [...packageRoots, path.join(repoRoot, 'src', 'theme')].filter((dir) =>
    existsSync(dir),
  );
}

/** 参与扫描的源码：`packages/*`、`tools/*` 与站点 `src/`。 */
function layerSources(): string[] {
  return [
    ...['packages', 'tools'].flatMap((group) =>
      readdirSync(path.join(repoRoot, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(repoRoot, group, entry.name)),
    ),
    path.join(repoRoot, 'src'),
  ].flatMap((dir) => sourceFiles(dir));
}

/** `from '…'`、`import('…')` 与只有副作用的 `import '…'` 三种写法；取 `prev` / `init` 与组件名。 */
const SPECIFIER =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]@theme-(prev|init)\/([^'"]+)['"]/g;

type Usage = {
  file: string;
  kind: 'prev' | 'init';
  component: string;
  providers: number;
};

/** 一条用法违反哪条判据（没有违反时返回 `undefined`）。 */
function violationOf(usage: Usage): string | undefined {
  const label = `${usage.file} → @theme-${usage.kind}/${usage.component}`;

  if (usage.providers === 0) {
    return `${label}：没有任何层提供这个组件`;
  }

  if (usage.providers === 1 && usage.kind === 'prev') {
    return `${label}：仓库里只有一层提供它，用 \`@theme-init\` 就够（规则见仓库根 README 的「基础设施包」一节）`;
  }

  return usage.providers > 1 && usage.kind === 'init'
    ? `${label}：仓库里有 ${usage.providers} 层提供它，用 \`@theme-init\` 会跳过下面那几层，改 \`@theme-prev\``
    : undefined;
}

describe('层里引哪把 specifier：没有第二层覆盖就用 `@theme-init`', () => {
  const providers = new Map<string, Set<string>>();
  for (const root of themeRoots()) {
    for (const component of componentsOf(root)) {
      const roots = providers.get(component) ?? new Set<string>();
      roots.add(path.relative(repoRoot, root));
      providers.set(component, roots);
    }
  }

  const usages: Usage[] = layerSources().flatMap((file) => {
    if (!componentExt.test(path.basename(file))) {
      return [];
    }

    const text = readFileSync(file, 'utf8');

    return text
      .matchAll(SPECIFIER)
      .map((match) => {
        const component = match[2]!.replace(/[?#].*$/, '');

        return {
          file: path.relative(repoRoot, file),
          kind: match[1] as 'prev' | 'init',
          component,
          providers: providers.get(component)?.size ?? 0,
        };
      })
      .toArray();
  });

  it('每个 `@theme-prev` 都真有第二层覆盖，每个 `@theme-init` 都只有一个提供者', () => {
    const violations = usages
      .map((usage) => violationOf(usage))
      .filter((message) => message !== undefined);

    expect(violations).toEqual([]);
    // 判据本身失效（正则没匹配到任何 import）时这一条会红，而不是安静地放行。
    expect(usages.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['prev', 'init']),
    );
  });
});
