/**
验证「多主题链式覆盖同一组件」在**真实 build 产物**里成立（示例页上有那条链，别处没有）。
运行：pnpm build && pnpm verify:chain（读的是 `pnpm build:core` 产出的包内 `dist/`，
也就是包出口真正指向的那份产物）。

真实构建那一侧**两个 bundler 都要跑**：`pnpm build` 用的只是站点当前配置的那一个（webpack 或
rspack），另一支要显式覆盖一次再跑本脚本 —— 两支的接线不同格（`resolve.plugins` /
模块工厂的解析前那一格），同一份产物判据才说明「换 bundler 不换落点」。
`@theme-prev/X` 的语义、两支怎么接线、层目录为什么必须登记成上下文依赖，
全在 `packages/plugin-prev-layer-resolver/docs/internals.md`，这里不抄第二份。

免 build 的判据已迁到单测、
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
// 那条链走的是 `ChainDemo`：解析器包那份示例页（`packages/plugin-prev-layer-resolver/docs/chain-demo.md`）
// 在正文里渲染 `ChainDemo`，站点层 `src/theme` 加 `tools/` 那三层主题各包一层，所以这一页是
// 唯一渲染那条链的地方 —— 别的页（含两棵内容根的落地页）一个包裹标记都不该有。
// 判据两头钉住这条链：示例页正文里那四层必须**连续**出现；再取两格（主页与一个普通文档页），
// 那一整页一个包裹标记都不该有 —— 三条一起才钉住「链只发生在示例页，且哪一格都不多不少」。
if (!fs.existsSync(path.join(root, 'build'))) {
  // 判红而不是「跳过并说明」：退出码 0 会让什么都没验的一次运行看起来和全过一样
  // （`pnpm verify` 里 build 先跑，所以那条链路不受影响；单独跑本脚本才会走到这里）。
  console.log('\n❌ 未找到 build 产物，请先执行 `pnpm build` 再运行本脚本。');
  process.exit(1);
}

const CHAIN = ['src/theme', 'theme-c', 'theme-b', 'theme-a'];
const pages = [
  {
    chain: true,
    file: 'build/plugin-prev-layer-resolver/docs/chain-demo/index.html',
  },
  { chain: false, file: 'build/index.html' },
  {
    chain: false,
    file: 'build/theme-markmap/docs/markmap-demo/index.html',
  },
];

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
  if (!fs.existsSync(path.join(root, file))) {
    // 缺页判红，不是少验一格：某一格的路径漂了一格（`routeBasePath`、slug、示例页改名），
    // 按存在性过滤会让这一节安静地少跑一条，剩下的照样绿 —— 上面那句「退出码 0 看起来和
    // 全过一样」对缺了一格同样成立。
    console.log(`\n❌ ${file} 不在 build 产物里：这一格要验的那条判据没跑。`);
    isOk = false;
    continue;
  }
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const rendered = markersOf(html);
  const inArticle = markersOf(outerArticle(html));

  // 期望有链的那一格只认「四层连续出现在正文里」；期望没有的那几格反过来，
  // 整页一个标记都不该有（那条链只在示例页渲染，页面上也没有别的 swizzle）。
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
          ? '✅ ChainDemo 链成立（4 层全部保留）'
          : '✅ 这一页不渲染 ChainDemo，整页也确实没有包裹标记'
        : `❌ 与预期不符：这一页${chain ? '该有那条四层链' : '不该有任何包裹标记'}`),
  );
  isOk &&= verdict;
}

console.log(`
期望渲染链（示例页正文）：
  src/theme > theme-c > theme-b > theme-a > (theme-base 那份组件本体)
说明：
- 每一层的 @theme-prev/X 都解析为「紧邻下一层实现」，所以站点层加三层插件主题都被保留；
- theme-a 的下一层是 theme-base —— 组件本体就在那里，它不套 data-*-wrapper 标记，故链尾不可见；
- @theme-original/X 保持官方语义（全局赢家），本机制没有改动它（test/layers.test.mts 钉住）。
`);

// ---- 3. 「整页交给一个组件」的那几页真的进了 component-page 那两张生成表 ----
// 每个交出方在自己的 `loadContent()` 里交一份组件登记 + 一条规则（三条 API 层交 `scalar` /
// `redoc` / `stoplight` 那三把键、都写 `render: 'iframe'`；`theme-iframe` 只交 `iframe:` 那一把
// 外部站点的框，`render` 用缺省的 `page`；`theme-markmap` / `theme-erd` / `theme-diff` /
// `theme-word-count` 各交自己那一格视图；本站还有一条指向站点自己 `src/theme/ComponentPageDemo`
// 的规则，写在插件选项里）。
// 合成那张表的是机制层：站点那一列排前面（顺序 = 命中优先级），没被提过的默认规则按键名接在后面。
// 浏览器侧不读 `siteConfig.plugins`，所以这里看的是两份生成模块，而不是生成的浏览器配置。
// 这一条同时钉住「本站声明的那几条真的被各包交了出来」—— 哪一层没声明或没交，表里就少一条。
const SITE_FIRST = ['componentPage', 'scalar', 'redoc', 'stoplight', 'iframe'];
const DEFAULT_TAIL = ['dbml_json', 'diff', 'markmap', 'wordCount'];
const FRAME_ROWS = [
  { component: 'scalar', key: 'scalar', specifier: '@theme/ScalarView' },
  { component: 'redoc', key: 'redoc', specifier: '@theme/RedocView' },
  {
    component: 'stoplight',
    key: 'stoplight',
    specifier: '@theme/StoplightView',
  },
];
/** `render: 'page'` 那几条：登记名与渲染它的那份组件（后者从文件头那张 import 表查）。 */
const PAGE_ROWS = [
  {
    component: 'site/ComponentPageDemo',
    key: 'componentPage',
    specifier: '@theme/ComponentPageDemo',
  },
  {
    component: 'external-frame',
    key: 'iframe',
    specifier: '@theme/ExternalFrame',
  },
  { component: 'markmap', key: 'markmap', specifier: '@theme/MarkmapPage' },
  { component: 'erd', key: 'dbml_json', specifier: '@theme/ErdPage' },
  { component: 'diff', key: 'diff', specifier: '@theme/DiffPage' },
  {
    component: 'word-count',
    key: 'wordCount',
    specifier: '@theme/WordCountPage',
  },
];

