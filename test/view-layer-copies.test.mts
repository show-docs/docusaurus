import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const siteDir = path.resolve(import.meta.dirname, '..');

/** 读某个主题包里的文件：`segments` 相对 `packages/<包名>/`。 */
const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(siteDir, 'packages', ...segments), 'utf8');

/**
## 三条视图层共用的那一份外壳

`theme-markmap`、`theme-erd`、`theme-diff` 各把一块视图挂在正文上方，靠的是同一套外壳：
一层 `DocItem`（命中才在正文前面插一块视图，不命中原样交给下层）、一个兜底
（渲染失败退回可见提示）、一句宽度补丁（正文容器的 `max-width`）、一层那一格
（视图 + 分隔线 + 装正文的 `.container`）。

这套外壳以前是**每个包各抄一遍**：同一份代码三处，改一处忘另两处就是漂移；合成一份之后
各包还各留着两个只管转出的文件（`components/error-boundary.tsx`、`components/hack-style.tsx`），
仍然要三处一起改。现在整族只剩一份实现（`theme-iframe/lib/view-layer-shell.tsx` 与
`view-layer.ts`，随包发出去），各包只留「交哪把键、交哪个组件、交哪段说法」。
所以这里钉的从「三份逐字相同」换成了「三处引的是同一份、只差本层自己的名字与说法」。
*/
const viewPackages = ['theme-markmap', 'theme-erd', 'theme-diff'] as const;

/** 以 `theme-markmap` 那一份为参照（这一族里最先有形状的那一个）。 */
const reference = 'theme-markmap';

/** 注释是每个包自己的话，不参与比较；比较的是代码那一格。 */
function codeLines(source: string): string[] {
  const lines = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'));
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
  pkg: string,
  relativeFile: string,
  allowed: RegExp[],
): void {
  const refFile = path.join(reference, relativeFile);
  const pkgFile = path.join(pkg, relativeFile);
  for (const file of [refFile, pkgFile]) {
    expect(
      fs.existsSync(path.join(siteDir, 'packages', file)),
      `packages/${file} 不在了：这三份副本是各包自带的一份，要合并就得同时改本用例与三个包的文档`,
    ).toBe(true);
  }

  const ref = codeLines(read(refFile));
  const other = codeLines(read(pkgFile));

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
        `第 ${index + 1} 行\n  ${reference}: ${lineAtRef}\n  ${pkg}: ${lineAtPkg}`,
      );
    }
  });

  expect(
    drifted,
    `${pkgFile} 与 ${refFile} 在允许清单之外不同：\n${drifted.join('\n')}`,
  ).toEqual([]);
}

describe('三条视图层共用的那一份外壳', () => {
  /** 共享实现的落点：随 `theme-iframe` 的 `lib/` 发出去（见其 `package.json` 的 `files` / exports）。 */
  const shared = path.join('theme-iframe', 'lib');

  it('共享实现那三份真的在（在 `theme-iframe/lib/` 里）', () => {
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
          `${file} 又出现了：本层的说法应当就地写在 theme/DocItem/index.tsx 里，` +
            '兜底与那句补丁都在 lib/view-layer-shell.tsx',
        ).toBe(false);
      }
    }
  });

  const shellImport =
    "import { ViewLayerDocItem } from '@show-docs/docusaurus-theme-iframe/lib/view-layer-shell.tsx';";

  const docItemVariation: RegExp[] = [
    // 本地那份数据类型的声明（各包 `src/types.mts` 是产地，这里只留名字）
    /^type \w+ = never;$/,
    // 懒加载的那块视图：组件名与组件文件名
    /^const \w+ = lazy\(\(\) =>$/,
    /^ {2}import\('\.\.\/\.\.\/components\/[\w-]+\.tsx'\)\.then\(\(\{ \w+: View \}\) => \(\{$/,
    // frontmatter 那把键挂在 MDX 组件上的属性
    /^ {2}\w+\?: \w+;$/,
    // 本层那个导出名
    /^export default function DocItem\w+\(props: Props\): ReactNode \{$/,
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

  it('theme/DocItem/index.tsx：三份都交给共享实现，只差键名与本层说法', () => {
    for (const pkg of viewPackages) {
      const source = read(pkg, 'theme', 'DocItem', 'index.tsx');
      expect(
        source,
        `${pkg} 的 DocItem 没引共享实现（应当是 ${shellImport}）`,
      ).toContain(shellImport);

      // 外壳那几层结构现在只该来自 lib/：本层再拼一遍就是第二份实现
      for (const echo of [
        '<hr />',
        'padding-top--md',
        'Admonition',
        'Suspense',
        'ErrorBoundary',
        'hackStyle',
      ]) {
        expect(
          source,
          `${pkg} 的 DocItem 自己又写了一遍外壳里的 ${echo}`,
        ).not.toContain(echo);
      }

      expectSameSkeleton(
        pkg,
        path.join('theme', 'DocItem', 'index.tsx'),
        docItemVariation,
      );
    }
  });
});

/**
## 两处「每个包自己抄一遍」的接线

这两样不在副本文件里，藏在各包入口与 loader 里，漂移了不会有任何用例报红，只在**装机的站点**
上以 `Module parse failed` / 那一格视图不出现的形式现身，所以只能由源码文本层面的护栏来钉。
*/
describe('各包重复的 webpack 与 loader 接线', () => {
  /**
  官方那条 babel 规则排除整个 `node_modules`，每个分发 `.tsx` 的主题包都要补这一条。
  `include` 是判据函数而不是包根那个字符串：工作区里官方本来就在编这些源码，不带判据就是同一份
  文件跑两遍 babel（判据本身在 `lib/api-frame-source-js-rule.ts`，另有用例钉它）。

  `theme-iframe` 自己是唯一例外：它的入口进 `tsc`，而 `lib/` 不在那份 `rootDir` 里、引不到判据，
  所以那一条仍按包根认领 —— 见它入口里那段注释。
  */
  const babelRule = [
    String.raw`              test: /\.tsx?$/,`,
    '              include: (file: string) => needsSiteJsRule(packageRoot, file),',
    '              use: [utils.getJSLoader({ isServer })],',
  ].join('\n');

  const iframeBabelRule = [
    String.raw`              test: /\.tsx?$/,`,
    "              include: [resolve(thisDir, '..')],",
    '              use: [utils.getJSLoader({ isServer })],',
  ].join('\n');

  it('六个带源码层的包，补的那条 babel 规则逐字相同', () => {
    for (const pkg of [
      'theme-markmap',
      'theme-erd',
      'theme-diff',
      'theme-viewer',
      'theme-copy-button',
    ]) {
      expect(
        read(pkg, 'src/index.mts'),
        `${pkg} 的 src/index.mts 里那条 babel 规则与另外几个包不一样（改一处要改五处）`,
      ).toContain(babelRule);
    }

    expect(
      read('theme-iframe', 'src/index.mts'),
      'theme-iframe 的 src/index.mts 里那条 babel 规则变了（它的认领范围另有一段注释说明）',
    ).toContain(iframeBabelRule);
  });

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
