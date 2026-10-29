import type { LoadContext, Plugin } from '@docusaurus/types';

import { layersFromPlugins } from './layers.mts';
import { PluginDiscovery } from './plugins.mts';
import { PrevLayerResolverPlugin } from './resolver.mts';
import { showDocsSourceRule } from './source-js-rule.mts';
import type { LoggerLike } from './types.mts';

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
  const { siteDir } = context;
  const logger = options.logger ?? console;

  // 插件列表必须在 `configureWebpack` **之前**拿到：`applyConfigureWebpack()` 是同步的，
  // 而推导层栈要 import core 的 ESM 入口（只能 await）。这里是唯一「允许异步、结果又能
  // 留给 `configureWebpack` 用」的时机（同款说明见 docs/internals.md「插件如何注入 resolver」）。
  const plugins =
    options.plugins ?? (await new PluginDiscovery(siteDir, logger).discover());

  return {
    // 为什么取 `plugin-*` 而非 `theme-*`、为什么不顶 `@docusaurus/` 域：docs/internals.md
    // 「名字说的是它做的事」。
    name: '@show-docs/docusaurus-plugin-prev-layer-resolver',

    configureWebpack(_config, isServer, utils) {
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

      // 只返回**自己新增的那一个** resolver（webpack-merge 对数组是 concat，
      // 写成 `[resolver, ...已有]` 会让已有 resolver 实例化两次）：docs/internals.md
      // 「插件如何注入 resolver」。
      return {
        resolve: {
          plugins: [resolverPlugin],
        },
        // 家族里那些**未编译**的 TS 源码（各主题包的层与组件）随包发布，官方那条 babel 规则
        // 把 `node_modules` 整个排除在外 —— 这一格补上，判据见 `source-js-rule.mts`。
        // 它与层栈无关：层栈空了这条规则照样在（那只是 `@theme-prev/*` 失效）。
        module: {
          rules: [showDocsSourceRule(utils, isServer)],
        },
      };
    },
  };
}
