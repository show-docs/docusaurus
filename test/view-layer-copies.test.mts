import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { pkgPath } from './helpers.mts';

const siteDir = path.resolve(import.meta.dirname, '..');

/**
读某个主题包里的文件：`segments` 相对那个包的目录，包在 `packages/` 还是 `themes/`
由存在性定根（见 `test/helpers.mts` 的 `pkgPath`）。
*/
const read = (pkg: string, ...segments: string[]): string =>
  fs.readFileSync(pkgPath(siteDir, pkg, ...segments), 'utf8');

/**
## 三条视图层共用的那一份外壳

`theme-markmap`、`theme-erd`、`theme-diff` 各把一块视图挂在正文上方，靠的是同一套外壳：
一层入口（命中才在正文前面插一块视图，不命中/没数据就交回正文）、一个兜底
（渲染失败退回可见提示）、一句宽度补丁（正文容器的 `max-width`）、一层那一格
（视图 + 分隔线 + 装正文的 `.container`）。

这套外壳以前是**每个包各抄一遍**：同一份代码三处，改一处忘另两处就是漂移；合成一份之后
各包还各留着两个只管转出的文件（`components/error-boundary.tsx`、`components/hack-style.tsx`），
仍然要三处一起改。现在整族只剩一份实现（`theme-component-page/lib/view-layer-shell.tsx` 与
`view-layer.ts`，随那一格基础设施包发出去），各包只留「交哪把键、交哪个组件、交哪段说法」。
所以这里钉的从「三份逐字相同」换成了「三处引的是同一份、只差本层自己的名字与说法」。

三处入口现在齐了：三层的页面都由 `@show-docs/docusaurus-theme-component-page` 判中后挂上
（条目由各包在自己的 `loadContent()` 里交回，见各包的 `src/index.mts`），入口因此叫
`theme/MarkmapPage` / `theme/ErdPage` / `theme/DiffPage`。erd 的键是 loader 写进模块的那条导出
（`dbml_json`），markmap / diff 的还是 frontmatter —— 两边判法的差别在各条规则里，页面本身只把
视图摆在正文上方。外壳本身三处一样。
*/
const viewPackages = ['theme-markmap', 'theme-erd', 'theme-diff'] as const;

/** 由 component-page 挂上的那三份页面组件：以 `theme-markmap` 为参照。 */
const pageComponentPackages = [
  'theme-markmap',
  'theme-erd',
  'theme-diff',
] as const;
const reference = 'theme-markmap';

/**
注释是每个包自己的话，不参与比较；比较的是代码那一格。`//` 逐行跳过，`/** … *\/` 成块跳过
（整块注释各包长短不同，行数差在注释上不算漂移）。
*/
function codeLines(source: string): string[] {
  let inBlock = false;
  const lines = source.split('\n').filter((line) => {
    const trimmed = line.trimStart();
    if (inBlock) {
      inBlock = !trimmed.includes('*/');
      return false;
    }
    if (trimmed.startsWith('/*')) {
      inBlock = !trimmed.includes('*/');
      return false;
    }
    return !trimmed.startsWith('//');
  });
  const indentOf = (line: string) => line.length - line.trimStart().length;

  // prettier 按显示宽度决定一个属性值要不要另起一行，而 CJK 那点宽度差（`markmap` 比 `dbml`
  // 长三个字母）就够让它在一份里折行、在另一份里不折。那是**排版**的形状，不是结构的形状：
  // 这里要比的是「同一格属性」，所以把 `键:` + 缩进更深的那一行折回同一格。
  const folded: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const next = lines[index + 1];
    if (
      next !== undefined &&
      line.endsWith(':') &&
      indentOf(next) > indentOf(line)
    ) {
      folded.push(`${line} ${next.trim()}`);
      index += 1;
    } else {
      folded.push(line);
    }
  }

  return folded;
}

