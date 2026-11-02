import type { LoadContext } from '@docusaurus/types';

import {
  declaredNamespaces,
  PLUGIN_NAME,
  slotIsNamespace,
  type PluginSlots,
} from './plugin-slots.mts';
import { importCoreModule, type LoadContextFn } from './plugins.mts';

/**
「这个包在这一轮构建里注册成插件了没有」、「注册成了几份」，以及建在这两句上面的安装前提。

为什么不能只看 `siteConfig.plugins` / `themes` 那两份原始清单：站点可以把必需的插件写在
**preset** 里（`presets: [myPreset]`，preset 函数自己交出 `{plugins, themes}`），官方把那两格
合并成真实插件表发生在 `loadPluginConfigs` 内部，`LoadContext` 上没有合并后的清单可读。只读原始
清单的后果是**把一个装齐了的站点判死** —— 它明明注册了，我们看不见，于是构建停在「请先 pnpm add」。
所以这里先按原始清单判（那一份是同步的、也是绝大多数站点的全部），判不出再去问官方那一份。

代价记在两条口径里：问官方那一份**只在缺的这一侧**发生（站点没写 presets 就没有别处可查，直接
判缺），且要等（官方的 `loadContext` / `loadPresets` 都是异步的）—— 因此这一格的判定是
`Promise`，各层的 `loadContent()` 必须把它交回官方等。误报的代价比漏报大（漏了还有构建期那一步
会炸），所以问不到官方那一份时**不拦**。

**这一格判到的是「注册」，不是「真的被装载」**：官方允许插件构造函数返回 `null` 自行禁用
（`@docusaurus/core/lib/server/plugins/init.js` 的 `onlyInitializedPlugins()` 把 `plugin: null`
那些滤掉），那种包在清单上照样看得见，但官方不会跑它的 `loadContent()`，`allContent` 里也没有它。
读得到「真实例」的唯一一处就是 `allContent`，而它不在 `LoadContext` 上、这一跳还读不到 —— 所以
「装了却什么都没交」不在本包的题目里，归机制层那一侧判（三份判据各读什么、差在哪，集中记在
`packages/theme-component-page/docs/internals.md`）。
*/

/** 官方 `loadPresets(context)` 交回的那两格（每一项还没归一化，形状与站点写的同款）。 */
type LoadPresetsFn = (context: unknown) => Promise<PluginSlots>;

/** 那两份清单里是不是某一项写着这个包。 */
function slotsMention(slots: PluginSlots, required: string): boolean {
  return declaredNamespaces(slots).some((slot) =>
    slotIsNamespace(slot, required),
  );
}

/**
站点写在各处的那两份原始清单（`plugins` / `themes`）。
*/
function declaredSlots(context: LoadContext): PluginSlots {
  return {
    plugins: context.siteConfig.plugins,
    themes: context.siteConfig.themes,
  };
}

/**
各 preset 交出的那两份清单；**问不到时返回 null**（core 结构变了、配置文件读不了、preset
函数自己抛）。
*/
async function presetSlots(context: LoadContext): Promise<PluginSlots | null> {
  const [loadContext, loadPresets] = await Promise.all([
    importCoreModule<LoadContextFn>(
      context.siteDir,
      'server/site.js',
      'loadContext',
    ),
    importCoreModule<LoadPresetsFn>(
      context.siteDir,
      'server/plugins/presets.js',
      'loadPresets',
    ),
  ]);

  if (!loadContext || !loadPresets) {
    return null;
  }

  try {
    // 与官方同源的那份 context：`loadPresets` 要从 `siteConfigPath` 建 require 上下文，
    // 并且读的是**校验并归一化之后**的 `presets` 那一格。
    const official = await loadContext({
      siteDir: context.siteDir,
      config: context.siteConfigPath,
    });

    return await loadPresets(official);
  } catch {
    // 配置文件读不了、或某个 preset 函数抛了：这跟「装没装」不相干，交给官方那一步去报。
    return null;
  }
}

