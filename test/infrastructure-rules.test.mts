import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { pkgPath } from './helpers.mts';

/**
## 基础设施包那几条规则里，能在磁盘上查的六条

`plugin-prev-layer-resolver`、`plugin-compile-source`、`theme-component-page`、`theme-iframe`
是这一仓的四格基础设施：按「一般 → 具体」排，各自能单独装上用，也被别的层当成机制复用。
规则书在仓库根 README 的
「基础设施包」一节；这一份钉住其中六条读文本就能查的：

1. 每一格的 `@show-docs` 声明依赖只落在它**下面**那几格 —— 最下面的解析器包因此一个都没有，
   每一格拿掉上面任意几格都还能装；
2. 每一格 `import` 的 `@show-docs` 包也只落在下面那几格：基础设施不依赖功能层，也不反向依赖
   上面那格。用**字符串**登记组件（规则里 `component` 那一格写的是登记名，不是模块说明符）
   是数据，不是依赖；
3. 一个包 `import` 的 `@show-docs` 包，都得在自己那份 `package.json` 里声明过 —— 依赖由用它的
   那一侧声明；
4. 反过来也一样：**没用到的那一格不许声明**。`themes/` 那一族不向 `theme-component-page`
   交规则（头像、复制按钮、侧边栏徽标、图片查看器各管自己那一格），所以它既不声明也不引它 ——
   否则「装了这一层还得先装机制层」会变成写在清单里的一句假话，而那句假话要靠一次装包才暴露。
   同一条口径的旧例见解析器包 `src/plugin-slots.mts` 的文件头：那条前置检查原先住在
   `theme-iframe` 里，于是想用它的层都得先引那一族层；
5. 前四条只管 `@show-docs` 那一族，这一条管**平台与厂商包**：一个包 `import` 的真 npm 包都得在
   自己那份 `package.json` 里声明过，宿主给的说明符（层别名、`@docusaurus/<导出名>` 那一族
   alias、Node 内建模块）例外。
6. 第三条管的是「引了就得声明」，这一条管**另一头的同一件事**：谁把未编译的 `.ts` / `.tsx` 随包
   发出去，谁就在 `peerDependencies` 里声明那条编译规则的包
   （`@show-docs/docusaurus-plugin-compile-source`）。那一格不靠 `import` 建立，坏的时候是打包
   报 `Module parse failed` —— 隔着一整个构建，所以按第三条同一条口径挪到装包那一步。

读的是磁盘上的 `package.json` 与源码文本，不是某份手抄清单：新增一个包不必回来改这里。
包住在两棵包根下（`packages/` 与 `themes/`），第三条按目录名扫**两边**，漏一棵就是静默失覆盖；
第四条反过来，扫的正是 `themes/` 那一棵 —— 那一族四个包当初从 `packages/` 搬出来，带来的
一条依赖边（机制层那份 `./prerequisites`）就跟着搬过来了，谁也没回来问它还用不用得上。
*/

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

/** 两棵包根；包按**目录名**引用，落在哪一棵由磁盘定（`pkgPath`）。 */
const PKG_ROOTS = ['packages', 'themes'];

/** 四格基础设施，按「一般 → 具体」排：每一格只许依赖它下面那几格。 */
const INFRA_CHAIN = [
  'plugin-prev-layer-resolver',
  'plugin-compile-source',
  'theme-component-page',
  'theme-iframe',
] as const;

const RESOLVER = '@show-docs/docusaurus-plugin-prev-layer-resolver';

type Manifest = {
  name?: string;
  files?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const sourceExt = /\.(?:ts|tsx|mts|js|mjs|jsx)$/;

const packageDirs = (): string[] =>
  PKG_ROOTS.flatMap((root) =>
    readdirSync(path.join(repoRoot, root), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );

const manifestOf = (dir: string): Manifest =>
  JSON.parse(
    readFileSync(pkgPath(repoRoot, dir, 'package.json'), 'utf8'),
  ) as Manifest;

/** 红的时候要说得出**哪一棵包根**里的那个包：按目录名引用，路径由磁盘补出来。 */
const relOf = (dir: string): string =>
  path.relative(repoRoot, pkgPath(repoRoot, dir)).replaceAll('\\', '/');

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
  return sourceFiles(pkgPath(repoRoot, dir)).flatMap((file) => {
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
        .map((name) => `${relOf(dir)}/package.json 声明了 ${name}`);
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
            `${path.relative(repoRoot, file)} → ${packageOf(specifier)}（没在 ${relOf(dir)}/package.json 声明）`,
        );
    });

    expect(violations).toEqual([]);
  });
});

/** 机制层那一个包名从磁盘读：这条判据不抄字面量，那一格改名了它跟着红。 */
const COMPONENT_PAGE = manifestOf('theme-component-page').name;

