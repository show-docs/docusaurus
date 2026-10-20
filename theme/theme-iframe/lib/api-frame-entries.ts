/**
本次渲染该按什么顺序判这几把键 —— 注册表给数据，站点给裁决权，**只有一条规则**：

- 参与判定的层 = **装了的层**（`plugins` 里有其包名、或其包目录内入口路径的那一项）；
- 顺序默认 = 注册表的清单顺序，站点可在本层插件选项
  `['@show-docs/docusaurus-theme-iframe', { themeConfig: { apiFrame: { order: [...] } } }]`
  里用命名空间数组覆盖顺序与子集。**覆盖不放宽装机过滤**：列了没装的层照样不判，否则
  「指向不存在路由的框」这个失败模式会在覆盖下被重新引入。

为什么读的是**原始 `plugins`** 而不是 `themeConfig`、那四种配置写法各怎么认，见
`docs/iframe-protocol.md` 的「注册表与分发」一节。这一格吃的是 Docusaurus 的**实现细节**
（浏览器配置序列化保留原始形状）而非公开承诺，`demo/scripts/verify-chain.mts` 第 3 节钉着它。

落空的键（写了、层没装或被覆盖排除）进 `warnings`：装机过滤把旧的「照样命中、渲染一个坏框」
换成「页面看着正常但键没生效」，所以手误不能静默 —— `DocItem` 在开发模式把那份清单交给
`warnFrameDistribution()` 打到控制台，构建产物不打。

这里只回答顺序与启用；route、类名、参数名那些数据在 `api-frame-registry.ts`。
判定与打日志都不引 React，单测与 `DocItem` 引这同一份。
*/

import {
  apiFrameByNamespace,
  apiFrameEntriesOrdered,
  type ApiFrameEntry,
} from './api-frame-registry.ts';

/** 本层的包名 = `plugins` 里那一项的名字 = 注册表里 external 条目的命名空间。 */
const IFRAME_NAMESPACE = '@show-docs/docusaurus-theme-iframe';

/** 覆盖清单的载体：插件选项那一格（`{ themeConfig: { apiFrame: { order } } }`）。 */
type ApiFramePluginOptions = {
  themeConfig?: { apiFrame?: { order?: string[] } };
};

/**
从 `siteConfig.plugins` 的一项里取「名字 + 选项」。浏览器侧拿到的是**原始配置形状**，四种写法：
- 字符串（裸包名或路径 —— 名字与层的对应关系见 `slotIsNamespace`）；
- `[包名, 选项]`；
- `[路径, 选项]`；
- `{name}` 对象（归一化形状，兼容 `siteVersion` 那类元数据）。
*/
function readPluginSlot(plugin: unknown): {
  name: string | undefined;
  options: ApiFramePluginOptions | undefined;
} {
  if (typeof plugin === 'string') {
    return { name: plugin, options: undefined };
  }
  if (Array.isArray(plugin)) {
    return {
      name: typeof plugin[0] === 'string' ? plugin[0] : undefined,
      options: plugin[1] as ApiFramePluginOptions | undefined,
    };
  }
  return {
    name:
      typeof plugin === 'object' && plugin !== null
        ? (plugin as { name?: string }).name
        : undefined,
    options: undefined,
  };
}

/**
一个槽位的名格是不是这条层：裸包名相等，或**该包目录内任何入口**的绝对路径
（`docusaurus-theme-x` 与去前缀的 `theme-x` 两种目录段都认 —— 按包目录认，不钉具体
入口文件名；钉文件名会把「产物改名」变成静默失效）。装机判定与覆盖槽位识别共用这一条，
两边不存在「一层认路径、另一层只认包名」的不对称。
*/
function slotIsNamespace(name: string, namespace: string): boolean {
  if (name === namespace) {
    return true;
  }
  const pathForm = name.replaceAll('\\', '/');
  // 去掉 `@scope/` 前缀：没有斜杠时 lastIndexOf 给 -1，slice(0) 就是原样 —— 写成一条无分支的
  // 算式，因为 `split('/').pop() ?? namespace` 那个 `??` 的兜底只有类型层面存在，运行时永远
  // 走不到，是量不到的分支。
  const unscoped = namespace.slice(namespace.lastIndexOf('/') + 1);
  const shortForm = unscoped.replace(/^docusaurus-/, '');
  return (
    pathForm.includes(`/${unscoped}/`) || pathForm.includes(`/${shortForm}/`)
  );
}