const generatedDir = path.join(root, '.docusaurus/theme-component-page');
const registryFile = path.join(generatedDir, 'registry.ts');
const frameRegistryFile = path.join(generatedDir, 'frame-registry.ts');
console.log('\ncomponent-page 生成的两张表（各交出方的落点）：');
if (fs.existsSync(registryFile) && fs.existsSync(frameRegistryFile)) {
  const source = fs.readFileSync(registryFile, 'utf8');
  // 生成模块里每条是 `key` / `match` / `source` / `render` / `component` / `props` 六行，
  // `render: 'page'` 的那些再多一行 `Component` 指回文件头那句 `import` —— 认组件说明符要看
  // 那张 import 表，不能只看登记名。`props` 也可能是 `undefined`（不带静态入参的那些条目）。
  const imports = new Map(
    source
      .matchAll(/^import (ComponentPage\d+) from "([^"]+)";$/gm)
      .map(([, local, specifier]) => [local!, specifier!]),
  );
  const entries = source
    .matchAll(
      /\{\s*key: "([^"]+)",\s*match: "([^"]+)",\s*source: "([^"]+)",\s*render: "([^"]+)",\s*component: "([^"]+)",\s*props: (\{[^}]*\}|undefined)(?:,\s*Component: (ComponentPage\d+))?/g,
    )
    .map(
      ([, key, match, frontMatterSource, render, component, props, local]) => ({
        component: component!,
        key: key!,
        match: match!,
        props: props!,
        render: render!,
        specifier: local === undefined ? undefined : imports.get(local),
        source: frontMatterSource!,
      }),
    )
    .toArray();

  // 框内那张表（登记名 → 组件）：`render: 'iframe'` 的三条不在页面上铺组件，而是指向通用框内
  // 路由，由那份文档按送进来的登记名查这里 —— 所以两张表都要看，只看第一张会漏掉
  // 「表里有条、框里没有」那一半。
  const frameSource = fs.readFileSync(frameRegistryFile, 'utf8');
  const frameImports = new Map(
    frameSource
      .matchAll(/^import (FrameComponent\d+) from "([^"]+)";$/gm)
      .map(([, local, specifier]) => [local!, specifier!]),
  );
  const frameEntries = frameSource
    .matchAll(/\{ id: "([^"]+)", Component: (FrameComponent\d+) \}/g)
    .map(([, id, local]) => ({
      id: id!,
      specifier: frameImports.get(local!),
    }))
    .toArray();

  const order = entries.map((entry) => entry.key);
  const expected = [...SITE_FIRST, ...DEFAULT_TAIL];
  const orderOk =
    order.length === expected.length &&
    order.every((key, index) => key === expected[index]);
  console.log(
    `   ${orderOk ? '✅' : '❌'} 表的顺序（= 命中优先级）：${order.join(' > ') || '(无)'}`,
  );
  if (!orderOk) {
    console.log(
      `   → 期望 ${expected.join(' > ')}：站点 \`rules\` 那一列排前面（就是插件选项里写的先后），`,
    );
    console.log(
      '      没被那一列提过的默认规则按键名的固定字符串顺序接在后面。少了哪一条，先看交出它的那一层还在不在 `plugins` 里。',
    );
    isOk = false;
  }

  for (const row of PAGE_ROWS) {
    const entry = entries.find((candidate) => candidate.key === row.key);
    const ok =
      entry?.render === 'page' &&
      entry.component === row.component &&
      entry.specifier === row.specifier;
    console.log(
      `   ${ok ? '✅' : '❌'} ${row.key}  render=${String(entry?.render)}  这一格由 ${String(entry?.specifier)} 铺在正文里`,
    );
    if (!ok) {
      console.log(
        `      → 期望 render=page、规则引用登记名 \`${row.component}\`，而那份组件在站点层栈里解析成 \`${row.specifier}\`。`,
      );
    }
    isOk &&= ok;
  }

  for (const row of FRAME_ROWS) {
    const entry = entries.find((candidate) => candidate.key === row.key);
    const frame = frameEntries.find(
      (candidate) => candidate.id === row.component,
    );
    const ok =
      entry?.render === 'iframe' &&
      entry.match === 'boolean' &&
      entry.component === row.component &&
      frame?.specifier === row.specifier;
    console.log(
      `   ${ok ? '✅' : '❌'} ${row.key}  render=iframe  → 框内登记名 ${row.component} = ${String(frame?.specifier)}`,
    );
    if (!ok) {
      console.log(
        `      → 期望这条规则 match=boolean、render=iframe 并引用登记名 \`${row.component}\`，那份组件在框内那张表里。`,
      );
    }
    isOk &&= ok;
  }

  // `iframe:` 那一把键只由 `theme-iframe` 交出：卸载它，表里少这一条，上面三条 API 照常。
  const iframeEntry = entries.find((candidate) => candidate.key === 'iframe');
  const iframeOk =
    iframeEntry?.source === 'frontMatter' && iframeEntry.match === 'value';
  console.log(
    `   ${iframeOk ? '✅' : '❌'} iframe:  只读 frontmatter（source=${String(
      iframeEntry?.source,
    )}，match=${String(iframeEntry?.match)}）`,
  );
  if (!iframeOk) {
    console.log(
      '   → 期望 source=frontMatter、match=value：正文里恰好有一条同名导出就把整页换成框，不是作者的本意。',
    );
  }
  isOk &&= iframeOk;

  // 那条通用框内路由真的生成了页面：三条 API 都落在这**一条**路由上（渲染哪个组件由送进框里的
  // 登记名决定），各包不再自带 `/xxx-view`。
  const framePage = [
    'build/__component-frame/index.html',
    'build/__component-frame.html',
  ].find((file) => fs.existsSync(path.join(root, file)));
  console.log(
    `   ${framePage ? '✅' : '❌'} 通用框内那条路由真的产出了页面${
      framePage ? `：${framePage}` : ''
    }`,
  );
  if (framePage === undefined) {
    console.log(
      '   → 没找到 build/__component-frame：机制层在 `allContentLoaded` 里把它 `addRoute` 出去，缺了就是那条注册没跑。',
    );
  }
  isOk &&= framePage !== undefined;
} else {
  console.log(
    '   ❌ 没找到 .docusaurus/theme-component-page/{registry,frame-registry}.ts（pnpm build 应当生成它们）',
  );
  isOk = false;
}