/**
两份副本一行一行对：行数必须一样，不同的每一行还要**两边都**落在允许清单的同一条里 ——
只让一边匹配，等于拿两行不相干的内容蒙过这一格。
*/
function expectSameSkeleton(
  referencePkg: string,
  refRelativeFile: string,
  pkg: string,
  pkgRelativeFile: string,
  allowed: RegExp[],
): void {
  const refFile = path.join(referencePkg, refRelativeFile);
  const pkgFile = path.join(pkg, pkgRelativeFile);
  const pairs: [string, string][] = [
    [referencePkg, refRelativeFile],
    [pkg, pkgRelativeFile],
  ];
  for (const [root, relative] of pairs) {
    expect(
      fs.existsSync(pkgPath(siteDir, root, relative)),
      `${path.join(root, relative)} 不在了：这两份副本是各包自带的一份，要合并就得同时改本用例与两个包的文档`,
    ).toBe(true);
  }

  const ref = codeLines(read(referencePkg, refRelativeFile));
  const other = codeLines(read(pkg, pkgRelativeFile));

  expect(
    other.length,
    `${pkgFile} 与 ${refFile} 的代码行数不同（${other.length} 对 ${ref.length}）：` +
      '这一族的外壳只该差在本层自己的名字上，结构差出来就是漂移',
  ).toBe(ref.length);

  const drifted: string[] = [];
  ref.forEach((lineAtRef, index) => {
    const lineAtPkg = other[index]!;
    if (lineAtRef === lineAtPkg) {
      return;
    }
    const permitted = allowed.some(
      (rule) => rule.test(lineAtRef) && rule.test(lineAtPkg),
    );
    if (!permitted) {
      drifted.push(
        `第 ${index + 1} 行\n  ${referencePkg}: ${lineAtRef}\n  ${pkg}: ${lineAtPkg}`,
      );
    }
  });

  expect(
    drifted,
    `${pkgFile} 与 ${refFile} 在允许清单之外不同：\n${drifted.join('\n')}`,
  ).toEqual([]);
}

