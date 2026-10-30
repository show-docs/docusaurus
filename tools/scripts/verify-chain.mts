/**
验证「多主题链式覆盖同一组件」在**真实 build 产物**里成立（同一条链在两个页面上的样子）。
运行：pnpm build && pnpm verify:chain（读的是 `pnpm build:core` 产出的包内 `dist/`，
也就是包出口真正指向的那份产物）。

机制、`@theme-prev/X` 语义与「`@theme-original` 零改动」的理由在
`packages/plugin-prev-layer-resolver/README.md`，这里不抄第二份。免 build 的判据已迁到单测、
随 `pnpm test` 常规运行（无需等一次真实 build）：

  - 没有给 Docusaurus 打补丁、`@theme-original` 官方语义零改动 → `test/layers.test.mts`
  - 官方别名全部落在层栈内（层栈未漏层）                     → `test/layers.test.mts`
  - 层栈与官方 `loadThemeAliases` 入参同序、层路径已归一      → `test/discover.test.mts` / `test/layers.test.mts`
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const coreDist = path.join(root, 'packages/plugin-prev-layer-resolver/dist');
// `dist/` 是构建产物，类型检查不能依赖它存在，因此**类型从源码取、值从产物取**：
// 运行期导入显式标注成源码模块的形状，拼错路径或上游改名在这里就红，
// 而不是到 `pnpm verify:chain` 运行期才变成 undefined。
type LayersModule =
  typeof import('../../packages/plugin-prev-layer-resolver/src/layers.mts');
type PluginsModule =
  typeof import('../../packages/plugin-prev-layer-resolver/src/plugins.mts');
const layersModule: LayersModule = await import(
  pathToFileURL(path.join(coreDist, 'layers.mjs')).href
);
const pluginsModule: PluginsModule = await import(
  pathToFileURL(path.join(coreDist, 'plugins.mjs')).href
);
const { layersFromPlugins } = layersModule;
const { PluginDiscovery } = pluginsModule;

const rel = (p: unknown): string =>
  String(p || '(undefined)')
    .replace(`${root}/`, '')
    .replace(/^node_modules\/\.pnpm\/[^/]+\/node_modules\//, '');

// ---- 1. 真实主题层栈（诊断信息；各项不变量已迁单测，见文件头） ----
// 强制 production 语义：dev 下 plugin-debug 会进层栈，与 build 产物对不上。
process.env.NODE_ENV ||= 'production';
const discovered = await new PluginDiscovery(root, console).discover();
const layers = layersFromPlugins({ siteDir: root, plugins: discovered });

console.log('\n自动推导的主题层栈（内 → 外，无配置清单、无补丁）：');
for (const l of layers) console.log(' '.repeat(3) + rel(l.owner));

// ---- 2. 从真实 build 产物回读包裹链 ----
// 主页就是 `packages/README.md`（`routeBasePath: '/'` + `slug: /`），所以第一格是 `build/index.html`。
// 判据两头钉住一条链：主页正文（`<article>`）里那四层必须**连续**出现；站点只有主页写了
// `<DocCardList />`，所以另一格整页都不该有包裹标记 —— 两条一起才钉住「只在 intro 页渲染」。
const CHAIN = ['src/theme', 'theme-c', 'theme-b', 'theme-a'];
const pages = [
  { chain: true, file: 'build/index.html' },
  {
    chain: false,
    file: 'build/theme-markmap/docs/markmap-demo/index.html',
  },
].filter(({ file }) => fs.existsSync(path.join(root, file)));

if (pages.length === 0) {
  // 判红而不是「跳过并说明」：退出码 0 会让什么都没验的一次运行看起来和全过一样
  // （`pnpm verify` 里 build 先跑，所以那条链路不受影响；单独跑本脚本才会走到这里）。
  console.log('\n❌ 未找到 build 产物，请先执行 `pnpm build` 再运行本脚本。');
  process.exit(1);
}

// swc 那份压缩（`future.faster.swcHtmlMinimizer`）把属性写成不带引号的，两种都要认得。
const WRAPPER = /data-(?:site|theme)-wrapper="?([^" >]+)"?/g;
const markersOf = (html: string): string[] =>
  // 那条正则只有一个捕获组，`matchAll` 交回的每项都带着它
  html
    .matchAll(WRAPPER)
    .map(([, layer]) => layer!)
    .toArray();
/** `chain` 是否作为**连续**的一段出现在 `rendered` 里（层与层之间不能夹别的标记） */
const containsChain = (rendered: string[], chain: string[]): boolean =>
  rendered.some((_, i) => chain.every((layer, j) => rendered[i + j] === layer));

