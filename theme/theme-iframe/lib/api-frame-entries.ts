/**
本次渲染该按什么顺序判这四把键 —— 注册表给数据，站点给裁决权，**只有一条规则**：

- 参与判定的层 = **装了的层**（`plugins` 里有其包名、或其包目录内入口路径的那一项）；
- 顺序默认 = 注册表的清单顺序，站点可在本层插件选项
  `['@show-docs/docusaurus-theme-iframe', { themeConfig: { apiFrame: { order: [...] } } }]`
  里用命名空间数组覆盖（数组顺序就是判定优先级，也是参与判定的**子集**）。

覆盖只改顺序与子集，**不放宽装机过滤**：列了没装的层照样不参与 ——
否则「指向不存在路由的框」这个失败模式会在覆盖下被重新引入。

为什么读的是**原始 `plugins` 数组**而不是 `themeConfig`：实测（`pnpm build` 后的
`.docusaurus/docusaurus.config.mjs`）浏览器侧那份 `themeConfig` 只来自官方 merge，而 merge
只收 `themes` 注册表；本站把本层注册在 `plugins` 里，插件选项不进那格。原始 `plugins` 是
选项唯一到得了浏览器侧的位置，形状按配置写法有四种（见 `readPluginSlot`）。
这一格依赖的是 Docusaurus 的**实现细节**（浏览器配置序列化保留原始形状），不是公开承诺 ——
`demo/scripts/verify-chain.mts` 里有一道门禁钉住它，升级后行为变了会判红。

落空的键（写了、层没装或被覆盖排除）会**进 `warnings`**：收拢前的旧行为是照样命中再渲染一个
坏框，肉眼可见；装机过滤把它变成「页面看起来正常但键没生效」，所以这一格要由 `DocItem` 在
开发模式打到控制台，不能让手误静默。

注册表仍是层的**数据**来源（route、类名、参数名都在那），这里只回答顺序与启用。
纯函数、不引 React，单测与 `DocItem` 引同一份。
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
  const unscoped = namespace.split('/').pop() ?? namespace;
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
  /** 每条都是「配置写了但没生效」的说明；页面级那几条带页面地址（去重按文本判等，不带地址会吞掉后面同毛病的页）。`DocItem` 只在开发模式打出来。 */
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

  // 键写了、层却没参与判定 —— 交回普通文档页之前，把原因留在这里（开发模式可见）。
  // 消息**带页面地址**：`DocItem` 的去重按文本判等，不带地址的话十个页面上的同一个手误只报第一个。
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
