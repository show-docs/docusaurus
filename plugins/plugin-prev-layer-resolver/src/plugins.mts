import { realpathSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  normalizeLayerPath,
  resolveCoreModule,
  resolveFromCore,
} from './layers.mts';
import type { DocusaurusPluginLike, LoggerLike } from './types.mts';

/**
「谁在链上、什么顺序」这一步。

层栈顺序完全由 `plugins` 声明顺序决定，而 `configureWebpack` 的签名里拿不到它，
所以必须从 Docusaurus 那边要回来。官方自己（`createBaseConfig` → `loadThemeAliases`）
用的是 `initPlugins` 取的列表；我们**复用它的第一步** `loadPluginConfigs`
（只读配置 + 解析模块 + 归一化，**不调用插件构造函数**）：

  plugins = await loadPluginConfigs(await loadContext({ siteDir }))

再只保留**实例化后带 `getThemePath`** 的，顺序即官方 `loadThemeAliases` 看到的顺序。
不用 `initPlugins`（它会把本插件也实例化 ⇒ 本插件的初始化又走整条推导：自检漏判时是
**无限递归 OOM**，不漏判也是三倍实例化）、也不用 `loadPlugins`（下游，还会跑
`contentLoaded()` 并真实写 `.docusaurus/`）的理由，与「包装 `loadThemeAliases` /
从上下文取 `plugins` 等不成立的做法」记在 `./README.md`，此处不抄。

代价：官方把这两个入口当内部 API，因此整条路径带降级（失败返回 null，resolver 退化为
不改写任何 request，最坏是真实的 `Module not found`）；且会**重复实例化**主题插件
（官方随后还会自己实例化一遍）—— 所以对主题插件的约束是「整个模块加载期无副作用」。
*/

/**
官方 `loadPluginConfigs` 的返回项（只描述我们用到的字段）
*/
interface NormalizedPluginConfig {
  /** 插件函数或返回插件对象的函数 */
  plugin?: unknown;
  /** 声明时的选项（**未校验**，官方随后会跑 validateOptions 归一化） */
  options?: Record<string, unknown>;
  /**
  插件入口绝对路径（官方据此设 `plugin.path`）。官方 `normalizePluginConfig` 的四个分支
  都设它（内联插件取 configPath）。
  */
  entryPath: string;
  /** 仅按字符串 / 数组声明的插件才有：静态导出可能直接挂在插件模块上 */
  pluginModule?: {
    module?: {
      validateOptions?: unknown;
      validateThemeConfig?: unknown;
      default?: { validateOptions?: unknown; validateThemeConfig?: unknown };
    };
  };
}

type LoadPluginConfigsFn = (
  context: unknown,
) => Promise<NormalizedPluginConfig[]>;
type LoadContextFn = (params: { siteDir: string }) => Promise<unknown>;

type CoreModule = Record<string, unknown> & {
  default?: Record<string, unknown>;
};

/**
从 core 自己的模块上下文 import 它的 ESM 入口，取出名为 `name` 的导出（用 CJS
require.resolve 定位文件）；命名导出与挂在 `default` 上两种形态都认。
*/
async function importCoreModule<T>(
  siteDir: string,
  relative: string,
  name: string,
): Promise<T | undefined> {
  const entry = resolveCoreModule(siteDir, relative);
  // core 定位不到（结构变了 / 依赖被裁剪）时降级，用例走的是没有 node_modules 的站点
  if (!entry) return undefined;
  try {
    const mod = (await import(pathToFileURL(entry).href)) as CoreModule;
    // default 缺失时用空对象走同一条取值，得到 undefined = 降级。
    const defaultExport = mod.default ?? ({} as Record<string, unknown>);
    return (mod[name] ?? defaultExport[name]) as T | undefined;
  } catch {
    // 文件在，但 `import()` 自己抛（入口语法错 / 依赖链断）→ 降级成「层栈不可用」，
    // 而不是把异常抛给构建。用例：假 core 的入口写的是 `throw new Error(...)`。
    return undefined;
  }
}

/**
一次插件初始化 = 一份「谁在链上、什么顺序」。

「同一份插件列表别推两遍」的边界就是**一次插件初始化**：实例随插件回收，进程里没有
第二个消费者，因此这里不持有任何进程级状态。`docusaurus start` 的 `reloadSite()`
重新实例化插件 ⇒「改了配置 → 新实例 → 新层栈」是自然结果，不需要读配置、算指纹。
*/
export class PluginDiscovery {
  private pending: Promise<DocusaurusPluginLike[] | null> | null = null;

