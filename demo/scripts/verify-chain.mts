/**
验证「多主题链式覆盖同一组件」成立、**无需配置清单 / 无需补丁**，且
**@theme-original 官方语义零改动**。
运行：pnpm build && pnpm verify:chain

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
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { LoadedPlugin } from '@docusaurus/types';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const coreDir = fs.realpathSync(
  path.join(root, 'node_modules/@docusaurus/core'),
);
const coreReq = createRequire(
  path.join(coreDir, 'lib/webpack/aliases/index.js'),
);
// core 的 `lib/webpack/aliases` 只发 CJS，没有类型；形状由下面调用点用得到的那两个钉住。
const aliasesModule: {
  loadThemeAliases: (input: {
    siteDir: string;
    plugins: LoadedPlugin[];
  }) => Promise<Record<string, string>>;
} = coreReq('@docusaurus/core/lib/webpack/aliases/index.js');
const coreDist = path.join(root, 'plugins/plugin-prev-layer-resolver/dist');
// `dist/` 是构建产物，类型检查不能依赖它存在，因此**类型从源码取、值从产物取**：
// 运行期导入显式标注成源码模块的形状，拼错路径或上游改名在这里就红，
// 而不是到 `pnpm verify:chain` 运行期才变成 undefined。
type LayersModule =
  typeof import('../../plugins/plugin-prev-layer-resolver/src/layers.mjs');
type PluginsModule =
  typeof import('../../plugins/plugin-prev-layer-resolver/src/plugins.mjs');
const layersModule: LayersModule = await import(
  pathToFileURL(path.join(coreDist, 'layers.mjs')).href
);
const pluginsModule: PluginsModule = await import(
  pathToFileURL(path.join(coreDist, 'plugins.mjs')).href
);
const { layersFromPlugins, normalizeLayerPath } = layersModule;
const { PluginDiscovery } = pluginsModule;

const rel = (p: unknown): string =>
  String(p || '(undefined)')
    .replace(`${root}/`, '')
    .replace(/^node_modules\/\.pnpm\/[^/]+\/node_modules\//, '');

// ---- 0. 无需补丁：核心文件必须与上游一致 ----
const aliasesSrc = fs.readFileSync(
  path.join(coreDir, 'lib/webpack/aliases/index.js'),
  'utf8',
);
const baseSrc = fs.readFileSync(
  path.join(coreDir, 'lib/webpack/base.js'),
  'utf8',
);
// 两个判据分别取本方案的**导出名与插件 name**：它们在 core 里出现即「上游被打补丁」。
const selfMarks = [
  'PrevLayerResolverPlugin',
  '@show-docs/docusaurus-plugin-prev-layer-resolver',
];
const hasPatch = selfMarks.some(
  (mark) => aliasesSrc.includes(mark) || baseSrc.includes(mark),
);
// 判据取第 0 项（`PrevLayerResolverPlugin` 导出名）：`noUncheckedIndexedAccess` 下
// 索引访问是 `string | undefined`，而本表是字面量数组，越界不可能 —— 就地断言即可。
const originalHijacked = baseSrc.includes(selfMarks[0]!);

console.log(
  `Docusaurus 是否被打补丁：${
    hasPatch ? '❌ 是（本方案不需要补丁）' : '✅ 否（保持上游原样）'
  }`,
);
console.log(
  `@theme-original 是否被改写：${
    originalHijacked ? '❌ 是（不应发生）' : '✅ 否（保持官方语义）'
  }`,
);

// ---- 1. 真实主题层栈 + 官方别名 ----
process.env.NODE_ENV ||= 'production';
const { loadSite } = (await import(
  `file://${path.join(coreDir, 'lib/server/site.js')}`
)) as {
  loadSite: (input: { siteDir: string; outDir: string }) => Promise<{
    props: { plugins: LoadedPlugin[] };
  }>;
};
const site = await loadSite({ siteDir: root, outDir: 'build' });
const officialPlugins = site.props.plugins;

const aliases = await aliasesModule.loadThemeAliases({
  siteDir: root,
  plugins: officialPlugins,
});

// 我们自己的推导路径（复用官方 loadContext + loadPluginConfigs）
const discovered = await new PluginDiscovery(root, console).discover();
const layers = layersFromPlugins({ siteDir: root, plugins: discovered });

console.log('\n自动推导的主题层栈（内 → 外，无配置清单、无补丁）：');
for (const l of layers) console.log(' '.repeat(3) + rel(l.owner));

// 与官方 loadThemeAliases 的入参逐项对照（只看 plugin 主题）
// 官方类型里 `getThemePath` 是可选的（非主题插件没有它），因此这里按「有钩子才算一层」
// 收敛成 `string[]`，再与我们的推导结果逐项比对。
const officialThemePaths = officialPlugins.flatMap((p) => {
  const themePath = p.getThemePath?.();
  return themePath ? path.resolve(p.path, themePath) : [];
});
const oursThemePaths = layers
  .filter((l) => l.kind === 'plugin')
  .map((l) => l.owner);
const isSameAsOfficial =
  JSON.stringify(oursThemePaths) === JSON.stringify(officialThemePaths);
console.log(
  `\n推导出的 plugin 主题顺序与官方 loadThemeAliases 入参一致：${
    isSameAsOfficial ? '✅' : '❌'
  }`,
);
if (!isSameAsOfficial) {
  console.log('   官方：', officialThemePaths.map((p) => rel(p)).join(' > '));
  console.log('   我们：', oursThemePaths.map((p) => rel(p)).join(' > '));
}

console.log('\n官方别名（与上游语义一致）：');
for (const k of ['@theme/Logo', '@theme-original/Logo', '@theme-init/Logo']) {
  console.log(`${' '.repeat(3) + k.padEnd(22)} => ${rel(aliases[k])}`);
}

// 自证：官方别名指向的目录必须都落在层栈里（层栈推导漏层时会在这里暴露）
const layerOwners = layers.map((l) => path.resolve(l.owner));
const aliasOutside = new Set<string>();
for (const [key, value] of Object.entries(aliases)) {
  if (!key.startsWith('@theme') || typeof value !== 'string' || !value)
    continue;
  const file = path.resolve(value);
  const inside = layerOwners.some(
    (o) => file === o || file.startsWith(o + path.sep),
  );
  if (!inside) aliasOutside.add(path.dirname(path.dirname(file)));
}
const isAliasesCovered = aliasOutside.size === 0;
console.log(
  `\n官方别名全部落在层栈内（层栈未漏层）：${
    isAliasesCovered
      ? '✅'
      : `❌ ${[...aliasOutside].map((p) => rel(p)).join(', ')}`
  }`,
);

// 层路径已按 realpath 归一（软链 / .. 不会把同一目录算成两层）
const normalized = layers.every((l) => l.owner === normalizeLayerPath(l.owner));
const isNoDupOwners = new Set(layerOwners).size === layerOwners.length;
console.log(
  `层路径已归一且无重复目录：${normalized && isNoDupOwners ? '✅' : '❌'}`,
);

// ---- 2. 从真实 build 产物回读包裹链 ----
const htmlFiles = ['build/index.html', 'build/docs/intro/index.html'].filter(
  (f) => fs.existsSync(path.join(root, f)),
);
if (htmlFiles.length === 0) {
  // 判红而不是「跳过并说明」：退出码 0 会让什么都没验的一次运行看起来和全过一样
  // （`pnpm verify` 里 build 先跑，所以那条链路不受影响；单独跑本脚本才会走到这里）。
  console.log('\n❌ 未找到 build 产物，请先执行 `pnpm build` 再运行本脚本。');
  process.exit(1);
}

let isOk = true;
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const rendered = html
    .matchAll(/data-(?:site|theme)-wrapper="([^"]+)"/g)
    .map((m) => m[1])
    .toArray();
  const expected = ['src/theme-logo', 'theme-c', 'theme-b', 'theme-a'];
  const chainOk = rendered.some((_, i) =>
    expected.every((layer, j) => rendered[i + j] === layer),
  );
  console.log(`\n${file} 渲染链：\n   ${rendered.join(' > ')}`);
  console.log(
    ' '.repeat(3) + (chainOk ? '✅ 链成立（4 层全部保留）' : '❌ 链不成立'),
  );
  isOk &&= chainOk;
}

console.log(`
期望渲染链： src/theme-logo > theme-c > theme-b > theme-a > (theme-classic 的真实 Logo)
说明：
- 每一层的 @theme-prev/X 都解析为「紧邻下一层实现」，所以三层插件主题都被保留；
- theme-a 的下一层是 preset 的 theme-classic，它不渲染 data-*-wrapper 标记，故链尾不可见；
- @theme-original/X 保持官方语义（全局赢家），本机制没有改动它。
`);
process.exit(
  isOk &&
    isSameAsOfficial &&
    isAliasesCovered &&
    normalized &&
    isNoDupOwners &&
    !originalHijacked &&
    !hasPatch
    ? 0
    : 1,
);
