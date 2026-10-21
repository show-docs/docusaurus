import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { DocusaurusPluginLike, LoggerLike, ThemeLayer } from './types.mts';

/**
层栈推导：按官方 `loadThemeAliases` 的同款规则做一次「同名同序」的复算
（`[ThemeFallbackDir, ...pluginThemes, src/theme]`）。常量与解析规则能借官方导出的一律借，
唯一「自建」的是**层名**与**是否存在**这两个给 resolver 用的注解。
*/

/** 官方常量缺失时的兜底（正常情况下用不到） */
const FALLBACK_THEME_PATH = 'src/theme';

/**
存在性探测：不存在 / 权限不足 / 悬空软链都算「不存在」，一律不抛（`fs.existsSync`
把所有错误都吞成 false）。用于目录与锚点；**组件候选必须走 {@link isFile}** ——
`existsSync` 对目录也返回 true。
*/
export function exists(p: string): boolean {
  return fs.existsSync(p);
}

/**
「是文件」探测：不存在 / 权限不足 / 悬空软链 / **目录**都算「不是」，一律不抛。

组件候选必须用这一把：官方 `createAliasesForTheme` 用 fast-glob 的默认 `onlyFiles: true`
枚举，**目录永远不进别名表**。
*/
export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
统一层路径的规范化口径：层栈里 `owner` 的每一次比较（去重、前缀匹配）都必须走它，
否则 `..` / 软链会让**同一个目录落在多个下标上**（`findIssuerLayerIndex` 走的是它的
带缓存版 `realpathOf`，口径相同）。