// ---- 4. CSS 产物没被压缩器吃掉规则 ----
// `future.faster.lightningCssMinimizer` 之前，CSS 走的是 cssnano 预设 + clean-css（`csso`
// 只是 css-minimizer-webpack-plugin 带的备选，默认没走），而 clean-css 不认识 CSS Nesting：
// `@scalar/api-reference` 那份样式表里
// `@container client-libraries-list` 下的 `.client-libraries__select{&[data-v-…]{…}}` 被整块吞掉，
// 边界上还多出一个 `}`（括号总账 -1）。症状只在通用框内那条路由（`/__component-frame`）与
// scalar-demo 上可见，
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

// ---- 5. git-badge 那一格真的从 frontmatter 走到了产物侧边栏 ----
// 这条把 `themes/theme-git-badge/docs/internals.md`「升级检查单」第 5 条从「读一眼产物」变成断言。
// 注入只换 `siteConfig.markdown.parseFrontMatter` 那一个值，而它被两条路各读一次、**不是同一次
// 调用**（docs 插件在它自己的 `loadContent()` 里就读走了，早于本包的 `contentLoaded`）。官方的先后
// 顺序一旦漂，症状是产物里那一格整个不见，而构建全程绿 —— 只有从产物回读才看得见。
//
// 认的是「`gitBadge` 挂在哪个父键下」，不是值：`sidebar_custom_props` 是本包写进 frontmatter
// 的那一格（MDX 那一路读的），`customProps` 是官方把它接进侧边栏条目后的那一格。两个父键都出现才
// 说明「注入跑了 **且** 侧边栏跟上了」；只有前一个 = 官方那条 frontmatter → 侧边栏的路换了形状。
//
// 实例目录从磁盘列，不硬编码 `default` / `themes`：本站有几棵内容根，就每一份都得带上徽标 ——
// 注入不按内容根筛，新加一棵时这里自动多看一份，不会出现「少一整棵根」的静默症状。
console.log(
  '\ngit-badge 的产物回读（每份 docs 实例、frontmatter 与侧边栏两条路）：',
);