/**
取正文那一格：从第一个 `<article …>` 到与它**配对**的那个 `</article>`。

不能按「第一个闭合标签」切 —— 官方 `DocCard` 每张卡自己也是一个 `<article>`，卡片列表在正文里，
于是正文会被切在头一张卡后面（实测主页上 5 开 5 闭）。
*/
function outerArticle(html: string): string {
  const open = /<article\b[^>]*>/.exec(html);
  if (!open) {
    return '';
  }
  const start = open.index + open[0].length;
  const tag = /<\/?article\b[^>]*>/g;
  tag.lastIndex = start;

  let depth = 1;
  let match = tag.exec(html);
  while (match) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      return html.slice(start, match.index);
    }
    match = tag.exec(html);
  }
  return html.slice(start);
}

let isOk = true;
for (const { chain, file } of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const rendered = markersOf(html);
  const inArticle = markersOf(outerArticle(html));

  // 期望有链的那一格只认「四层连续出现在正文里」；期望没有的那一格反过来，
  // 整页一个标记都不该有（这条链不在别处渲染，页面上也没有别的 swizzle）。
  const verdict = chain
    ? containsChain(inArticle, CHAIN)
    : rendered.length === 0;

  console.log(
    `\n${file} 渲染链（全页）：\n   ${rendered.join(' > ') || '(无)'}`,
  );
  console.log(
    `${file} 正文（article）里：\n   ${inArticle.join(' > ') || '(无)'}`,
  );
  console.log(
    ' '.repeat(3) +
      (verdict
        ? chain
          ? '✅ DocCardList 链成立（4 层全部保留）'
          : '✅ 这一页不渲染卡片列表，整页也确实没有包裹标记'
        : `❌ 与预期不符：这一页${chain ? '该有那条四层链' : '不该有任何包裹标记'}`),
  );
  isOk &&= verdict;
}

console.log(`
期望渲染链（主页正文）：
  src/theme > theme-c > theme-b > theme-a > (theme-classic 的真实卡片列表)
说明：
- 每一层的 @theme-prev/X 都解析为「紧邻下一层实现」，所以站点层加三层插件主题都被保留；
- theme-a 的下一层是 preset 的 theme-classic，它不渲染 data-*-wrapper 标记，故链尾不可见；
- @theme-original/X 保持官方语义（全局赢家），本机制没有改动它（test/layers.test.mts 钉住）。
`);

