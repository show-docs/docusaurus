import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const siteDir = path.resolve(import.meta.dirname, '..');

/** 读某个主题包里的文件：`segments` 相对 `theme/<包名>/`。 */
const read = (...segments: string[]): string =>
  fs.readFileSync(path.join(siteDir, 'theme', ...segments), 'utf8');

/**
## 三条视图层里那三处「有意抄一遍」的副本

`theme-markmap`、`theme-erd`、`theme-diff` 各把一块视图挂在正文上方，靠的是同一套外壳：
一层 `DocItem`（命中才在正文前面插一块视图，不命中原样交给下层）、一个 `ErrorBoundary`
（渲染失败退回可见提示）、一份 `HackStyle`（这块视图自己的样式常量）。

这三份**每个包各自带一份**是刻意的：包要能单独装、单独用，副本之间不该有跨包的 import 或
新的发布单元。代价是同一份代码存在三处，改一处忘了另两处就是漂移。这里钉的就是这个代价：
**只允许在「本层自己的名字与说法」上不同，其余逐字相同。**
*/
const viewPackages = ['theme-markmap', 'theme-erd', 'theme-diff'] as const;

/** 以 `theme-markmap` 那一份为参照（这一族里最先有形状的那一个）。 */
const reference = 'theme-markmap';

/** 注释是每个包自己的话，不参与比较；比较的是代码那一格。 */
function codeLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'));
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
      fs.existsSync(path.join(siteDir, 'theme', file)),
      `theme/${file} 不在了：这三份副本是各包自带的一份，要合并就得同时改本用例与三个包的文档`,
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

describe('视图层三份副本的同步护栏', () => {
  it('components/hack-style.tsx：三份逐字相同', () => {
    const contents = viewPackages.map((pkg) =>
      read(pkg, 'components/hack-style.tsx'),
    );
    contents.forEach((content, index) => {
      expect(
        content,
        `${viewPackages[index]} 的 hack-style.tsx 与 ${reference} 那份不同`,
      ).toBe(contents[0]);
    });
  });

  const errorBoundaryVariation = [
    // 控制台那一行的方括号前缀用的是本包名
    /^ {4}console\.error\('\[theme-[a-z-]+\] .*渲染失败：', error\);$/,
    // 失败提示的标题与本层的触发键、视图名字
    /^ {8}<Admonition title="[^"]*渲染失败" type="danger">$/,
    /^ {10}本文[^<]*请查看浏览器控制台。$/,
  ];

  it('components/error-boundary.tsx：只有包名与本层说法可以不同', () => {
    for (const pkg of viewPackages) {
      expectSameSkeleton(
        pkg,
        path.join('components', 'error-boundary.tsx'),
        errorBoundaryVariation,
      );
    }
  });

  const docItemVariation = [
    // 本层那份数据类型（`src/types.mts` 里各包自己的那个）
    /^import type \{ \w+ \} from '\.\.\/\.\.\/src\/types\.mts';$/,
    // 本层那份数据类型的本地声明（各包 `src/types.mts` 是产地，这里只留名字）
    /^type \w+ = never;$/,
    // 懒加载的那块视图：组件名与组件文件名
    /^const \w+ = lazy\(\(\) =>$/,
    /^ {2}import\('\.\.\/\.\.\/components\/[\w-]+\.tsx'\)\.then\(\(\{ \w+: View \}\) => \(\{$/,
    // frontmatter 那把键挂在 MDX 组件上的属性
    /^ {2}\w+\?: \w+;$/,
    /^export default function DocItem\w+\(props: Props\): ReactNode \{$/,
    /^ {2}if \(!content\?\.\w+\) \{$/,
    /^ {10}<\w+ data=\{content\.\w+\} \/>$/,
  ];

  it('theme/DocItem/index.tsx：只有键名与本层视图组件可以不同', () => {
    for (const pkg of viewPackages) {
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
