/**
页面侧那一格：一页写了框的键之后，框里该渲染哪份文档、写歪了怎么提示。

## 这一份现在只剩「一页」的事

「哪几层参与判定、按什么顺序」已经搬到配置期：本包把装了的层按注册表顺序交给
`@show-docs/docusaurus-theme-component-page`（见 `api-frame-contribute.mts`），由那份生成的清单
决定哪一层接管这一页；本层只提供 `theme/ApiFramePage` 那个组件，命中后它从入参里拿到赢的
那一层的命名空间。所以这里不再读 `siteConfig.plugins`，也不再有一套自己的「装机过滤 + 覆盖
清单」—— 那两件事现在由 component-page 的清单与站点的 `pages` 说了算。

剩下两件都在这一页之内：

- 内层（三条 API 层）交出的键只说明「用这一层渲染」，要渲染的文档地址另由 spec 键
  （`oas3:` / `aas3:`）给，这里按注册表顺序取第一把非空值；
- 写了布尔键却没给地址、或两把 spec 键同时写 —— 框出不来、或只用了其中一把，开发模式要说。
  「布尔键写成了别的形状」不再由这里报：component-page 那把通用告警对同一把键、同一个判法
  已经说过一次（`lib/component-page.ts` 的 `componentPageWarnings()`）。

不引 React、不引 DOM：`theme/ApiFramePage` 与单测引同一份。
*/

import type { ComponentPageValue } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';

import type {
  ApiFrameEntry,
  ApiFrameEntryInternal,
} from './api-frame-registry.ts';

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
这一页要用框渲染的那个地址：内层取 spec 键给的，外层就是命中那把键写下的值。

值那一格来自 component-page 的清单（内层恒为 `true`、外层是那串地址），这里只做形状收口：
外层拿到的不像地址就不出框，交回普通文档页 —— 组件是本包的公开出口，站点覆写它时什么样都
可能传进来。
*/
export function framePageUrl(
  entry: ApiFrameEntry,
  frontMatter: Record<string, unknown> | undefined,
  value: ComponentPageValue,
): string | undefined {
  if (entry.kind === 'internal') {
    return frameSpecUrl(entry, frontMatter);
  }
  return typeof value === 'string' ? value : undefined;
}

/** 告警里那组 spec 键的写法：`` `oas3:` / `aas3:` ``。 */
function specKeyLabels(entry: ApiFrameEntryInternal): string {
  return entry.specFrontmatterKeys.map((key) => `\`${key}:\``).join(' / ');
}

/**
这一页在框里出不了框、或用得不对劲时的说明。

命中是 component-page 判的（**这一页归了本层**），所以这里不再问「装了没有」；只剩两件：

- 内层写了布尔键却没给 spec 地址 —— 框里没有可渲染的文档，组件会交回普通文档页，不能静默；
- 两把 spec 键同时写 —— 只用注册表顺序里的前一把，通常是手误。

页面地址带在每条里：同一毛病的两页各打一条，不带地址就会把后面那页吞掉。
*/
export function framePageWarnings(
  entry: ApiFrameEntry,
  frontMatter: Record<string, unknown> | undefined,
  pagePath?: string,
): readonly string[] {
  if (entry.kind === 'external') {
    return [];
  }

  const page = pagePath ?? '这一页';
  const [spec, ...otherSpecs] = writtenSpecs(entry, frontMatter);

  if (spec === undefined) {
    return [
      `${page} 写了 \`${entry.frontmatterKey}: true\`，但没有 ${specKeyLabels(entry)}（框里要渲染的那份文档地址），这一层不出框，交回普通文档页。`,
    ];
  }

  return otherSpecs.length > 0
    ? [
        `${page} 的 spec 键写了不止一把（${specKeyLabels(entry)}），按注册表顺序只用 \`${spec.key}:\` 给的地址，其余被忽略 —— 两把都写通常是手误。`,
      ]
    : [];
}

/** 每种文本只打一次：同一页反复渲染都会重算出同一条，逐页刷屏没有增量信息。 */
const shownWarnings = new Set<string>();

/** 把落空原因打到控制台：`ApiFramePage` 只在开发模式调这一格，构建产物里不打。 */
export function warnFramePages(warnings: readonly string[]): void {
  for (const warning of warnings) {
    if (shownWarnings.has(warning)) {
      continue;
    }

    shownWarnings.add(warning);
    console.warn(`[theme-iframe] ${warning}`);
  }
}