// ---- 3. 「整页交给一个组件」的那几页真的由 `loadContent()` 交进了 component-page 的清单 ----
// 判定住在各交出方：iframe 那族的三条 API 层（`lib/api-frame-theme.mts` 的工厂代它们交）与本层
// 各交自己那一页，`component` 全是 `@theme/ApiFramePage`，顺序 = 站点 `plugins` 的声明顺序
// （命中优先级）；`theme-markmap` 交那一页 `markmap`（`src/component-pages.mts`），组件是
// `@theme/MarkmapPage`；`theme-diff` 交那一页 `diff`（同样在 `src/component-pages.mts`），
// 组件是 `@theme/DiffPage`；`theme-erd` 交的是 `dbml_json`（`dbml-loader` 追加的那条命名导出，
// 名字与清单里那把键一致），组件是 `@theme/ErdPage`。浏览器侧不再读 `siteConfig.plugins`，
// 所以这里看的是 component-page 那份生成模块，而不是生成的浏览器配置。这一条同时钉住「本站
// 声明的那几条真的被各包交了出来」——哪一层没声明或没交，清单里就少一条。
const FRAME_KEYS = ['scalar', 'redoc', 'stoplight', 'iframe'];
const FRAME_MATCHES = ['boolean', 'boolean', 'boolean', 'value'];
const registryFile = path.join(
  root,
  '.docusaurus/theme-component-page/registry.ts',
);
console.log('\ncomponent-page 的生成清单（各交出方的落点）：');
if (fs.existsSync(registryFile)) {
  const source = fs.readFileSync(registryFile, 'utf8');
  // 生成模块里每条是 `key` / `match` / `props` / `Component` 四行，`Component` 指回文件头的
  // 那句 `import` —— 认组件说明符要看那张表，不能只看键名。`props` 也可能是 `undefined`
  // （不带静态入参的条目，比如 markmap 交的那一页）。
  const imports = new Map(
    source
      .matchAll(/^import (ComponentPage\d+) from "([^"]+)";$/gm)
      .map(([, local, specifier]) => [local!, specifier!]),
  );
  const entries = source
    .matchAll(
      /key: "([^"]+)",\n\s+match: "([^"]+)",\n\s+props: (\{[^}]*\}|undefined),\n\s+Component: (ComponentPage\d+),/g,
    )
    .map(([, key, match, props, component]) => ({
      key: key!,
      match: match!,
      namespace: props!.startsWith('{')
        ? (JSON.parse(props!) as { namespace?: unknown }).namespace
        : undefined,
      specifier: imports.get(component!),
    }))
    .toArray();
  const frames = entries.filter(
    (entry) => entry.specifier === '@theme/ApiFramePage',
  );

  const keysOk =
    frames.length === FRAME_KEYS.length &&
    frames.every((entry, index) => entry.key === FRAME_KEYS[index]);
  console.log(
    `   ${keysOk ? '✅' : '❌'} 框页（顺序 = 命中优先级）：${frames.map((entry) => entry.key).join(' > ') || '(无)'}`,
  );
  if (!keysOk) {
    console.log(
      `   → 期望 ${FRAME_KEYS.join(' > ')}：站点 \`plugins\` 的声明顺序，且每一条都指向 \`@theme/ApiFramePage\`。`,
    );
    console.log(
      '      少了哪一条，先看站点 `plugins` 里那一层还在不在；三条 API 层由工厂代交，`iframe:` 由 theme-iframe 自己交。',
    );
    isOk = false;
  }

  const shapeOkAt = (entry: (typeof frames)[number], index: number): boolean =>
    entry.match === FRAME_MATCHES[index] &&
    entry.namespace === `@show-docs/docusaurus-theme-${entry.key}`;
  const shapesOk = frames.every((entry, index) => shapeOkAt(entry, index));
  for (const [index, entry] of frames.entries()) {
    const ok = shapeOkAt(entry, index);
    console.log(
      `   ${ok ? '✅' : '❌'} ${entry.key}  match=${entry.match}  namespace=${String(entry.namespace)}`,
    );
    if (!ok) {
      console.log(
        `      → 期望 match=${FRAME_MATCHES[index]}、namespace=@show-docs/docusaurus-theme-${entry.key}`,
      );
    }
  }
  isOk &&= shapesOk;

  // 三处视图层：`markmap` 按「开关或选项对象」判，`diff` 按「开关还能写参数」判（`true` /
  // 路径 / `{ old, new }` 都算命中），`dbml_json` 是 erd 的 loader 追加的那条导出（恒是对象）。
  // 命中的页各由本包的页面组件接。
  const viewPages = [
    { key: 'markmap', match: 'options', specifier: '@theme/MarkmapPage' },
    { key: 'dbml_json', match: 'any', specifier: '@theme/ErdPage' },
    { key: 'diff', match: 'any', specifier: '@theme/DiffPage' },
  ];
  for (const page of viewPages) {
    const entry = entries.find((candidate) => candidate.key === page.key);
    const ok =
      entry?.match === page.match && entry.specifier === page.specifier;
    console.log(
      `   ${ok ? '✅' : '❌'} ${page.key}  match=${String(entry?.match)}  → ${String(entry?.specifier)}`,
    );
    if (ok) {
      continue;
    }
    console.log(
      `      → 期望 match=${page.match} 且指向 \`${page.specifier}\`：站点 \`plugins\` 里还该有交出它的那一层，`,
    );
    console.log(
      `        条目由各包 src/component-pages.mts 交回 component-page 的清单。`,
    );
    isOk = false;
  }
} else {
  console.log(
    '   ❌ 没找到 .docusaurus/theme-component-page/registry.ts（pnpm build 应当生成它）',
  );
  isOk = false;
}

