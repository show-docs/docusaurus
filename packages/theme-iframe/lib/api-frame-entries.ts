/**
本次渲染该按什么顺序判这几把键 —— 注册表给数据，站点给裁决权，**只有一条规则**：

- 参与判定的层 = **装了的层**（`plugins` 里有其包名、或其包目录内入口路径的那一项）；
- 顺序默认 = 注册表的清单顺序，站点可在本层插件选项
  `['@show-docs/docusaurus-theme-iframe', { themeConfig: { apiFrame: { order: [...] } } }]`
  里用命名空间数组覆盖顺序与子集。**覆盖不放宽装机过滤**：列了没装的层照样不判，否则
  「指向不存在路由的框」这个失败模式会在覆盖下被重新引入。

为什么读的是**原始 `plugins`** 而不是 `themeConfig`、那四种配置写法各怎么认，见
`docs/iframe-protocol.md` 的「注册表与分发」一节。这一格吃的是 Docusaurus 的**实现细节**
（浏览器配置序列化保留原始形状）而非公开承诺，`tools/scripts/verify-chain.mts` 第 3 节钉着它。

落空的键进 `warnings`：装机过滤把旧的「照样命中、渲染一个坏框」换成「页面看着正常但键没生效」，
所以手误不能静默 —— `DocItem` 在开发模式把那份清单交给 `warnFrameDistribution()` 打到控制台，
构建产物不打。四种落空各给一条：键写了但层没装（或被覆盖排除）、键写了但没给 spec 地址、
布尔键写成了别的形状、只给了 spec 地址却没写用哪一层渲染；两把 spec 键同时写时另给一条，
说明按注册表顺序只用前一把。

这里只回答顺序与启用；route、类名、参数名那些数据在 `api-frame-registry.ts`，
键的形状与命中判据（`frameKeyWritten()` / `matchApiFrameEntry()`）也在这一份。
判定与打日志都不引 React，单测与 `DocItem` 引这同一份。
*/

import {
  apiFrameByNamespace,
  apiFrameEntriesOrdered,
  type ApiFrameEntry,
  type ApiFrameEntryExternal,
  type ApiFrameEntryInternal,
} from './api-frame-registry.ts';

/** 本层的包名 = `plugins` 里那一项的名字 = 注册表里 external 条目的命名空间。 */
const IFRAME_NAMESPACE = '@show-docs/docusaurus-theme-iframe';

/** 覆盖清单的载体：插件选项那一格（`{ themeConfig: { apiFrame: { order } } }`）。 */
type ApiFramePluginOptions = {
  themeConfig?: { apiFrame?: { order?: string[] } };
};