用 `realpathSync` 而不是 `path.normalize`：pnpm 的 `node_modules` 全是软链，
只有真实路径能保证「同一目录 = 同一字符串」。目录不存在时退回 `resolve`，不抛错。
*/
export function normalizeLayerPath(p: string): string {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

/** 从站点上下文解析模块路径；失败返回 null（不抛） */
function resolveFromSite(siteDir: string, id: string): string | null {
  try {
    // `noop.js` 只是锚点：`createRequire` 要一个文件路径才能建出站点侧的解析上下文
    return createRequire(path.join(siteDir, 'noop.js')).resolve(id);
  } catch {
    return null;
  }
}

/**
从 core 的解析上下文里 require 一个它自己的依赖（`@docusaurus/utils` 等）。

基准必须是 **core 的位置**：utils 是 core 的依赖、被 pnpm 隔离进 `.pnpm/`，
从站点根解析恒为 `MODULE_NOT_FOUND`。拿不到时返回 null，由调用方退回兜底。
*/
export function resolveFromCore<T>(siteDir: string, id: string): T | null {
  const coreRoot = resolveCoreRoot(siteDir);
  if (!coreRoot) return null;
  try {
    return createRequire(path.join(coreRoot, 'package.json'))(id) as T;
  } catch {
    return null;
  }
}

/**
`@docusaurus/core` 的包根目录；定位不到返回 null。

只解析 `package.json`（包根标识）再 `path.join` 子路径，不解析 `lib/` 子路径：后者能命中只是因为
core 目前没有 `exports` 字段 —— 那是它的实现细节。上游一旦补上，`ERR_PACKAGE_PATH_NOT_EXPORTED`
会让所有这类定位**同时静默失效**（`theme-fallback` 整层消失）。内部 API 不稳定的固有风险仍在，
但它现在是**一处**、且失败会降级并告警。
*/
export function resolveCoreRoot(siteDir: string): string | null {
  // 首选：正常安装下一定命中（core 是站点直接依赖）
  const viaResolve = resolveFromSite(siteDir, '@docusaurus/core/package.json');
  // 未命中说明站点侧解析不到 core（pnpm 隔离 / 装得不完整），走下面的路径遍历兜底
  if (viaResolve) return path.dirname(viaResolve);
  // 兜底：逐级上溯找 node_modules/@docusaurus/core（不经过 Node 解析）
  let dir = path.resolve(siteDir);
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '@docusaurus', 'core');
    if (exists(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
core 内部文件的绝对路径（{@link resolveCoreRoot} + `path.join`，理由见其文档）。
路径不存在返回 null，由调用点显式处理 —— 不让「core 结构变了」表现成难懂的 `MODULE_NOT_FOUND`。
*/
export function resolveCoreModule(
  siteDir: string,
  relative: string,
): string | null {
  const root = resolveCoreRoot(siteDir);
  if (!root) return null;
  const file = path.join(root, 'lib', relative);
  // 两半都有用例：不存在（core 结构不符预期）与存在（真站点 / 假 core）。
  return exists(file) ? file : null;
}

/**
theme-fallback 目录 —— 按官方定义（`path.join(__dirname, '../../client/theme-fallback')`，
`__dirname` 是 `<core>/lib/webpack/aliases`）从 core 的模块位置推导，而不是把那段内部路径抄第二遍；
锚点文件的存在性由 {@link resolveCoreModule} 保证，「这份 core 结构如官方所料」因此只有一个产地。

拿不到 core 时返回 null：**这一层缺失，其余层不受影响**。刻意不做「反查别名表」的兜底 —— 别名表里
只有被覆盖 / 冲突过的组件才有落点，全覆盖时一个指向 fallback 的值都没有，一层「有时在有时不在」的
语义关键层比明说「这里拿不到」更难查。
*/
export function resolveFallbackDir(siteDir: string): string | null {
  // 锚点已由 `resolveCoreModule` 判过：不存在即 null，这里不必再兜一层。
  const anchor = resolveCoreModule(siteDir, 'webpack/aliases/index.js');
  if (!anchor) return null;
  const dir = path.join(
    path.dirname(anchor),
    '..',
    '..',
    'client',
    'theme-fallback',
  );
  return exists(dir) ? dir : null;
}

/**
把 `plugin.getThemePath()` 解析成绝对主题目录；插件没有主题时返回 null。
与官方唯一的差别是容错：包了 try/catch，避免第三方插件的 getThemePath 抛错时整个构建失败。
*/
export function resolvePluginThemePath(
  plugin: DocusaurusPluginLike | null | undefined,
  siteDir: string,
  logger?: LoggerLike,
): string | null {
  if (!plugin || typeof plugin.getThemePath !== 'function') return null;
  let themePath: string | undefined;
  try {
    themePath = plugin.getThemePath();
  } catch (error) {
    logger?.warn?.(
      `[plugin-prev-layer-resolver] 插件 getThemePath() 调用失败，已跳过该主题层：${
        plugin.name ?? '<unknown plugin>'
      }。`,
      error,
    );
    return null;
  }
  if (!themePath || typeof themePath !== 'string') return null;
  if (path.isAbsolute(themePath)) return normalizeLayerPath(themePath);
  // 官方用 plugin.path（绝对路径）；缺失时退回 siteDir
  const base = plugin.path ?? siteDir;
  return normalizeLayerPath(path.resolve(base, themePath));
}

export interface LayersFromPluginsOptions {
  /**
  站点根目录
  */
  siteDir: string;
  /**
  Docusaurus plugin 实例列表（有 getThemePath 的才是主题）
  */
  plugins?: readonly (DocusaurusPluginLike | null | undefined)[] | null;
  /** 可选日志器，用于报告主题插件路径探测失败 */
  logger?: LoggerLike;
}

/**
从 plugin 列表推出有序层栈（内 → 外）：
`[theme-fallback, ...preset 主题, ...用户 plugin 主题, src/theme]`
*/
export function layersFromPlugins({
  siteDir,
  plugins,
  logger,
}: LayersFromPluginsOptions): ThemeLayer[] {
  const layers: ThemeLayer[] = [];
  const seen = new Set<string>();

  /**
  同一目录只保留第一次出现（**按真实路径**去重，不做「前缀包含就折叠」）：
  `src/theme` 与 `src/theme/inner` 是两个不同的层，折叠会把站点层一起弄丢。
  */
  const add = (layer: Omit<ThemeLayer, 'exists'>) => {
    const owner = normalizeLayerPath(layer.owner);
    if (seen.has(owner)) return;
    seen.add(owner);
    // 不存在的目录不是层（官方 `createAliasesForTheme` 同样跳过）
    if (!exists(owner)) return;
    layers.push({ ...layer, owner, exists: true });
  };

  // ① 链底：theme-fallback（官方别名 target 的最后兜底），位置跟着 core 模块走。
  const fallback = resolveFallbackDir(siteDir);
  if (fallback)
    add({ name: 'theme-fallback', owner: fallback, kind: 'fallback' });

  // ② preset 主题 + 用户 plugin 主题：顺序 = plugin 声明顺序
  const declared = plugins ?? [];
  for (const plugin of declared) {
    const owner = resolvePluginThemePath(plugin, siteDir, logger);
    // 没有主题目录的插件（含取不到 `getThemePath` 的）不产生层
    if (!owner || !plugin) continue;
    // 同一目录若恰好是 fallback 位置，按 `add` 的去重规则它已经是那层（`kind` 取先出现的）
    add({ name: pluginName(plugin, owner), owner, kind: 'plugin' });
  }

  // ③ 最外层：站点 src/theme（目录名读官方常量；读不到是「上游改了导出名 / core 装得不完整」，
  //    退回兜底目录名而不是把整条推导打断）
  const utils = resolveFromCore<{ THEME_PATH?: string }>(
    siteDir,
    '@docusaurus/utils',
  );
  const userTheme =
    typeof utils?.THEME_PATH === 'string'
      ? utils.THEME_PATH
      : FALLBACK_THEME_PATH;
  add({
    name: `site:${userTheme}`,
    owner: path.resolve(siteDir, userTheme),
    kind: 'site',
  });

  return layers;
}

/** 层的展示名：优先 plugin.name，其次目录名 */
function pluginName(plugin: DocusaurusPluginLike, owner: string): string {
  const { name } = plugin;
  return typeof name === 'string' && name.length > 0
    ? name
    : path.basename(path.dirname(owner));
}