/**
那个包注册成插件了没有 —— 原始清单算，preset 里那一份也算。判的是「清单上有这个名字」（见文件头
那句「注册 ≠ 真的被装载」）。

返回 `true` 的两种情形分别是「确实注册了」与「我们问不出答案」：后者不拦，因为这一条只是把
构建期注定会炸的东西提前点名，误报却会判死一个本来能成的构建。
*/
export async function pluginIsRegistered(
  context: LoadContext,
  required: string,
): Promise<boolean> {
  if (slotsMention(declaredSlots(context), required)) {
    return true;
  }

  // 没有 preset 就没有别处可查：这一格判得实。
  if ((context.siteConfig.presets?.length ?? 0) === 0) {
    return false;
  }

  const fromPresets = await presetSlots(context);

  return fromPresets === null || slotsMention(fromPresets, required);
}

/**
给**层**用的那一条安装前提：本包自己注册成了插件。

只有层里真写 `@theme-prev/*` 的才该调它 —— 缺了它，webpack 会停在 `Module not found`，报错点
离真正的原因隔着一整个构建。只用官方别名（`@theme/X`、`@theme-original/X`、`@theme-init/X`）的层
不查这一条：那三把是 core 自己挂的 alias，本包在不在都一样解得开。报错里点名的是**调用方**的包名：
「谁需要本包」要说得清，站点才知道该回去看哪一层的文档。

交回的是 `Promise`：见文件头那条「preset 里那一份要等官方那一步」。
*/
export async function assertPrevLayerResolverInstalled(
  context: LoadContext,
  namespace: string,
): Promise<void> {
  if (await pluginIsRegistered(context, PLUGIN_NAME)) {
    return;
  }

  throw new Error(
    `${namespace} 需要 ${PLUGIN_NAME}：所有主题的 \`@theme-prev/*\` 都由它提供别名。` +
      `请先 \`pnpm add ${PLUGIN_NAME}\`，再把它加进 \`plugins\`（一个实例即可；写进某个 preset 的 \`plugins\` / \`themes\` 里也算）。`,
  );
}

/** 那两份清单里写着这个包的条目数 —— 认包名，不认实例 id。 */
function slotsCount(slots: PluginSlots, name: string): number {
  return declaredNamespaces(slots).filter((slot) => slotIsNamespace(slot, name))
    .length;
}

/**
这个包在本站点注册成了**几份**实例。

认的是包名而不是实例 id：官方只拦「同一个插件挂两次又不给 id」（`Plugin IDs must be unique`），
给了不同 id 的两份在官方那里完全合法。但合法不等于有用 —— 吃不下第二份实例的那几层，症状都要等
构建跑完才看得见，而且都不指向真正的原因（见 {@link assertSinglePluginInstance}）。

读法与 {@link pluginIsRegistered} 同一套两档，误差也同一档：**只可能少判，不可能多判** ——
原始清单数到了就不去翻案，问不到官方那一份时按原始清单那份交回（那种情形下即便真有第二份藏在
preset 里，也只是这一条不响，不会误判死一个本来能成的构建）。两份都藏在 preset 里也要数得着，
所以「原始清单是 0」不是提前收手的理由。
*/
export async function pluginInstanceCount(
  context: LoadContext,
  name: string,
): Promise<number> {
  const declared = slotsCount(declaredSlots(context), name);

  // 站点没写 presets 就没有别处可查：这一格判得实。
  if ((context.siteConfig.presets?.length ?? 0) === 0) {
    return declared;
  }

  const fromPresets = await presetSlots(context);

  return declared + (fromPresets === null ? 0 : slotsCount(fromPresets, name));
}

/**
「这一层只能有一份实例」那条前提：注册了两份以上就当场点名。

**为什么两份不行不是这一层的事**，各调用方在 `why` 里自己说（徽标那层的护栏会吞掉第二份，
机制层那一份会被后写的盖掉）；这里只负责把「注册了几份」数出来并给一句能照着改的话。
*/
export async function assertSinglePluginInstance(
  context: LoadContext,
  namespace: string,
  why: string,
): Promise<void> {
  const count = await pluginInstanceCount(context, namespace);

  if (count > 1) {
    throw new Error(
      `${namespace} 在本站点被注册成了 ${String(count)} 份实例，而这一层只能有一份：${why}`,
    );
  }
}
