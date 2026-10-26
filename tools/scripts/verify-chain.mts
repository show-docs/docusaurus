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
    file: 'build/packages/theme-markmap/docs/markmap-demo/index.html',
  },
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
// packages/theme-iframe/lib/api-frame-entries.ts 读的是浏览器侧 `siteConfig.plugins` 里
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

    // 注册表那条清单的顺序是「越靠外越先判」的默认值（`api-frame-registry.ts` 的顺序，
    // 上面 FRAME_LAYERS 就是照它抄的）。层栈里越靠外 = 在 plugins 里声明越晚，
    // 所以本站这四条的声明顺序应当是注册表顺序的**逆序**。
    // 两边没有机制上的绑定（站点可以不装、也可以覆盖），这条钉的是「本站的默认优先级
    // 与注册表说的是同一件事」：谁单独挪了一边，这里就红。
    const declaredOrder = FRAME_LAYERS.map((namespace) => ({
      namespace,
      at: pluginsSection.indexOf(`"${namespace}"`),
    }))
      .filter(({ at }) => at >= 0)
      .toSorted((a, b) => a.at - b.at)
      .map(({ namespace }) => namespace);
    const expectedOrder = FRAME_LAYERS.toReversed();
    const orderOk =
      declaredOrder.length === expectedOrder.length &&
      declaredOrder.every(
        (namespace, index) => namespace === expectedOrder[index],
      );
    console.log(
      `   ${orderOk ? '✅' : '❌'} 声明顺序（在 plugins 里，外 → 内）：${declaredOrder.join(' > ') || '(无)'}`,
    );
    if (!orderOk) {
      console.log(
        `   → 期望 ${expectedOrder.join(' > ')}：越晚声明 = 层栈越靠外 = 默认越先判。`,
      );
      console.log(
        '      真要改优先级，写在 `themeConfig.apiFrame.order` 里，别只挪声明顺序。',
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

// ---- 4. CSS 产物没被压缩器吃掉规则 ----
// `future.faster.lightningCssMinimizer` 之前，CSS 走的是 cssnano 预设 + clean-css（底下都是
// csso 5.0.5），而 csso 不认识 CSS Nesting：`@scalar/api-reference` 那份样式表里
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
  // 只有 style.<hash>.css 里那份含嵌套（`@scalar/api-reference` 的 style.css）；
  // lightningcss 按 production browserslist 判定浏览器认嵌套，于是把 `&` **原样留着**，
  // 所以这里按 `&` 找，不按摊平后的选择器找。
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
      '   → 嵌套规则被压缩器吃了：CS.minimizer 换回 csso 系（cssnano / clean-css）就会这样，',
    );
    console.log(
      '      去看 docusaurus.config.mjs 的 `future.faster.lightningCssMinimizer`。',
    );
  }
  isOk &&= ok;
}

process.exit(isOk ? 0 : 1);