describe('依赖还要往下收：用不到的那一格不许声明', () => {
  it('themes/ 那一族既不声明也不 import `theme-component-page`（交规则的层才需要它）', () => {
    const dirs = readdirSync(path.join(repoRoot, 'themes'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(dirs.length, 'themes/ 下应有若干包').toBeGreaterThan(0);

    const violations = dirs.flatMap((dir) => [
      ...declaredIn(manifestOf(dir))
        .filter((name) => name === COMPONENT_PAGE)
        .map((name) => `${relOf(dir)}/package.json 声明了 ${name}`),
      ...showDocsImports(dir)
        .filter(({ specifier }) => packageOf(specifier) === COMPONENT_PAGE)
        .map(
          ({ file, specifier }) =>
            `${path.relative(repoRoot, file)} → ${specifier}`,
        ),
    ]);

    expect(
      violations,
      '这一族不向机制层交规则：它的安装前提只有解析器包那一个',
    ).toEqual([]);
  });
});

/**
## 第五条：平台与厂商包（前四条只看 `@show-docs`）

一条 `import` 的说明符有三种产地。本仓自己的包由第三条管；**宿主给的**那些没有包可声明 ——
`@theme/*`、`@theme-init/*`、`@theme-original/*`、`@theme-prev/*` 是层别名（磁盘上没有对应目录，
见解析器包 `types/theme-specifiers.d.ts`），`@generated/*`、`@site/*` 是站点侧别名，
`@docusaurus/<名>` 那一群是 core 按 `lib/client/exports/` 里的文件名逐个挂上去的 webpack alias
（`loadDocusaurusAliases`；同一份文件里那句注释解释了为什么不能整族挂 `@docusaurus` —— 那会连
`@docusaurus/theme-common` 那个真包一起盖掉）。剩下的是**真 npm 包**：用了就得在自己那份
`package.json` 里声明，否则它只是靠宿主的依赖树恰好把它顶了上来 —— 本机绿、单独装就红。

`@docusaurus/<名>` 那一族从磁盘上读，不抄名单：站点装的那一份 core 决定哪些名字是 alias，
抄来的名单会跟着 core 漂。读不到就**判红而不是跳过** —— 这条判据的作用正是「新出现的 alias 名
不伪装成没声明的包」，读不到时静默放行等于把判据关掉。

**只判「用而未声明」，不判反过来**：peer 写在前、用在后是本仓有意的取向（`test/plugin.test.mts`
那条「声明了 peer 把无声漂移变成装包时可见」），按「没用就不许声明」判会把一批有意的提前声明
一起判死。Node 内建模块按 `builtinModules` 放行 —— 注释里那句 `require('worker_threads')`
长得像 import，但它不是包。
*/

/** 宿主给的说明符前缀：层别名与站点侧别名，磁盘上都没有对应的包。 */
const HOST_ALIAS_PREFIXES = [
  '@theme/',
  '@theme-init/',
  '@theme-original/',
  '@theme-prev/',
  '@generated/',
  '@site/',
];

/** core 那份 `lib/client/exports`（文件名即 alias 名）。 */
function coreClientExportsDir(): string {
  const require = createRequire(path.join(repoRoot, 'package.json'));

  return path.resolve(
    path.dirname(require.resolve('@docusaurus/core/package.json')),
    'lib/client/exports',
  );
}

/**
宿主 alias 的那一群，写成**完整说明符**（`@docusaurus/router`）：本仓源码里真用过它们，
所以下面那条用例逐个点名。读磁盘而不是抄名单 —— 站点装的那一份 core 决定哪些名字是 alias。

`BrowserOnly.d.ts` 与 `BrowserOnly.js` 是同一个名字的两份，所以去扩展名时把 `.d.ts` 整段剥掉。
*/
const withoutExtension = (fileName: string): string =>
  fileName.replace(/\.[a-z.]+$/u, '');

const docusaurusAliases = (): Set<string> =>
  new Set(
    readdirSync(coreClientExportsDir(), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:js|ts|tsx)$/.test(entry.name))
      .map((entry) => `@docusaurus/${withoutExtension(entry.name)}`),
  );

const BUILTINS = new Set(builtinModules);

/** 本仓真用过的宿主 alias；core 改了导出目录形状就红，而不是悄悄少判。 */
const USED_ALIASES = [
  '@docusaurus/router',
  '@docusaurus/useIsBrowser',
  '@docusaurus/useGlobalData',
  '@docusaurus/useDocusaurusContext',
];

const DOCUSAURUS_ALIASES = docusaurusAliases();

/** 这条说明符是不是「没有包可声明」的那几种产地。 */
function isHostProvided(specifier: string): boolean {
  return (
    specifier.startsWith('node:') ||
    BUILTINS.has(packageOf(specifier)) ||
    HOST_ALIAS_PREFIXES.some((prefix) => specifier.startsWith(prefix)) ||
    DOCUSAURUS_ALIASES.has(specifier)
  );
}

/** 一个包里所有**不是本仓包、也不是宿主给的**说明符。 */
function platformImports(dir: string): ImportSite[] {
  return sourceFiles(pkgPath(repoRoot, dir)).flatMap((file) => {
    const text = readFileSync(file, 'utf8');

    return SPECIFIERS.flatMap((pattern) =>
      text
        .matchAll(pattern)
        .map((match) => match[1] ?? '')
        .filter(
          (specifier) =>
            !specifier.startsWith('.') &&
            !specifier.startsWith('@show-docs/') &&
            !isHostProvided(specifier),
        )
        .map((specifier) => ({ file, specifier }))
        .toArray(),
    );
  });
}

describe('平台与厂商包：用了就得声明，宿主给的例外', () => {
  it('判据自己还活着（扫得到 react 与 @docusaurus/types）', () => {
    // 没有这一条，`sourceFiles` 走错一棵目录、`isHostProvided` 放行过宽，都会让下面那条
    // 「violations 为空」变成因为什么都没扫到而绿。
    const seen = new Set(
      packageDirs().flatMap((dir) =>
        platformImports(dir).map(({ specifier }) => packageOf(specifier)),
      ),
    );

    expect([...seen].filter((name) => name === 'react')).toEqual(['react']);
    expect([...seen]).toContain('@docusaurus/types');
  });

  it('真包 import 都在自己那份 package.json 里声明过', () => {
    const violations = packageDirs().flatMap((dir) => {
      const manifest = manifestOf(dir);
      const declared = new Set(declaredIn(manifest));

      return platformImports(dir)
        .filter(({ specifier }) => {
          const name = packageOf(specifier);

          return name !== manifest.name && !declared.has(name);
        })
        .map(
          ({ file, specifier }) =>
            `${path.relative(repoRoot, file).replaceAll('\\', '/')} → ${packageOf(specifier)}（没在 ${relOf(dir)}/package.json 声明）`,
        );
    });

    expect(violations).toEqual([]);
  });

  it('宿主 alias 那一份读得到，且认得出本站真用过的名字', () => {
    for (const specifier of USED_ALIASES)
      expect(
        DOCUSAURUS_ALIASES,
        `${specifier} 应由 core 的 client/exports 提供`,
      ).toContain(specifier);
  });
});

/**
## 第六条：谁发未编译源码，谁声明那条编译规则的包

第三条管「引了就得声明」，靠 `import` 建立；这一条管**没有 `import` 的那一格**。各主题包的
`theme/**`、`components/**` 与机制层的 `lib/**` 随包发布时是未编译的 `.ts` / `.tsx`，编译它们那条
规则住在 `@show-docs/docusaurus-plugin-compile-source`，而这一族包一行都不 `import` 它 —— 站点漏装
它，要到打包才报 `Module parse failed`，报错点隔着一整个构建。写在用它的这一侧的
`peerDependencies` 里，缺的那一步就挪到装包时（同一口径见 `test/plugin.test.mts`
「核心包声明了 peerDependencies」）。

判据来自磁盘：读每个包自己那份 `files`，**免编译**的那些目录（`dist` 是编译产物、`!` 开头是排除）
里只要有一个 `.ts` / `.tsx`（`.d.ts` 除外 —— 那条规则不认领声明文件），这一格就管它。新增一个发源码
的包不必回来改清单；产地包自己只发 `dist`，因此不落在这条判据里。
*/

/** 那条编译规则的产地包名，从磁盘读：它改名了这条判据跟着红，而不是静默放行。 */
const COMPILE_SOURCE = manifestOf('plugin-compile-source').name;

const UNCOMPILED_FILE = /\.(?:ts|tsx)$/;

/** 那个目录下（连子目录）有没有未编译的 `.ts` / `.tsx`。 */
function hasUncompiledSource(folder: string): boolean {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return false;

  return readdirSync(folder, { withFileTypes: true }).some((entry) => {
    const file = path.join(folder, entry.name);

    return entry.isDirectory()
      ? hasUncompiledSource(file)
      : UNCOMPILED_FILE.test(entry.name) && !entry.name.endsWith('.d.ts');
  });
}

/** 这个包是否把未编译的源码随包发出去 —— 看它自己那份 `files`，不看手抄清单。 */
function publishesUncompiledSource(dir: string): boolean {
  return (manifestOf(dir).files ?? []).some(
    (entry) =>
      !entry.startsWith('!') &&
      entry !== 'dist' &&
      hasUncompiledSource(pkgPath(repoRoot, dir, entry)),
  );
}

describe('谁发未编译源码，谁就得声明那条编译规则的包', () => {
  it('发了未编译 `.ts` / `.tsx` 的包，都在 `peerDependencies` 里声明了那个包', () => {
    const publishers = packageDirs().filter((dir) =>
      publishesUncompiledSource(dir),
    );

    // 前提校验：确有包走这一格。全空时这条判据没有输入，绿灯不代表任何东西。
    expect(
      publishers,
      '两棵包根下应至少有一个包把未编译源码发出去',
    ).not.toHaveLength(0);

    const violations = publishers
      .filter(
        (dir) =>
          !Object.hasOwn(
            manifestOf(dir).peerDependencies ?? {},
            COMPILE_SOURCE!,
          ),
      )
      .map((dir) => `${relOf(dir)}/package.json`);

    expect(
      violations,
      `这些包发了未编译的 .ts/.tsx，却没在 peer 里声明 ${COMPILE_SOURCE}：${violations.join(
        '、',
      )}`,
    ).toEqual([]);
  });
});