/**
从 `siteConfig.plugins` / `siteConfig.themes` 的一项里取「名字 + 选项」。浏览器侧拿到的是
**原始配置形状**，四种写法：
- 字符串（裸包名或路径 —— 名字与层的对应关系见 `slotIsNamespace`）；
- `[包名, 选项]`；
- `[路径, 选项]`；
- `{name}` 对象（归一化形状，兼容 `siteVersion` 那类元数据）。

`plugins` 与 `themes` 是两份清单：Docusaurus 会把它们合并成真实插件表，但生成的浏览器配置里
仍然分开。装机判定两边都要看 —— 用 `themes: ['…']` 声明的层照样参与判定。
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
  const name =
    typeof plugin === 'object' && plugin !== null
      ? (plugin as { name?: unknown }).name
      : undefined;
  return {
    // 归一化形状那一格只认字符串：配置里塞了别的类型就当认不出名字，
    // 而不是把一个数字一路带到 `slotIsNamespace()` 的 `replaceAll` 上。
    name: typeof name === 'string' ? name : undefined,
    options: undefined,
  };
}

/**
一个槽位的名格是不是这条层：裸包名相等，或**该包目录内任何入口**的绝对路径
（`docusaurus-theme-x` 与去前缀的 `theme-x` 两种目录段都认 —— 按包目录认，不钉具体
入口文件名；钉文件名会把「产物改名」变成静默失效）。装机判定与覆盖槽位识别共用这一条，
两边不存在「一层认路径、另一层只认包名」的不对称。
*/
export function slotIsNamespace(name: string, namespace: string): boolean {
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

/**
## 一把键「写了没有」与「命中没有」是两件事

「写了」= 作者选了哪一层；「命中」= 这一层能不能给这一页出框。

- `internal`（三条 API 层）：键写 `true` 才算「写了这一层」（`scalar: true`）；命中还要
  另有一组键给 spec 地址（`oas3:` / `aas3:`）——「用哪一层渲染」与「渲染哪份文档」是两件事。
- `external`（`iframe:`）：键给一个非空地址，值就是框要渲染的那份页面，它不读 spec 键。

命中时交回要送进框里的那一格地址，落空交回 `undefined`。
*/

/** 外层那条（`iframe:`）的值：非空字符串才算写了这一层。 */
function externalValue(
  entry: ApiFrameEntryExternal,
  frontMatter: Record<string, unknown> | undefined,
): string | undefined {
  const value = frontMatter?.[entry.frontmatterKey];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** 一条 spec 键被写了：键名与地址一起交回（告警要按键名说「用的是哪一把」）。 */
type WrittenSpec = { key: string; value: string };

/** 这一页在这条层的 spec 键里写了哪几把（非空字符串），保持注册表给的优先级顺序。 */
function writtenSpecs(
  entry: ApiFrameEntryInternal,
  frontMatter: Record<string, unknown> | undefined,
): WrittenSpec[] {
  const specs: WrittenSpec[] = [];
  for (const key of entry.specFrontmatterKeys) {
    const value = frontMatter?.[key];
    if (typeof value === 'string' && value !== '') {
      specs.push({ key, value });
    }
  }
  return specs;
}

/** 内层那一格要渲染的 spec 地址：这组键里第一把非空的值；外层没有这一格。 */
export function frameSpecUrl(
  entry: ApiFrameEntryInternal,
  frontMatter: Record<string, unknown> | undefined,
): string | undefined {
  return writtenSpecs(entry, frontMatter)[0]?.value;
}

/**
这一页写没写这把键（只看「作者选了哪一层」，不看它出不出得了框）：内层认 `true`、
外层认非空字符串。
*/
export function frameKeyWritten(
  entry: ApiFrameEntry,
  frontMatter: Record<string, unknown> | undefined,
): boolean {
  return entry.kind === 'external'
    ? externalValue(entry, frontMatter) !== undefined
    : frontMatter?.[entry.frontmatterKey] === true;
}

/**
这一层在某一页上命不命中：命中时交回要送进框里的那一格地址（内层是 spec 地址、
外层是外部页面地址），落空交回 `undefined`。
*/
export function matchApiFrameEntry(
  entry: ApiFrameEntry,
  frontMatter: Record<string, unknown> | undefined,
): string | undefined {
  if (entry.kind === 'external') {
    return externalValue(entry, frontMatter);
  }
  return frontMatter?.[entry.frontmatterKey] === true
    ? frameSpecUrl(entry, frontMatter)
    : undefined;
}

/** 注册表里那三条内层（`internal`）条目。 */
function internalEntries(): ApiFrameEntryInternal[] {
  return apiFrameEntriesOrdered().filter(
    (entry): entry is ApiFrameEntryInternal => entry.kind === 'internal',
  );
}

/** 内层那组 spec 键（去重后，保持注册表里的先后）。 */
function specKeys(): string[] {
  return [
    ...new Set(internalEntries().flatMap((entry) => entry.specFrontmatterKeys)),
  ];
}

/** 告警里那组 spec 键的写法：`` `oas3:` / `aas3:` ``。 */
function specKeyLabels(entry: ApiFrameEntryInternal): string {
  return entry.specFrontmatterKeys.map((key) => `\`${key}:\``).join(' / ');
}

/** 告警里那把键的写法：内层是布尔键（`scalar: true`），外层是地址键（`iframe:`）。 */
function keyLabel(entry: ApiFrameEntry): string {
  return entry.kind === 'internal'
    ? `${entry.frontmatterKey}: true`
    : `${entry.frontmatterKey}:`;
}

/** 告警里那几把布尔键的写法：`scalar: true` / `redoc: true` / `stoplight: true`。 */
function internalKeyLabels(): string {
  return internalEntries()
    .map((entry) => `\`${entry.frontmatterKey}: true\``)
    .join(' / ');
}

/** 判定清单 + 需要提示给站点作者的落空原因。 */
export type FrameDistribution = {
  entries: readonly ApiFrameEntry[];
  /** 每条都是「配置写了但没生效」的说明；页面级那几条带页面地址（去重按文本判等，不带地址会吞掉后面同毛病的页）。由 `DocItem` 在开发模式交给 `warnFrameDistribution`。 */
  warnings: readonly string[];
};

/**
站点声明层的两个入口。`themes:` 与 `plugins:` 在 Docusaurus 里是两份清单，装机判定不能只看一份。
*/
export type ApiFrameSlots = {
  plugins?: readonly unknown[] | null;
  themes?: readonly unknown[] | null;
};

/**
`plugins` 与 `themes` 两份清单里每个槽位的名字（认不出的槽位直接略过）。
装机判定与前置检查（`prerequisites.ts`）共用这一条，免得两边各写一套「四种写法怎么认」。
*/
export function declaredNamespaces(declared: ApiFrameSlots): string[] {
  return [...(declared.plugins ?? []), ...(declared.themes ?? [])]
    .map((slot) => readPluginSlot(slot).name)
    .filter((name): name is string => name !== undefined);
}

export function resolveFrameDistribution(
  declared: ApiFrameSlots,
  frontMatter: Record<string, unknown> | undefined,
  pagePath?: string,
): FrameDistribution {
  const slots = [...(declared.plugins ?? []), ...(declared.themes ?? [])].map(
    (plugin) => readPluginSlot(plugin),
  );
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
    if (!frameKeyWritten(entry, frontMatter) || entries.includes(entry)) {
      continue;
    }
    warnings.push(
      `${pagePath ?? '这一页'} 写了 \`${keyLabel(entry)}\`，但 \`${entry.namespace}\` 没参与判定（${
        isInstalled(entry.namespace) ? '被站点的覆盖清单排除' : '那个插件没装'
      }），交回普通文档页。`,
    );
  }

  // 作者要的那一层 = 参与判定的层里第一个写了自己那把键的。它若没拿到 spec 地址，
  // 这一格出不了框（页面看着正常但框没出来），同样给一条说明；两把 spec 键都写时
  // 只用前一把（顺序是注册表给的），也给一条 —— 通常是手误。
  const intended = entries.find((entry) => frameKeyWritten(entry, frontMatter));
  if (intended?.kind === 'internal') {
    const [spec, ...otherSpecs] = writtenSpecs(intended, frontMatter);
    if (spec === undefined) {
      warnings.push(
        `${pagePath ?? '这一页'} 写了 \`${intended.frontmatterKey}: true\`，但没有 ${specKeyLabels(intended)}（框里要渲染的那份文档地址），这一层不出框。`,
      );
    } else if (otherSpecs.length > 0) {
      warnings.push(
        `${pagePath ?? '这一页'} 的 spec 键写了不止一把（${specKeyLabels(intended)}），按注册表顺序只用 \`${spec.key}:\` 给的地址，其余被忽略 —— 两把都写通常是手误。`,
      );
    }
  }

  // 内层那几把键只认布尔：写成别的形状（老写法把 spec 地址直接写进 `scalar:`），
  // 那一层照样不参与判定 —— 也给一条说明。
  for (const entry of internalEntries()) {
    const value = frontMatter?.[entry.frontmatterKey];
    if (value === undefined || typeof value === 'boolean') {
      continue;
    }
    warnings.push(
      `${pagePath ?? '这一页'} 写了 \`${entry.frontmatterKey}:\`，但这一族的键只认布尔 \`true\`（spec 地址另由 ${specKeyLabels(entry)} 给），那一层不参与判定。`,
    );
  }

  // spec 地址单独给出来没用：还得有一把布尔键指明用哪一层渲染它。
  const anyInternalWritten = internalEntries().some((entry) =>
    frameKeyWritten(entry, frontMatter),
  );
  if (!anyInternalWritten) {
    for (const specKey of specKeys()) {
      const spec = frontMatter?.[specKey];
      if (typeof spec !== 'string' || spec === '') {
        continue;
      }
      warnings.push(
        `${pagePath ?? '这一页'} 写了 \`${specKey}:\`，但没写 ${internalKeyLabels()} —— spec 地址得配一把布尔键指明用哪一层渲染。`,
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