  // 显式字段而非构造器参数属性：`erasableSyntaxOnly` 下参数属性会生成赋值代码，
  // 不是「只擦类型」的语法（TS1294）。
  private readonly siteDir: string;
  private readonly logger: LoggerLike;

  constructor(siteDir: string, logger: LoggerLike) {
    this.siteDir = siteDir;
    this.logger = logger;
  }

  /**
  按官方顺序取出「有主题的插件」列表（可直接喂给 `getThemePath()`）。
  
  同一实例内只推一次：`configureWebpack` 会被 client / server 各调一次，
  重复推导就会重复 `loadFreshModule` 主题插件入口，而它对 ESM 主题的代价是
  **模块级状态分裂**。
  
  @returns 拿不到时返回 null（调用方应降级，而不是当成空层栈）
  */
  discover(): Promise<DocusaurusPluginLike[] | null> {
    this.pending ??= derivePlugins(this.siteDir, this.logger);
    return this.pending;
  }
}

/**
版本护栏：靠 core 内部 API + enhanced-resolve 的内部 hook 工作，而它们都没有稳定性承诺。
读一次 core 版本，低于已知可用的 minor 时**告警不阻断**（也许只是没测过的更高版本）。
与 `peerDependencies` 互补：peerDeps 在安装时可见，这里覆盖「从源码直接跑」的情形。
*/
const MIN_SUPPORTED_DOCUSAURUS_MAJOR = 3;
const MIN_SUPPORTED_DOCUSAURUS_MINOR = 10;

function checkDocusaurusVersion(siteDir: string, logger: LoggerLike): void {
  // 与 `resolveNormalizePluginOptions` 同一条口径：从 core 的解析上下文读它自己的
  // package.json（定位不到 / 读不到时 `resolveFromCore` 自己吞成 null，这里当作
  // 「不知道」，不制造噪音）。
  const corePkg = resolveFromCore<{ version?: unknown }>(
    siteDir,
    '@docusaurus/core/package.json',
  );
  const version = typeof corePkg?.version === 'string' ? corePkg.version : '';
  const [major, minor] = version.split('.').map((n) => Number.parseInt(n, 10));
  // 解析不出 major/minor（缺字段 / 非数字）时当作「不知道」，不制造噪音
  if (
    major === undefined ||
    minor === undefined ||
    !Number.isFinite(major) ||
    !Number.isFinite(minor)
  )
    return;
  // 两侧都由用例覆盖：大版本过低（`2.x`）与同 major 但 minor 过低（`3.0`）。
  if (
    major < MIN_SUPPORTED_DOCUSAURUS_MAJOR ||
    (major === MIN_SUPPORTED_DOCUSAURUS_MAJOR &&
      minor < MIN_SUPPORTED_DOCUSAURUS_MINOR)
  ) {
    logger.warn?.(
      `[plugin-prev-layer-resolver] 检测到 @docusaurus/core@${version}，低于已验证的 ` +
        `^${MIN_SUPPORTED_DOCUSAURUS_MAJOR}.${MIN_SUPPORTED_DOCUSAURUS_MINOR}.0。` +
        '本插件依赖 core 的内部 API（loadPluginConfigs / 主题别名规则）与 enhanced-resolve ' +
        '的 internal-resolve hook，版本差异可能导致层栈推导失败或链静默不生效。',
    );
  }
}

/** 默认推导：`PluginDiscovery` 保证同一实例只跑一次 */
async function derivePlugins(
  siteDir: string,
  logger: LoggerLike,
): Promise<DocusaurusPluginLike[] | null> {
  const [loadContext, loadPluginConfigs] = await Promise.all([
    importCoreModule<LoadContextFn>(siteDir, 'server/site.js', 'loadContext'),
    importCoreModule<LoadPluginConfigsFn>(
      siteDir,
      'server/plugins/configs.js',
      'loadPluginConfigs',
    ),
  ]);
  if (!loadContext || !loadPluginConfigs) {
    logger.warn?.(
      '[plugin-prev-layer-resolver] 拿不到 Docusaurus 的 loadContext / loadPluginConfigs，层栈不可用，' +
        '@theme-prev/* 将全部交回官方解析（表现为真实的 Module not found）。',
    );
    return null;
  }

  checkDocusaurusVersion(siteDir, logger);

  try {
    const context = await loadContext({ siteDir });
    const configs = await loadPluginConfigs(context);
    return await instantiateThemePlugins(configs, context, siteDir, logger);
  } catch (error) {
    logger.warn?.(
      '[plugin-prev-layer-resolver] 读取 Docusaurus 插件列表失败，层栈不可用。',
      error,
    );
    return null;
  }
}