// ---- 4. CSS 产物没被压缩器吃掉规则 ----
// `future.faster.lightningCssMinimizer` 之前，CSS 走的是 cssnano 预设 + clean-css（`csso`
// 只是 css-minimizer-webpack-plugin 带的备选，默认没走），而 clean-css 不认识 CSS Nesting：
// `@scalar/api-reference` 那份样式表里
// `@container client-libraries-list` 下的 `.client-libraries__select{&[data-v-…]{…}}` 被整块吞掉，
// 边界上还多出一个 `}`（括号总账 -1）。症状只在 `/scalar-view` 与 scalar-demo 上可见，
// 构建全程零告警 —— 只有对着产物数括号才看得见，所以这条护栏钉的就是产物本身。
//
// 判据是「规则还在 + 括号配平」，**不钉文件大小**：换压缩器、加依赖、多一条样式都会让尺寸变。
const CSS_DIR = path.join(root, 'build/assets/css');
console.log('\nCSS 产物（压缩器没吃掉嵌套规则）：');
// 名字带哈希，按前缀找：`style.<hash>.css`（含 scalar 那份、由 `isolate-renderer-css` 单独产出）
const cssFiles = fs.existsSync(CSS_DIR)
  ? fs.readdirSync(CSS_DIR).filter((file) => file.endsWith('.css'))
  : [];
if (cssFiles.length === 0) {
  console.log('   ❌ 没有 build/assets/css/*.css（pnpm build 应当产出）');
  isOk = false;
}
for (const file of cssFiles) {
  const css = fs.readFileSync(path.join(CSS_DIR, file), 'utf8');
  // 花括号总账：坏点时是 -1，之后所有规则跟着少一层嵌套
  let depth = 0;
  for (const char of css) {
    depth += char === '{' ? 1 : char === '}' ? -1 : 0;
  }
  // `style.<hash>.css` 里是 scalar 的嵌套（`@scalar/api-reference` 的 style.css）：坏点时
  // 整条 `.client-libraries__select` 都不在，所以按选择器名找。不按 `&` 找 —— lightningcss
  // 会按 browserslist 决定摊平还是原样保留，`&` 留着只是当前目标下的形状。
  // `styles.<hash>.css` 里还有 viewerjs 的嵌套（`theme-viewer` 已删掉自己那句
  // `postcss-nesting`）：它没有可点名的规则，由上面的括号总账兜住 —— clean-css 压坏时会多吐 `}`。
  const needsNestingRule = file.startsWith('style.');
  const hasSelect = css.includes('client-libraries__select');
  const ok = depth === 0 && (!needsNestingRule || hasSelect);
  console.log(
    `   ${ok ? '✅' : '❌'} ${file}  ${css.length} B，括号总账 ${depth}${
      needsNestingRule
        ? `，client-libraries__select ${hasSelect ? '在' : '丢了'}`
        : ''
    }`,
  );
  if (!ok) {
    console.log(
      '   → 嵌套规则被压缩器吃了：CSS 压缩器换回默认的 cssnano + clean-css（主要是 clean-css）就会这样，',
    );
    console.log(
      '      去看 docusaurus.config.mjs 的 `future.faster.lightningCssMinimizer`。',
    );
  }
  isOk &&= ok;
}

process.exit(isOk ? 0 : 1);
