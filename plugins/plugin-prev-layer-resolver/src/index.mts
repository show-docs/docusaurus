import type { LoadContext, Plugin } from '@docusaurus/types';

import { layersFromPlugins } from './layers.mts';
import { PluginDiscovery } from './plugins.mts';
import { PrevLayerResolverPlugin } from './resolver.mts';
import type { LoggerLike } from './types.mts';

export interface PrevLayerResolverOptions {
  /** 注入 logger（测试用） */
  logger?: LoggerLike;
  /** 直接给 plugins 列表（测试用）；生产路径由官方 `loadContext` + `loadPluginConfigs` 取回 */
  plugins?: Parameters<typeof layersFromPlugins>[0]['plugins'];
}

/**
让「多个主题链式包裹同一个组件」成立，**无需任何配置清单**。

站点 plugins 里放一个实例即可（主题顺序 = plugins 数组顺序；包出口是
本包 `dist/` 的编译产物，改完源码记得 `pnpm build:core`）：

  plugins: [
    require.resolve('@show-docs/docusaurus-plugin-prev-layer-resolver'),   // 指向 dist 产物
    '@show-docs/theme-a',                                        // 主题包：按包名加载
  ]

之后任意主题层都能这样写（写法与站点层完全一致、无需感知层级）：

  import PrevLogo from '@theme-prev/Logo';   // = 我下面那一层

层栈、specifier 语义、为什么不改 `@theme-original`、为什么不读别名表，
全文在 `./README.md` 与各模块的类头，这里只留接线所需的事实：
层栈在初始化阶段由 {@link PluginDiscovery} 取好（挂在插件实例上，因此 `reloadSite()`
自然拿到新层栈）；拿不到插件列表时 `layersFromPlugins` 接受 null，退化成「只有
theme-fallback 与站点层」的层栈 —— 主题层全缺席（由 discovery 自己告警），站点层的
`@theme-prev/*` 最多落到 stub 层，同样不会静默产出错误产物。
*/
export default async function prevLayerResolverPlugin(
  context: LoadContext,
  options: PrevLayerResolverOptions = {},
): Promise<Plugin> {
  const { siteDir } = context;
  const logger = options.logger ?? console;

  // 「层栈从哪来」在初始化阶段做完（`configureWebpack` 是同步的，没法 await）
  const plugins =
    options.plugins ?? (await new PluginDiscovery(siteDir, logger).discover());

  // 插件列表必须在 `configureWebpack` **之前**拿到：`applyConfigureWebpack()` 是同步的，
  // 而推导层栈要 import core 的 ESM 入口（只能 await）。插件初始化函数本身被 await，
  // 因此这里是唯一「允许异步、结果又能留给 configureWebpack 用」的时机。

  return {
    // name 是官方的全局唯一标识，取 `plugin-*` 而非 `theme-*`：本插件不提供主题，
    // 名字不该长得像主题插件（理由见本包 README 的「名字说的是它做的事」）。
    // 与包名同标识符、**不顶 `@docusaurus/` 域**：第三方插件取官方的域会暗示官方血源，
    // 也可能撞上按域名分类的工具。
    name: '@show-docs/docusaurus-plugin-prev-layer-resolver',

    configureWebpack() {
      // 推层栈（列表已在初始化阶段取好）。`plugins` 为 null（拿不到插件列表）时的降级
      // 由 `layersFromPlugins` 自己兜，它本来就接受 null —— 注意此时层栈**不一定为空**：
      // 只要 core 与 `src/theme` 定位得到，fallback 与站点层仍在栈里，缺席的是全部主题层。
      const layers = layersFromPlugins({ siteDir, plugins, logger });

      // 空层栈 = 本插件什么都不做，最容易变成静默失效 —— 由「问层栈的那个人」报一次，
      // resolver 不重复报同一件事。层栈本身不在这里打印：要排查时问
      // `layersFromPlugins({ siteDir, plugins })` 要（`demo/scripts/verify-chain.mts` 就是这么做的），
      // 不必为「看一眼」在插件上留一份自己的格式。
      if (layers.length === 0) {
        logger.warn?.(
          '[plugin-prev-layer-resolver] 没拿到主题层栈，@theme-prev/* 将全部交回官方解析（真实报 Module not found）。',
        );
      }

      // logger 必须一起传：否则「不变量违规」告警会落到默认 console、形同虚设 —— 而它正是
      // 「层栈推导错了」的唯一信号。实例每次构建新建（缓存为什么挂实例上见 `resolver.mts`）。
      const resolverPlugin = new PrevLayerResolverPlugin({ layers, logger });

      // 只返回**自己新增的那一个** resolver：官方 `applyConfigureWebpack` 用 webpack-merge
      // 拼接，而它对数组的策略是 concat —— 写成 `[resolver, ...已有]` 会让已有 resolver
      // 被复制一份、实例化两次（实测 `[别人, resolver, 别人]`）。
      return {
        resolve: {
          plugins: [resolverPlugin],
        },
      };
    },
  };
}