/**
本插件**包目录**（真实路径）—— 用来跳过自己，为什么必须跳过见 {@link isSelfPlugin}。

判据只能是「入口的真实路径落在本包目录内」：`import.meta.url` 落在当前这个模块
（源 `plugins.mts` / 产物 `plugins.mjs`），而官方给的 `entryPath` 是包入口
（`index.mts` / `index.mjs`），按文件比会漏判自己。
*/
const SELF_DIR = realpathOfSelfDir();

function realpathOfSelfDir(): string {
  // 必须用 `fileURLToPath`：Windows 上 `new URL(url).pathname` 是 `/C:/dir/f.mjs`，带前导
  // 斜杠 ⇒ `realpathSync` 抛 ENOENT。这里不兜错：源码与产物都在本包目录内，目录必然存在，
  // 真不存在时让模块在顶层常量初始化阶段就加载失败，而不是静默产出一个错值。
  return realpathSync(dirname(fileURLToPath(import.meta.url)));
}

/**
是不是本插件自己的入口。用目录前缀判定，不用路径正则 / 目录名（别名安装、软链、改名都认得
出来）。代价不对称：认错自己 = 再实例化一遍 → 重复推导 → **递归 OOM**；不认自己只是多构造
一次 —— 所以没有入口的内联插件（配置里直接写函数）按「不是自己」放行。pnpm 下一个包一个
目录，同目录邻居就是同包的其他入口，不会误伤别家插件。

它还是整条推导**唯一**的防递归承重墙：本插件一旦经拷贝 / 别名路径加载（认不出自己），
就会被再实例化一遍 ⇒ 初始化又走整条推导 ⇒ 无限递归。判据因此取目录前缀而非名字 / 正则。
*/
function isSelfPlugin(entryPath: string | undefined): boolean {
  return entryPath
    ? normalizeLayerPath(entryPath).startsWith(`${SELF_DIR}${path.sep}`)
    : false;
}

/**
给插件实例补齐官方 `initPlugins` 会补的字段：`{ ...pluginInstance, options, version, path }`，
返回补齐后的那一份（不改入参对象）。

跳过 `version`（要读 package.json，推导层栈用不到）。`options` 保留实例自带的那份
（插件自己挂在返回值上的才是它实际用的；官方用传入的校验值覆盖，等价）。

`path` 与官方一致**恒取 `dirname(entryPath)`**（官方 `initializePlugin` 原文）：
官方 `loadThemeAliases` 用这个 `path` 解析 `getThemePath()`，保留实例自带的 `path`
会在「插件自设 path ≠ 入口目录」时与官方算出**不同的层路径** —— 同一组件在
`@theme-prev/X` 与 `@theme/X` 落到两个模块，正是本方案要避免的两套可见性。entryPath
恒存在（见 {@link NormalizedPluginConfig}）；真缺失时 `dirname` 抛错被上层 catch 接住
（告警 + 跳过该层），比 silently 退回实例自带值诚实。
*/
function withOfficialFields(
  instance: DocusaurusPluginLike,
  options: Record<string, unknown>,
  entryPath: string,
): DocusaurusPluginLike {
  return {
    ...instance,
    path: dirname(entryPath),
    options: instance.options || options,
  };
}

/**
复刻官方 `initPluginsConfigs` 的 `doValidatePluginOptions`。

关键不是「补一个 id」，而是跑插件自己的 `validateOptions`：官方给构造函数的是
「校验 + 默认值归一化之后」的 options，而声明值可能缺字段。实测一个 `getThemePath()`
读 `options.dir` 的主题：声明值推出 `<siteDir>/NO_DIR`，校验之后才是 `<siteDir>/theme`。
`owner` / issuer 归属 / 组件定位全建在 layer path 上，所以这不是「少一个字段」，
是**层路径直接算错**（层在栈里但路径不对，比少一层更难查）。

校验函数的位置**照官方**（`getOptionValidationFunction`，见 {@link findOptionValidationFunction}）：
漏掉任一条查找路都会让对应声明形态的插件丢默认值 ⇒ 层路径静默算错。

校验没跑起来时**退回声明值**（不抛）—— 后果见 `resolver.mts`，属「降级」而非「构建失败」，与拿不到 core 同一档。
*/
function validatePluginOptions(
  config: NormalizedPluginConfig,
  validate: NormalizeOptions,
): Record<string, unknown> {
  // 内联 / 简化形态的 config 可以完全没有 `options`（用例给的就是这种）
  const declared = config.options ?? {};
  // 官方同款兜底：没有 `validateOptions` 的插件不走 Joi，由官方在这里补 id
  const fallback = {
    ...declared,
    id: (declared as { id?: unknown }).id ?? 'default',
  };
  const candidate = findOptionValidationFunction(config);
  if (typeof candidate !== 'function') return fallback;
  try {
    return (
      candidate as (arg: {
        validate: unknown;
        options: unknown;
      }) => Record<string, unknown>
    )({
      validate,
      options: declared,
    });
  } catch {
    // 校验本身没跑起来（schema 校验失败、或直通实现处理 Joi schema 时抛错）→ 退回声明值。
    // 这里必须吞掉：抛出去等于一个校验函数就把整个插件列表推导打断，影响面远大于
    // 「某一层路径不对」。
    return fallback;
  }
}