/** 一棵目录树下所有页面元数据 JSON：它们既在实例目录根部，也在 `p/` 那样的子目录里。 */
function pageJson(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...pageJson(full));
    } else if (
      // `__plugin.json` / `__mdx-loader-dependency.json` 是官方的账目，不是页面元数据
      entry.name.endsWith('.json') &&
      !entry.name.startsWith('__')
    ) {
      found.push(full);
    }
  }
  return found;
}

/** 一份 JSON 里 `gitBadge` 挂在哪些父键下（只看键名，值与出现次数都不参与判定）。 */
function badgeParents(value: unknown, parent = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => badgeParents(item, parent));
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === 'gitBadge') {
      found.push(parent);
    } else {
      found.push(...badgeParents(child, key));
    }
  }
  return found;
}

const docsDir = path.join(root, '.docusaurus/docusaurus-plugin-content-docs');
const docInstances = fs.existsSync(docsDir)
  ? fs
      .readdirSync(docsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted((a, b) => a.localeCompare(b))
  : [];

if (docInstances.length === 0) {
  console.log(
    '   ❌ 没找到 .docusaurus/docusaurus-plugin-content-docs/*（pnpm build 应当产出）',
  );
  isOk = false;
}
for (const instance of docInstances) {
  const parents = new Set(
    pageJson(path.join(docsDir, instance)).flatMap((file) =>
      badgeParents(JSON.parse(fs.readFileSync(file, 'utf8'))),
    ),
  );
  const ok = parents.has('sidebar_custom_props') && parents.has('customProps');
  console.log(
    `   ${ok ? '✅' : '❌'} ${instance}  父键：${[...parents].toSorted((a, b) => a.localeCompare(b)).join(' / ') || '(一枚徽标都没有)'}`,
  );
  if (!ok) {
    console.log(
      '      → 期望 `sidebar_custom_props`（本包写进 frontmatter 那一格）与 `customProps`（官方接进侧边栏那一格）',
    );
    console.log(
      '        都出现在这一份实例的产物里。都没有 = 注入没跑（本层被注册了两份、或 `siteConfig.markdown` 被整体换掉）；',
    );
    console.log(
      '        只有前者 = 侧边栏没跟上；只有后者不可能（那一格是从 frontmatter 抄来的）。',
    );
  }
  isOk &&= ok;
}

process.exit(isOk ? 0 : 1);
