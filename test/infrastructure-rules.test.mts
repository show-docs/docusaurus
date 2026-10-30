import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
## 基础设施包那几条规则里，能在磁盘上查的三条

`plugin-prev-layer-resolver`、`theme-component-page`、`theme-iframe` 是这一仓的三格基础设施：
按「一般 → 具体」排，各自能单独装上用，也被别的层当成机制复用。规则书在仓库根 README 的
「基础设施包」一节；这一份钉住其中三条读文本就能查的：

1. 每一格的 `@show-docs` 声明依赖只落在它**下面**那几格 —— 最下面的解析器包因此一个都没有，
   每一格拿掉上面任意几格都还能装；
2. 每一格 `import` 的 `@show-docs` 包也只落在下面那几格：基础设施不依赖功能层，也不反向依赖
   上面那格。用**字符串**登记组件（规则里 `component` 那一格写的是登记名，不是模块说明符）
   是数据，不是依赖；
3. 一个包 `import` 的 `@show-docs` 包，都得在自己那份 `package.json` 里声明过 —— 依赖由用它的
   那一侧声明。

读的是磁盘上的 `package.json` 与源码文本，不是某份手抄清单：新增一个包不必回来改这里。
*/

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const packagesRoot = path.join(repoRoot, 'packages');

/** 三格基础设施，按「一般 → 具体」排：每一格只许依赖它下面那几格。 */
const INFRA_CHAIN = [
  'plugin-prev-layer-resolver',
  'theme-component-page',
  'theme-iframe',
] as const;

const RESOLVER = '@show-docs/docusaurus-plugin-prev-layer-resolver';

type Manifest = {
  name?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const sourceExt = /\.(?:ts|tsx|mts|js|mjs|jsx)$/;

const packageDirs = (): string[] =>
  readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const manifestOf = (dir: string): Manifest =>
  JSON.parse(
    readFileSync(path.join(packagesRoot, dir, 'package.json'), 'utf8'),
  ) as Manifest;

const declaredIn = (manifest: Manifest): string[] => [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
];

/** 这一格下面那几格的包名（最下面那格交回空集）。 */
function chainBelow(dir: string): Set<string> {
  const index = (INFRA_CHAIN as readonly string[]).indexOf(dir);

  return new Set(
    INFRA_CHAIN.slice(0, index).map((name) => manifestOf(name).name ?? name),
  );
}

/** 一个包里参与「谁依赖谁」的文件（跳过 `node_modules` 与产物）。 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === 'dist'
        ? []
        : sourceFiles(file);
    }

    return sourceExt.test(entry.name) ? file : [];
  });
}

/** `import … from`、`import(…)`、`require(…)` 与只有副作用的 `import '…'` 四种写法都收。 */
const SPECIFIERS = [
  /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
];

/** `@scope/name` 取前两段，其余取第一段：深路径（`/lib/…`）归到包名上。 */
const packageOf = (specifier: string): string => {
  const [scope = '', name = ''] = specifier.split('/', 3);

  return specifier.startsWith('@') ? `${scope}/${name}` : scope;
};

type ImportSite = { file: string; specifier: string };

/** 一个包里所有 `@show-docs/*` 的 import（文件路径留着，红的时候知道是哪一行）。 */
function showDocsImports(dir: string): ImportSite[] {
  return sourceFiles(path.join(packagesRoot, dir)).flatMap((file) => {
    const text = readFileSync(file, 'utf8');

    return SPECIFIERS.flatMap((pattern) =>
      text
        .matchAll(pattern)
        .map((match) => match[1] ?? '')
        .filter((specifier) => specifier.startsWith('@show-docs/'))
        .map((specifier) => ({ file, specifier }))
        .toArray(),
    );
  });
}

describe('基础设施包：按一般度分层，只往下依赖', () => {
  it('每一格声明的 `@show-docs` 依赖只落在它下面那几格（解析器包一个都没有）', () => {
    const violations = INFRA_CHAIN.flatMap((dir) => {
      const allowed = chainBelow(dir);

      return declaredIn(manifestOf(dir))
        .filter((name) => name.startsWith('@show-docs/') && !allowed.has(name))
        .map((name) => `${dir}/package.json 声明了 ${name}`);
    });

    expect(violations).toEqual([]);
    expect(manifestOf('plugin-prev-layer-resolver').name).toBe(RESOLVER);
  });

  it('每一格 import 的 `@show-docs` 包也只落在它下面那几格', () => {
    const violations = INFRA_CHAIN.flatMap((dir) => {
      const allowed = chainBelow(dir);

      return showDocsImports(dir)
        .filter(({ specifier }) => !allowed.has(packageOf(specifier)))
        .map(
          ({ file, specifier }) =>
            `${path.relative(repoRoot, file)} → ${specifier}`,
        );
    });

    expect(violations).toEqual([]);
  });
});

describe('依赖由用它的那一侧声明', () => {
  it('import 到的 `@show-docs` 包都在自己那份 package.json 里声明过', () => {
    const violations = packageDirs().flatMap((dir) => {
      const manifest = manifestOf(dir);
      const declared = new Set(declaredIn(manifest));

      return showDocsImports(dir)
        .filter(({ specifier }) => {
          const name = packageOf(specifier);

          return name !== manifest.name && !declared.has(name);
        })
        .map(
          ({ file, specifier }) =>
            `${path.relative(repoRoot, file)} → ${packageOf(specifier)}（没在 ${dir}/package.json 声明）`,
        );
    });

    expect(violations).toEqual([]);
  });
});