/**
官方 `getOptionValidationFunction` 的同款查找，**两条路官方都走**：有 `pluginModule`
（字符串 / 数组声明的插件）看模块导出 `module.default.validateOptions ?? module.validateOptions`；
没有（**内联函数插件**）看插件函数自己的静态属性 `plugin.validateOptions`。

曾经只实现了第 1 条、第 2 条查了一个官方返回形状里不存在的字段：内联声明的主题插件
因此整体丢默认值（层路径静默算错）。`plugin` 在官方形状里恒为函数，但这里不替上游
保证，安全取值。
*/
function findOptionValidationFunction(config: NormalizedPluginConfig): unknown {
  const { pluginModule } = config;
  if (pluginModule) {
    const { module } = pluginModule;
    return module?.default?.validateOptions ?? module?.validateOptions;
  }
  const plugin = config.plugin as
    { validateOptions?: unknown } | null | undefined;
  return plugin?.validateOptions;
}

/**
`validateOptions({ validate, options })` 里的 `validate`，即官方
`normalizePluginOptions(schema, options)`：插件给 **Joi schema**，官方补通用字段并填默认值。
*/
type NormalizeOptions = (
  schema: (options: unknown) => Record<string, unknown>,
  options?: unknown,
) => Record<string, unknown>;

/** 解析不到官方实现时的兜底：把 schema 当函数调（它是 Joi 对象，会抛错 → 退声明值） */
const passthroughNormalize: NormalizeOptions = (schema, options) =>
  schema(options);

/**
取官方 `normalizePluginOptions`：必须以 **core 的位置**为基准解析
`@docusaurus/utils-validation`，才拿得到 core 实际用的那一份（版本 / dedupe 一致）。
拿不到时的直通**不是**等价实现（Joi schema 当函数调会抛错 → 退声明值 → 默认值全丢，
层路径随之算错），即「取不到官方实现」意味着校验整体失效。
*/
function resolveNormalizePluginOptions(siteDir: string): NormalizeOptions {
  // 「从 core 的解析上下文读它自己的依赖」与 `layers.mts` 的 `resolveFromCore` 同一条口径
  // （core 在 pnpm 下被隔离进 `.pnpm/`，从站点根解析恒为 MODULE_NOT_FOUND）。
  const candidate = resolveFromCore<{
    normalizePluginOptions?: NormalizeOptions;
  }>(siteDir, '@docusaurus/utils-validation');
  // 「core 能定位、但它那份 utils-validation 取不到」（依赖被裁剪 / 加载即抛）→ 退直通。
  return typeof candidate?.normalizePluginOptions === 'function'
    ? candidate.normalizePluginOptions
    : passthroughNormalize;
}

/**
官方 `getThemeValidationFunction` 的同款查找，**两条路官方都走**：有 `pluginModule`
（字符串 / 数组声明的插件）看模块导出 `module.default.validateThemeConfig ??
module.validateThemeConfig`；没有（内联函数插件）看插件函数自己的静态属性
`plugin.validateThemeConfig`。

与 {@link findOptionValidationFunction} 同构，但喂的是另一份官方实现
（{@link NormalizeThemeConfig}）—— 见 {@link mergeValidatedThemeConfig}。
*/
function findThemeValidationFunction(config: NormalizedPluginConfig): unknown {
  const { pluginModule } = config;
  if (pluginModule) {
    const { module } = pluginModule;
    return module?.default?.validateThemeConfig ?? module?.validateThemeConfig;
  }
  const plugin = config.plugin as
    { validateThemeConfig?: unknown } | null | undefined;
  return plugin?.validateThemeConfig;
}