describe('三条视图层共用的那一份外壳', () => {
  /** 共享实现的落点：随 `theme-component-page` 的 `lib/` 发出去（见其 `package.json` 的 `files` / exports）。 */
  const shared = path.join('theme-component-page', 'lib');

  it('共享实现那三份真的在（在 `theme-component-page/lib/` 里）', () => {
    for (const file of [
      'view-layer-shell.tsx',
      'view-layer-labels.ts',
      'view-layer.ts',
    ]) {
      expect(
        fs.existsSync(path.join(siteDir, 'packages', shared, file)),
        `packages/${path.join(shared, file)} 不在了：三条视图层引的都是这一份`,
      ).toBe(true);
    }
  });

  /**
  每包只剩两样自己的东西：一个懒加载的 `lazy(() => import('../../components/x.tsx'))` 与一段
  本层说法。曾经每包还各带 `components/error-boundary.tsx`、`components/hack-style.tsx`
  两个转出文件（合一份之后连那两行都不用各写一遍），这条路堵上：文件在，就说明桥又长回来了。
  */
  it('各包不再留 error-boundary / hack-style 两份转出文件', () => {
    for (const pkg of viewPackages) {
      for (const name of ['error-boundary.tsx', 'hack-style.tsx']) {
        const file = path.join('packages', pkg, 'components', name);
        expect(
          fs.existsSync(path.join(siteDir, file)),
          `${file} 又出现了：本层的说法应当就地写在它那一页（theme/<XxxPage>/index.tsx）里，` +
            '兜底与那句补丁都在 lib/view-layer-shell.tsx',
        ).toBe(false);
      }
    }
  });

  const shellImport =
    "import { ViewLayerDocItem } from '@show-docs/docusaurus-theme-component-page/lib/view-layer-shell.tsx';";

  /** 外壳那几层结构只该来自 `lib/`：本层再拼一遍就是第二份实现。 */
  const shellEchoes = [
    '<hr />',
    'padding-top--md',
    'Admonition',
    'Suspense',
    'ErrorBoundary',
    'data-theme-view-layer-hack',
  ];

  /** 页面组件（component-page 判中后挂上的那一份）之间允许差的那几格。 */
  const pageComponentVariation: RegExp[] = [
    // 本地那份数据类型的声明（各包 `src/types.mts` 是产地，这里只留名字）
    /^type \w+ = never;$/,
    // 懒加载的那块视图：组件名与组件文件名
    /^const \w+ = lazy\(\(\) =>$/,
    /^ {2}import\('\.\.\/\.\.\/components\/[\w-]+\.tsx'\)\.then\(\(\{ \w+: View \}\) => \(\{$/,
    // frontmatter 那把键挂在 MDX 组件上的属性
    /^ {2}\w+\?: \w+;$/,
    // 本层那个导出名
    /^export default function \w+Page\(\{ content \}: Props\): ReactNode \{$/,
    // 交给外壳的那把键
    /^ {6}data=\{content\?\.\w+\}$/,
    // 控制台前缀 = 包名
    /^ {8}name: 'theme-[a-z-]+',$/,
    // 失败提示的标题与正文（各层自己的说法；prettier 按行长决定正文是否折行，两种形状都认）
    /^ {8}title: '[^']*渲染失败',$/,
    /^ {8}description: '本文[^']*控制台。',$/,
    /^ {10}'本文[^']*控制台。',$/,
    // 交给外壳的那块视图：组件名
    /^ {6}view=\{\w+\}$/,
  ];

  /**
  三处入口都在 component-page 那边（`theme/MarkmapPage` / `theme/ErdPage` / `theme/DiffPage`）：
  判键、命中后换页都由 component-page 做，这一页只剩两件事 —— 把视图摆在正文上方，把正文转给
  官方那份 `DocItem`。三页结构逐行相同，只差在那把键、组件名与本层说法上。
  */
  it('MarkmapPage / ErdPage / DiffPage：都交给共享实现，正文转给 DocItem', () => {
    const pages = {
      'theme-markmap': { file: 'MarkmapPage', key: 'markmap' },
      'theme-erd': { file: 'ErdPage', key: 'dbml_json' },
      'theme-diff': { file: 'DiffPage', key: 'diff' },
    } as const;

    for (const pkg of pageComponentPackages) {
      const { file, key } = pages[pkg];
      const source = read(pkg, 'theme', file, 'index.tsx');

      expect(
        source,
        `${pkg} 的 ${file} 没引共享实现（应当是 ${shellImport}）`,
      ).toContain(shellImport);
      // component-page 命中时不再往下走，正文只能由这一层转给官方那份 `DocItem`。
      expect(source).toContain("import DocItem from '@theme-init/DocItem';");
      expect(source).toContain('<DocItem content={content} />');
      expect(source).toContain(`data={content?.${key}}`);
      expect(source).toContain(`name: '${pkg}',`);

      for (const echo of shellEchoes) {
        expect(
          source,
          `${pkg} 的 ${file} 自己又写了一遍外壳里的 ${echo}`,
        ).not.toContain(echo);
      }

      if (pkg !== reference) {
        expectSameSkeleton(
          reference,
          path.join('theme', pages[reference].file, 'index.tsx'),
          pkg,
          path.join('theme', file, 'index.tsx'),
          pageComponentVariation,
        );
      }
    }
  });

  // 这三层都不再自己挂 `DocItem`：判键已经交给 component-page 的清单，留一份就是两处判同一把键。
  it('三层都不再自带 theme/DocItem', () => {
    for (const pkg of pageComponentPackages) {
      expect(
        fs.existsSync(pkgPath(siteDir, pkg, 'theme', 'DocItem', 'index.tsx')),
        `${pkg}/theme/DocItem/index.tsx 又出现了：那一页现在由 component-page 的清单挂`,
      ).toBe(false);
    }
  });
});

/**
## 「谁来编这一族未编译的 TS 源码」只有一处说了算

官方那条 babel 规则排除整个 `node_modules`，每个随包发布 `.tsx` 的主题包都得自己补一条规则。
这七条规则以前各写一份（同一个判据抄七处），改一处忘另两处就是漂移；现在收在
`@show-docs/docusaurus-plugin-prev-layer-resolver` 一处（`src/source-js-rule.mts`），
按 `@show-docs` 这个 scope 认领。

所以这里的钉法从「七处逐字相同」换成了「**只有那一份**」：任何主题包再自己补一条，
就是第二处要改的地方。
*/
describe('TS 源码的编译规则只有一处', () => {
  /** 家族里带源码层的包：层与组件是随包发布的源码，官方那条规则不编。 */
  const sourcePackages = [
    'theme-markmap',
    'theme-erd',
    'theme-diff',
    'theme-viewer',
    'theme-copy-button',
    'theme-component-page',
    'theme-avatar',
    'theme-iframe',
    'theme-redoc',
    'theme-scalar',
    'theme-stoplight',
  ] as const;

  it('那条规则在解析器插件里有一份', () => {
    const source = fs.readFileSync(
      path.join(
        siteDir,
        'packages',
        'plugin-prev-layer-resolver',
        'src',
        'source-js-rule.mts',
      ),
      'utf8',
    );
    expect(source, '解析器插件里没有那条 TS 源码规则').toContain(
      'utils.getJSLoader({ isServer })',
    );
    expect(source).toContain('needsShowDocsSourceRule');
  });

  it('各主题包不再自己补那条规则（第二处 = 要改两处）', () => {
    for (const pkg of sourcePackages) {
      const source = read(pkg, 'src/index.mts');
      expect(
        source,
        `${pkg} 的 src/index.mts 里又自己补了一条 TS 源码规则：` +
          '这一格归 @show-docs/docusaurus-plugin-prev-layer-resolver 一处管',
      ).not.toMatch(/test:\s*\/\\\.tsx\?\$\//);
      expect(
        source,
        `${pkg} 的 src/index.mts 里不该再出现 needsSiteJsRule（那份判据已并入解析器插件）`,
      ).not.toContain('needsSiteJsRule');
    }
  });

  it('没有任何主题包在 `lib/` 里再放一份那条判据', () => {
    // 那份判据以前住在 `theme-iframe/lib/` 里（文件名带 `source-js-rule`）。判据只有一份，
    // 在解析器插件里；文件名再出现在别的包的 `lib/` 就说明第二处又长回来了。
    const offenders = sourcePackages
      .flatMap((pkg) => {
        const libDir = pkgPath(siteDir, pkg, 'lib');

        return fs.existsSync(libDir)
          ? fs
              .readdirSync(libDir)
              .filter((name) => name.includes('source-js-rule'))
              .map((name) => `${pkg}/lib/${name}`)
          : [];
      })
      .join('、');

    expect(offenders, `又出现了一份 TS 源码判据：${offenders}`).toBe('');
  });
});

describe('两条 md 后处理 loader 的接线', () => {
  /** 两条 md 后处理 loader 认 frontmatter 起止的那一条，两边必须是一个口径。 */
  const frontMatterLine = `const FRONT_MATTER = /^---${String.raw`\r?\n([\s\S]*?)\r?\n---/;`}`;

  /**
  两条 md 后处理 loader（`enforce: 'post'`）各自从 frontmatter 认一把键，再往 MDX 产物后追加一条
  **同名**导出。两处必须同名：不一致时层里 `content.<键>` 永远是空的，页面安静地少一块视图，
  构建与用例都不报。

  `keyFile` 是那把键的正则所在的那个文件 —— `theme-diff` 把这段判据拆到了 `diff-decision.mts`
  （拆出来才给单测跑得到），`theme-markmap` 还在 loader 自己里。
  */
  const mdLoaders = [
    {
      pkg: 'theme-markmap',
      file: 'src/loader/md-markmap-loader.mts',
      keyFile: 'src/loader/md-markmap-loader.mts',
      key: 'markmap',
    },
    {
      pkg: 'theme-diff',
      file: 'src/loader/md-diff-loader.mts',
      keyFile: 'src/loader/diff-decision.mts',
      key: 'diff',
    },
  ] as const;

  it('两条 md loader 的 frontmatter 正则相同', () => {
    for (const { pkg, file } of mdLoaders) {
      expect(
        read(pkg, file),
        `${pkg} 的 ${file} 里那条 FRONT_MATTER 与另一包不同口径`,
      ).toContain(frontMatterLine);
    }
  });

  it('frontmatter 认的那把键与追加的导出名是同一个', () => {
    for (const { pkg, file, keyFile, key } of mdLoaders) {
      expect(
        read(pkg, keyFile),
        `${pkg} 的 ${keyFile} 里，frontmatter 判据不再认 \`${key}\` 这把键`,
      ).toContain(`_KEY = /^${key}`);
      expect(
        read(pkg, file),
        `${pkg} 的 ${file} 没把数据追加成 MDX 组件上的一条同名导出`,
      ).toContain(
        `\`\${source}\\nexport const ${key} = \${JSON.stringify(data)};\\n\``,
      );
    }
  });
});
