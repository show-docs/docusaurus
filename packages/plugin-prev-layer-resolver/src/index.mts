import type { LoadContext, Plugin } from '@docusaurus/types';

import { layerWatchRule } from './layer-watch.mts';
import { layersFromPlugins } from './layers.mts';
import { PLUGIN_NAME } from './plugin-slots.mts';
import { PluginDiscovery } from './plugins.mts';
import { PrevLayerResolveTapPlugin } from './resolve-tap.mts';
import { PrevLayerResolverPlugin } from './resolver.mts';
import type { LoggerLike } from './types.mts';

/** `configureWebpack` 交回来的那一格的官方形状。 */
type WebpackResult = Exclude<
  ReturnType<NonNullable<Plugin['configureWebpack']>>,
  void
>;

// 「装了哪些主题插件、它们的实例长什么样」这一次推导在包外也有用处（集成测试按真站点骨架
// 把插件实例取出来）。所以随包公开，而不是只留内部（实例仍随插件回收，进程级状态一条都不持
// —— 理由见 `./plugins.mts` 里那个类的文档）。
export { PluginDiscovery } from './plugins.mts';
export type { DocusaurusPluginLike, LoggerLike } from './types.mts';

export interface PrevLayerResolverOptions {
  /** 注入 logger（测试用） */
  logger?: LoggerLike;
  /** 直接给 plugins 列表（测试用）；生产路径由官方 `loadContext` + `loadPluginConfigs` 取回 */
  plugins?: Parameters<typeof layersFromPlugins>[0]['plugins'];
}

/**
让「多个主题链式包裹同一个组件」成立，**无需任何配置清单**：站点 plugins 里放一个实例，
之后任意主题层都能写 `import PrevLogo from '@theme-prev/Logo'`（= 我下面那一层）。

配置写法、层栈语义、specifier 为什么另起，全文在 `./README.md`（「使用」「工作方式」）。
这里只留接线所需的两条事实：层栈在**初始化阶段**由 {@link PluginDiscovery} 取好（时机为什么
必须是这里见下方 `discover()` 那行）；拿不到插件列表时 `layersFromPlugins` 接受 null，
缺席的是全部主题层 —— 站点层的 `@theme-prev/*` 最多落到 stub 层，不会静默产出错误产物。
*/
export default async function prevLayerResolverPlugin(
  context: LoadContext,
  options: PrevLayerResolverOptions = {},
): Promise<Plugin> {
  const { siteDir, siteConfigPath } = context;
  const logger = options.logger ?? console;

  // 插件列表必须在 `configureWebpack` **之前**拿到：`applyConfigureWebpack()` 是同步的，
  // 而推导层栈要 import core 的 ESM 入口（只能 await）。这里是唯一「允许异步、结果又能
  // 留给 `configureWebpack` 用」的时机（同款说明见 docs/internals.md「插件如何注入 resolver」）。
  const plugins =
    options.plugins ??
    (await new PluginDiscovery(siteDir, logger, siteConfigPath).discover());

  return {
    // 为什么取 `plugin-*` 而非 `theme-*`、为什么不顶 `@docusaurus/` 域：docs/internals.md
    // 「名字说的是它做的事」。名字与「这一族在 `plugins` 里叫什么」取同一处。
    name: PLUGIN_NAME,

    configureWebpack(_config, _isServer, utils) {
      // `plugins` 为 null（拿不到插件列表）时的降级由 `layersFromPlugins` 自己兜；
      // 此时层栈**不一定为空**：只要 core 与 `src/theme` 定位得到，缺席的是全部主题层。
      const layers = layersFromPlugins({ siteDir, plugins, logger });

      // 空层栈 = 本插件什么都不做，最容易变成静默失效 ⇒ 由「问层栈的那个人」报一次
      // （README「告警」第 9 条）。层栈本身不打印：要排查时问 `layersFromPlugins`。
      if (layers.length === 0) {
        logger.warn?.(
          '[plugin-prev-layer-resolver] 没拿到主题层栈，@theme-prev/* 将全部交回官方解析（真实报 Module not found）。',
        );
      }

      // logger 必须一起传：否则「不变量违规」告警会落到默认 console、形同虚设 —— 而它正是
      // 「层栈推导错了」的唯一信号。
      const resolverPlugin = new PrevLayerResolverPlugin({ layers, logger });

      // 两支都要这一条（与 bundler 无关）：落点是「那一层目录里现在有没有这个文件」现算的，
      // bundler 记的却是上一次的解析结果 —— 不把层目录登记成引用方的依赖，「层里多了个组件」
      // 就永远判不旧，链停在上一层上（判据与实测见 `./layer-watch.mts`）。
      const watchRule = layerWatchRule(layers);
      const watch = watchRule ? { module: { rules: [watchRule] } } : {};

      // 当前是哪一个 bundler，读 `configureWebpack` 第三份参数里官方算好的那一格
      //（`utils.currentBundler.name`，来自 `@docusaurus/bundler` 的 `getCurrentBundler()`），
      // 本包不另判一套。
      //
      // 名字在这里只能是两种：官方若加第三种（或改名），**不许**顺手按 webpack 那套接线 ——
      // 这次的根因正是「我们 tap 的东西在这个 bundler 里不存在，而全程没人说话」。
      // 未知名字只能整体禁用并说清楚为什么：静默交回 `resolve.plugins` 就是把那次故障的形状
      // 重新埋回去，而下一次未必有人来查。
      //
      // rspack 不消费 `resolve.plugins`（塞进去的那把 resolver 的 `apply()` 一次都不会被调用），
      // 所以这一支改挂模块工厂的解析前那一格，判据仍是同一个 `resolveTarget`。
      const bundlerName: string = utils.currentBundler.name;
      if (bundlerName === 'rspack') {
        return asWebpackResult({
          ...watch,
          plugins: [new PrevLayerResolveTapPlugin(resolverPlugin)],
        });
      }
      if (bundlerName !== 'webpack') {
        logger.warn?.(
          `[plugin-prev-layer-resolver] 未知 bundler \`${bundlerName}\`：本包只验证过 webpack / rspack 两种接线，` +
            '`@theme-prev/*` 已整体禁用（保持官方解析，表现为真实的 Module not found）。' +
            '这通常意味着 Docusaurus 换了 bundler 或改了那一格的名字，请升级 plugin-prev-layer-resolver。',
        );
        return undefined;
      }

      // 只返回**自己新增的那一个** resolver（webpack-merge 对数组是 concat，
      // 写成 `[resolver, ...已有]` 会让已有 resolver 实例化两次）：docs/internals.md
      // 「插件如何注入 resolver」。
      //
      // `module.rules` 这一格里本包只有上面那条登记层目录的规则；编译这一族未编译 TS 源码那条
      // 仍归 `@show-docs/docusaurus-plugin-compile-source`，两条互不相干（分工见那边
      // README「与解析器插件的分工」：层栈空了那条规则照样在，反之也一样）。
      return asWebpackResult({
        ...watch,
        resolve: {
          plugins: [resolverPlugin],
        },
      });
    },
  };
}

/** 交出去的插件实例收的是本包的形状（不引 webpack / rspack 的类型），所以只在出口处按官方形状改一次。 */
function asWebpackResult(patch: object): WebpackResult {
  return patch as WebpackResult;
}