/**
`validateThemeConfig({ validate, themeConfig })` 里的 `validate`，即官方
`normalizeThemeConfig(schema, themeConfig)`：插件给 Joi schema，官方**允许未知键**
（一个主题只校验自己那一片，否则别家主题的字段会把它校验失败）并填默认值。
*/
type NormalizeThemeConfig = (
  schema: (themeConfig: unknown) => Record<string, unknown>,
  themeConfig?: unknown,
) => Record<string, unknown>;

/**
取官方 `normalizeThemeConfig`：与 {@link resolveNormalizePluginOptions} 同一条口径
（core 的位置为基准解析它自己的 `@docusaurus/utils-validation`）。拿不到时返回 null
—— 合并整体跳过（没有官方的 `validate`，插件那份 Joi schema 没人会跑）。
*/
function resolveNormalizeThemeConfig(
  siteDir: string,
): NormalizeThemeConfig | null {
  const candidate = resolveFromCore<{
    normalizeThemeConfig?: NormalizeThemeConfig;
  }>(siteDir, '@docusaurus/utils-validation');
  return typeof candidate?.normalizeThemeConfig === 'function'
    ? candidate.normalizeThemeConfig
    : null;
}

/** 声明时那份 themeConfig（官方 context 恒有 siteConfig；夹具里可能没有，原样 undefined） */
function readDeclaredThemeConfig(
  context: unknown,
): Record<string, unknown> | undefined {
  const siteConfig = (
    context as { siteConfig?: { themeConfig?: unknown } } | null | undefined
  )?.siteConfig;
  const themeConfig = siteConfig?.themeConfig;
  return themeConfig && typeof themeConfig === 'object'
    ? (themeConfig as Record<string, unknown>)
    : undefined;
}

/**
给构造函数造一份「带合并后 themeConfig」的 context 拷贝（官方是就地改
`context.siteConfig.themeConfig`，这里不改入参：那份 context 的所有权不归我们）。
siteConfig 缺失时补一个只带 themeConfig 的 —— 官方 context 里它恒存在。
*/
function withMergedThemeConfig(
  context: unknown,
  themeConfig: Record<string, unknown>,
): unknown {
  const siteConfig = (
    context as { siteConfig?: Record<string, unknown> } | null | undefined
  )?.siteConfig;
  return { ...(context as object), siteConfig: { ...siteConfig, themeConfig } };
}

/**
官方 `initializePlugin` 里「先合并 themeConfig，再调构造函数」那一步（core
`server/plugins/init.js`）：把本插件 `validateThemeConfig` 的返回值并入**累积的**
themeConfig，返回交给构造函数的 context。

为什么必须做：官方给每个构造函数的 context 都带着「前序插件校验并填好默认值之后」
的 themeConfig，而 `theme-classic` 的构造函数**就读它**（`themeConfig.prism.additionalLanguages`，
站点不声明 `prism` 时直接 TypeError）。跳过这一步的代价不是「少几个默认值」——
是那个主题插件整个构造失败、**从层栈里静默消失**（实测本仓库：配置去掉 `prism` 后
theme-classic 即如此，链底少一层）。

按官方口径做（不另立标准）：累积值从声明时那份 themeConfig 起算，逐插件并入；
校验函数自己的两条查找路见 {@link findThemeValidationFunction}。取不到官方
`normalizeThemeConfig`（core 的 utils-validation 被裁剪 / 加载即抛）或校验本身抛错时
**跳过合并**：推导层栈这一轮不需要它炸，真正的构建会在官方那轮把同一个错报出来。
*/
function mergeValidatedThemeConfig(
  config: NormalizedPluginConfig,
  context: unknown,
  themeConfig: Record<string, unknown> | undefined,
  normalizeThemeConfig: NormalizeThemeConfig | null,
): { context: unknown; themeConfig: Record<string, unknown> | undefined } {
  const validator = findThemeValidationFunction(config);
  if (!normalizeThemeConfig || typeof validator !== 'function')
    return { context, themeConfig };
  try {
    const validated = (
      validator as (arg: {
        validate: NormalizeThemeConfig;
        themeConfig?: unknown;
      }) => Record<string, unknown>
    )({ validate: normalizeThemeConfig, themeConfig });
    const merged = { ...themeConfig, ...validated };
    return {
      context: withMergedThemeConfig(context, merged),
      themeConfig: merged,
    };
  } catch {
    return { context, themeConfig };
  }
}