/** 站点给本层的那份覆盖清单；顺带认出「写了覆盖但挂的槽位认不出本层」这一种手误。 */
function findOverrideOrder(
  slots: readonly {
    name: string | undefined;
    options: ApiFramePluginOptions | undefined;
  }[],
  warnings: string[],
): string[] | undefined {
  let orphanOrder: string[] | undefined;
  for (const slot of slots) {
    const order = slot.options?.themeConfig?.apiFrame?.order;
    if (order === undefined) {
      continue;
    }
    if (
      slot.name !== undefined &&
      slotIsNamespace(slot.name, IFRAME_NAMESPACE)
    ) {
      return order;
    }
    orphanOrder = order;
  }
  if (orphanOrder !== undefined) {
    warnings.push(
      `\`plugins\` 里有一项写了 \`${IFRAME_NAMESPACE}\` 的 \`themeConfig.apiFrame.order\` 覆盖，但它挂的那个插件名没被认成本层（路径写法要落在本包目录内）。覆盖未生效，仍按默认顺序判定。`,
    );
  }
  return undefined;
}

/** 判定清单 + 需要提示给站点作者的落空原因。 */
export type FrameDistribution = {
  entries: readonly ApiFrameEntry[];
  /** 每条都是「配置写了但没生效」的说明；页面级那几条带页面地址（去重按文本判等，不带地址会吞掉后面同毛病的页）。由 `DocItem` 在开发模式交给 `warnFrameDistribution`。 */
  warnings: readonly string[];
};

export function resolveFrameDistribution(
  plugins: readonly unknown[],
  frontMatter: Record<string, unknown> | undefined,
  pagePath?: string,
): FrameDistribution {
  const slots = plugins.map((plugin) => readPluginSlot(plugin));
  const isInstalled = (namespace: string): boolean =>
    slots.some(
      (slot) =>
        slot.name !== undefined && slotIsNamespace(slot.name, namespace),
    );

  const warnings: string[] = [];
  const override = findOverrideOrder(slots, warnings);

  let entries: ApiFrameEntry[];
  if (override === undefined) {
    entries = apiFrameEntriesOrdered().filter((entry) =>
      isInstalled(entry.namespace),
    );
  } else {
    entries = [];
    for (const namespace of override) {
      const entry = apiFrameByNamespace(namespace);
      if (entry === undefined) {
        warnings.push(
          `覆盖清单里的 \`${namespace}\` 不在注册表内（拼错？），这一项被丢掉。`,
        );
        continue;
      }
      if (!isInstalled(namespace)) {
        warnings.push(
          `覆盖清单里的 \`${namespace}\` 没装（\`plugins\` 里没有这个名字），装机过滤对覆盖同样生效，这一层不参与判定。`,
        );
        continue;
      }
      if (!entries.includes(entry)) {
        entries.push(entry);
      }
    }
  }

  // 键写了、层却没参与判定 —— 交回普通文档页之前，把原因留进 warnings（为什么要带页面地址见上面）。
  for (const entry of apiFrameEntriesOrdered()) {
    if (entries.includes(entry)) {
      continue;
    }
    const value = frontMatter?.[entry.frontmatterKey];
    if (typeof value === 'string' && value !== '') {
      warnings.push(
        `${pagePath ?? '这一页'} 写了 \`${entry.frontmatterKey}:\`，但 \`${entry.namespace}\` 没参与判定（${
          isInstalled(entry.namespace) ? '被站点的覆盖清单排除' : '那个插件没装'
        }），交回普通文档页。`,
      );
    }
  }

  return { entries, warnings };
}

/** 每种文本只打一次：配置级那几条（覆盖拼错、挂错槽位）每翻一页都会重算出来，逐页刷屏没有增量信息。 */
const shownWarnings = new Set<string>();

/** 把落空原因打到控制台：`DocItem` 只在开发模式调这一格，构建产物里不打。 */
export function warnFrameDistribution(warnings: readonly string[]): void {
  for (const warning of warnings) {
    if (shownWarnings.has(warning)) {
      continue;
    }
    shownWarnings.add(warning);
    console.warn(`[theme-iframe] ${warning}`);
  }
}
