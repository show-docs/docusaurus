/**
验证「多主题链式覆盖同一组件」在**真实 build 产物**里成立（同一条链在两个页面上的样子）。
运行：pnpm build && pnpm verify:chain

免 build 的判据已迁到单测、随 `pnpm test` 常规运行（无需等一次真实 build）：

  - 没有给 Docusaurus 打补丁、`@theme-original` 官方语义零改动 → `test/layers.test.mts`
  - 官方别名全部落在层栈内（层栈未漏层）                     → `test/layers.test.mts`
  - 层栈与官方 `loadThemeAliases` 入参同序、层路径已归一      → `test/discover.test.mts` / `test/layers.test.mts`

核心包用 TypeScript 写（`plugins/plugin-prev-layer-resolver/src/*.mts`），本脚本读取的是
`pnpm build:core`（tsc）产出的包内 `dist/`，也就是包出口真正指向的那份产物。

方案（见 README 与 ../../plugins/plugin-prev-layer-resolver/README.md）：

  plugins/plugin-prev-layer-resolver —— Docusaurus 插件，注入一个 webpack resolve 插件，
  为链式遍历提供一个新的 specifier：
    @theme-prev/X      我下面那一层提供的 X（落点是 theme-fallback 时告警）

层栈不靠配置清单、也不靠补丁：复用官方 `loadContext` + `loadPluginConfigs`
（即官方 `initPlugins` 的前两步）拿回官方顺序的插件列表，
再按官方 `loadThemeAliases` 的同款规则推导层栈。

关键点：`@theme-original/X` **完全没有被改动**。它仍然是官方语义
（= @theme/X 的全局赢家），因此不会影响任何依赖它的内置组件 / 主题 / swizzle。
链式能力来自新 specifier，而不是改写旧别名。

本文件是 `.mts`：脚本按**产物名**（`.mjs`）在运行期读 `dist/`，而类型按 tsc 的
「`.mjs` → `.mts`」映射从源码取 —— 拼错路径或上游改名在类型检查时就红，
而不是到 `pnpm verify:chain` 运行期才变成 undefined。
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const coreDist = path.join(root, 'plugins/plugin-prev-layer-resolver/dist');
// `dist/` 是构建产物，类型检查不能依赖它存在，因此**类型从源码取、值从产物取**：
// 运行期导入显式标注成源码模块的形状，拼错路径或上游改名在这里就红，
// 而不是到 `pnpm verify:chain` 运行期才变成 undefined。
type LayersModule =
  typeof import('../../plugins/plugin-prev-layer-resolver/src/layers.mts');
type PluginsModule =
  typeof import('../../plugins/plugin-prev-layer-resolver/src/plugins.mts');
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
// 主页就是 `docs/intro.md`（`routeBasePath: '/'` + `slug: /`），所以第一格是 `build/index.html`；
// 第二格取另一份文档页。
//
// 站点只有一条链，判据把它两头钉住：
// - **主页正文（`<article>`）里那四层必须连续出现**：`src/theme > theme-c > theme-b > theme-a`，
//   链尾下面才是 theme-classic 的真实卡片列表。
// - 站点里只有主页写了 `<DocCardList />`，别的页面根本不渲染这个组件，所以**文档页整页都不该有
//   包裹标记** —— 两条一起才把「只在 intro 页」钉住。
const CHAIN = ['src/theme', 'theme-c', 'theme-b', 'theme-a'];
const pages = [
  { chain: true, file: 'build/index.html' },
  { chain: false, file: 'build/markmap-demo/index.html' },
].filter(({ file }) => fs.existsSync(path.join(root, file)));

if (pages.length === 0) {
  // 判红而不是「跳过并说明」：退出码 0 会让什么都没验的一次运行看起来和全过一样
  // （`pnpm verify` 里 build 先跑，所以那条链路不受影响；单独跑本脚本才会走到这里）。
  console.log('\n❌ 未找到 build 产物，请先执行 `pnpm build` 再运行本脚本。');
  process.exit(1);
}

const WRAPPER = /data-(?:site|theme)-wrapper="([^"]+)"/g;
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

// ---- 3. 「整页交给一个框」一族的判定清单还拿得到名字 ----
// theme/theme-iframe/lib/api-frame-entries.ts 读的是浏览器侧 `siteConfig.plugins` 里
// **包名的原样字符串**（装机过滤与站点覆盖都靠它）。这依赖 Docusaurus 的一个实现细节：
// 生成 `.docusaurus/docusaurus.config.mjs` 时 `plugins` 保留**原始配置形状**，而不是归一化成
// 只剩元数据。哪天真被归一化掉，那一层的判定会静默退化成「什么都没装」（页面看起来正常、
// 键不生效），所以在这里钉住：四条层的包名必须还出现在浏览器配置的 plugins 数组里。
const FRAME_LAYERS = [
  '@show-docs/docusaurus-theme-scalar',
  '@show-docs/docusaurus-theme-redoc',
  '@show-docs/docusaurus-theme-stoplight',
  '@show-docs/docusaurus-theme-iframe',
];
const browserConfigFile = path.join(root, '.docusaurus/docusaurus.config.mjs');
console.log('\n浏览器侧 plugins 数组（api-frame-entries.ts 的立足点）：');
if (fs.existsSync(browserConfigFile)) {
  const rawConfig = fs.readFileSync(browserConfigFile, 'utf8');
  // 顶层数组以「换行 + 两格缩进的 ]」收尾；数组里嵌的 [包名, 选项] 元组缩进更深，不会被提前截断
  const pluginsSection = /"plugins": \[[\s\S]*?\n {2}\]/.exec(rawConfig)?.[0];
  if (pluginsSection === undefined) {
    console.log(
      '   ❌ 在浏览器配置里认不出 `"plugins": [...]` 这一段 —— 序列化形状变了，',
    );
    console.log(
      '      这一族的装机过滤与覆盖大概率同时失效，去看 api-frame-entries.ts 的 readPluginSlot。',
    );
    isOk = false;
  } else {
    const missing = FRAME_LAYERS.filter(
      (namespace) => !pluginsSection.includes(`"${namespace}"`),
    );
    for (const namespace of FRAME_LAYERS) {
      console.log(
        `   ${missing.includes(namespace) ? '❌' : '✅'} ${namespace}`,
      );
    }
    if (missing.length > 0) {
      console.log(
        '   → 包名在浏览器侧的 plugins 里找不到了；`resolveFrameDistribution()` 会把这些层判成「没装」，键静默落空。',
      );
      isOk = false;
    }
  }
} else {
  console.log(
    '   ❌ 没找到 .docusaurus/docusaurus.config.mjs（pnpm build 应当生成它）',
  );
  isOk = false;
}

process.exit(isOk ? 0 : 1);