/**
实例化插件并只保留带 `getThemePath` 的（= 官方意义上的「主题」）。顺序即
`loadPluginConfigs` 的输出顺序，与 `loadThemeAliases` 入参完全一致。

与官方 `initializePlugin` 余下的刻意差异（都不影响 `getThemePath()` 的取值）：不检查
实例有无 `name`（官方缺 name 会抛错，这里静默跳过、层名退化为目录名，真正的构建会在
官方那轮报出来）。
*/
async function instantiateThemePlugins(
  configs: NormalizedPluginConfig[],
  context: unknown,
  siteDir: string,
  logger: LoggerLike,
): Promise<DocusaurusPluginLike[] | null> {
  const plugins: DocusaurusPluginLike[] = [];
  /** 构造失败的插件（入口标签 + 原因），循环后聚合成一条告警（为何不当场 warn 见 catch） */
  const constructionFailures: { entry: string; reason: string }[] = [];
  const validateOptions = resolveNormalizePluginOptions(siteDir);
  const normalizeThemeConfig = resolveNormalizeThemeConfig(siteDir);
  // 官方同序：先校验 options，再并入本插件的 themeConfig，最后才调构造函数。
  let themeConfig = readDeclaredThemeConfig(context);
  for (const config of configs) {
    const factory = config.plugin;
    if (typeof factory !== 'function') continue;
    // 跳过本插件自己：重复实例化等于重复推导（会递归）
    if (isSelfPlugin(config.entryPath)) continue;
    try {
      // 与官方 `initializePlugin` 同序：先校验 options，再并入本插件的 themeConfig，
      // 最后才交给构造函数（顺序反了的话构造函数看到的就是官方不给它的那份 themeConfig）。
      const options = validatePluginOptions(config, validateOptions);
      const merged = mergeValidatedThemeConfig(
        config,
        context,
        themeConfig,
        normalizeThemeConfig,
      );
      themeConfig = merged.themeConfig;
      const instance = (await (
        factory as (ctx: unknown, options: unknown) => unknown
      )(merged.context, options)) as DocusaurusPluginLike | null;
      // 官方允许插件返回 null 自行禁用；只有声明了 getThemePath 的才算主题层
      if (instance && typeof instance === 'object') {
        const filled = withOfficialFields(instance, options, config.entryPath);
        // 官方意义上的「主题」= 声明了 getThemePath；返回对象却没有它的不进层栈
        const themePath = filled.getThemePath;
        if (typeof themePath === 'function') plugins.push(filled);
      }
    } catch (error) {
      // 多数插件（content-docs / content-pages 等）需要完整 context 才能构造，只有 siteDir
      // 时会抛错；它们本来就不提供主题，跳过合理。但**一条都不能省**：这个 catch 无法区分
      // 「本来就没主题」和「有主题但在有限 context 下构造失败」，而后者会让层栈少一层且
      // 完全静默（最难查的一类故障）。可用的判据一个都没有 —— entryPath 是声明入口
      // （构建产物里 `getThemePath` 可能被压缩成短名），而普通插件与主题插件的入口都读得到。
      // `?? '<inline plugin>'` 给的是内联插件（配置里直接写函数，没有入口）的标签，
      // 否则这一行会打印 `undefined` 而看不出是谁失败了。
      // 只收集、不当场 warn：逐条报就是每次构建刷 N 行，而「谁失败了、为什么」一条汇总
      // 放得下（汇总见循环外）。`String(error)` 而非 `.message`：带上错误类型名
      // （`TypeError: …`），非 Error 抛出（`throw 'boom'`）也不会变成 `undefined`。
      constructionFailures.push({
        entry: config.entryPath ?? '<inline plugin>',
        reason: String(error),
      });
    }
  }
  // N 条失败一条汇总：名单与原因全内联，行数从 N 降到 1。「不报」是不可接受的降级
  // （漏报 = 层栈少一层且完全静默），所以一条都不能省，只是不再一人一行。
  if (constructionFailures.length > 0) {
    const list = constructionFailures
      .map((failure) => `  - ${failure.entry}: ${failure.reason}`)
      .join('\n');
    logger.warn?.(
      `[plugin-prev-layer-resolver] ${constructionFailures.length} 个插件构造失败，可能有主题（若有则层栈少了对应层，依赖它的 @theme-prev/* 会静默交回官方解析）：\n${list}`,
    );
  }
  return plugins;
}
