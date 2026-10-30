/**
文档页与框内那份独立文档之间的约定：那四条 postMessage 长什么样、送出去的数据有什么限制。

两边都是站点编译的本仓代码，跑在**同一个源**里（框内那一页是本层注册的一条插件路由），所以这套
约定不需要跨源信任；每条消息仍要过 {@link isTrustedMessage} 那道校验 —— 为的是别人往这一页
postMessage 时不会被当成自家的，而不是为了防自己。同源也不是恶意代码的沙箱：框里跑的还是本仓
编译出来的组件，这一格隔的是「别把渲染器的 DOM、路由与 localStorage 带进文档页」。

这一份只有**约定与形状**，没有 React、也没有 DOM；那条握手循环在 `frame-sync.tsx`，框那一格与
它的版式在 `../components/component-frame.tsx` 与 `../components/component-frame.css`。

**只有一套消息名**：框内路由这一族共用一条，组件靠数据里的登记名区分，不再按包命名空间造三份
（旧的 `createFrameMessages(namespace)` 那个形状给的是「每个包自己一条通道」，通用框只需要一条）。

**数据必须是 JSON**：`value` / `frontMatter` / `props` 三格要跨文档送，所以只能是要么送得出去、
要么当场说清楚的东西。{@link frameDataError} 那条走到底的判据与配置期 `../src/config.mts` 对
`props` 那一格做的是同一件事，只是这里读的是某一页的 frontmatter —— 配置期看不到它。
*/

import type { ComponentPageValue } from '../types/component-page.ts';

/** 亮暗那一格的取值。形状与站点的开关相同，但**不引**它的类型：那条属性由外层送进来。 */
export type FrameColorMode = 'light' | 'dark';

/** 这套约定的前缀：四条消息的 `type` 都挂在它下面。 */
const PROTOCOL = 'theme-component-page';

/** 框内 → 外层：这一份文档起来了，向外层要那一份数据。 */
export type FrameReadyMessage = { type: `${typeof PROTOCOL}/ready` };

/**
外层 → 框内：这一页要渲染哪个组件，以及给它的三份数据。

`componentId` 是那条规则引用的登记名（`FrameComponent` 那条表里的键），`value` 是命中的那把键
写下的值，`frontMatter` 是这一页的整份文件头，`props` 是规则里那一格静态入参。三格的次序在
`component-page.ts` 的 `componentPageProps()` 里定过一次，这里送的已经是并好的那一份 —— 外层
不做第二次。
*/
export type FrameInitMessage = {
  type: `${typeof PROTOCOL}/init`;
  componentId: string;
  data: Record<string, unknown>;
};

/** 外层 → 框内：站点当前是亮色还是暗色。 */
export type FrameModeMessage = {
  type: `${typeof PROTOCOL}/mode`;
  mode: FrameColorMode;
};

/**
`#` 段，两个方向各送一次：外层 → 框内是「页面地址变了（前进/后退、深链）」，
框内 → 外层是「框里换了选中项，把地址写回外层」。同一条 `type`，方向由 `event.source` 分。
*/
export type FrameHashMessage = {
  type: `${typeof PROTOCOL}/hash`;
  hash: string;
};

export const FRAME_READY_TYPE = `${PROTOCOL}/ready` as const;
export const FRAME_INIT_TYPE = `${PROTOCOL}/init` as const;
export const FRAME_MODE_TYPE = `${PROTOCOL}/mode` as const;
export const FRAME_HASH_TYPE = `${PROTOCOL}/hash` as const;

/** 那四条消息本身（引用稳定：它们排在 effect 依赖里，换一次引用就多一轮拆装监听器）。 */
export const frameMessages = {
  ready: (): FrameReadyMessage => ({ type: FRAME_READY_TYPE }),
  init: (
    componentId: string,
    data: Record<string, unknown>,
  ): FrameInitMessage => ({
    type: FRAME_INIT_TYPE,
    componentId,
    data,
  }),
  mode: (mode: FrameColorMode): FrameModeMessage => ({
    type: FRAME_MODE_TYPE,
    mode,
  }),
  hash: (hash: string): FrameHashMessage => ({ type: FRAME_HASH_TYPE, hash }),
};

/** 是不是一个能读 `type` 的对象（四条消息共用的第一道形状判据）。 */
function typed(data: unknown): Record<string, unknown> | undefined {
  return typeof data === 'object' && data !== null
    ? (data as Record<string, unknown>)
    : undefined;
}

export function isFrameReady(data: unknown): data is FrameReadyMessage {
  return typed(data)?.type === FRAME_READY_TYPE;
}

/**
`init` 那一条要连数据一起认：`componentId` 是非空串，`data` 是普通对象。

这两格来自另一个文档送的东西，任何人都能拼一条形状对上的消息，所以只认到「像一条 init」不够 ——
真正的防线是 {@link isTrustedMessage}（只收自己那个窗口、同一个源发来的），这一格管的是
「收进来之后能不能直接用」。
*/
export function isFrameInit(data: unknown): data is FrameInitMessage {
  const message = typed(data);

  return (
    message?.type === FRAME_INIT_TYPE &&
    typeof message.componentId === 'string' &&
    message.componentId !== '' &&
    typeof message.data === 'object' &&
    message.data !== null &&
    !Array.isArray(message.data)
  );
}

// 亮暗只认这两个值：地址栏与第三方脚本都能往这一页送形状对上的对象，取值不在这两格
// 就不往 `<html>` 上写。
export function isFrameMode(data: unknown): data is FrameModeMessage {
  const message = typed(data);

  return (
    message?.type === FRAME_MODE_TYPE &&
    (message.mode === 'light' || message.mode === 'dark')
  );
}

// `hash` 只认空串与 `#` 开头的那些：拿到别的东西就当不是自家消息，
// 而不是照原样往地址里塞。
export function isFrameHash(data: unknown): data is FrameHashMessage {
  const message = typed(data);

  return (
    message?.type === FRAME_HASH_TYPE &&
    typeof message.hash === 'string' &&
    (message.hash === '' || message.hash.startsWith('#'))
  );
}

/** 这一格是不是外层写得进 `init` 的那种容器：数组，或没有原型的普通对象。 */
function isPlainContainer(value: object): boolean {
  if (Array.isArray(value)) {
    return true;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/**
这份数据里有没有送不出去的那几格；有就交回一句点名的话，没有交回 `undefined`。

为什么要在这里走到底而不是直接 `JSON.stringify` 试一次：那种写法要么消失（函数、`undefined`、
`Symbol` 在 JSON 里落空）、要么变成另一种东西（`NaN` 与 `Infinity` 写成 `null`，`Date` 写成串，
`Map` / `Set` 写成空对象）。框里那份文档于是渲染出一页「看着对」的组件，而缺的那一格没人说。
配置期对规则里 `props` 那一格做的是同一件事（`../src/config.mts` 的 `assertPureData()`），
这里读的是某一页的 frontmatter —— 那一格要到浏览器里才知道长什么样。

`parents` 那一串是来路，用来拦自己绕回自己的那种值（`JSON.stringify` 对它抛 `TypeError`）。
*/
export function frameDataError(
  data: unknown,
  where = 'data',
  parents: ReadonlySet<object> = new Set(),
): string | undefined {
  if (data === null || typeof data === 'string' || typeof data === 'boolean') {
    return undefined;
  }

  if (typeof data === 'number') {
    return Number.isFinite(data)
      ? undefined
      : `${where} 是 ${data}：送进框里会变成 null（要的是有限的那个数字）`;
  }

  if (typeof data !== 'object') {
    return `${where} 是 ${typeof data}：只有串 / 数 / 布尔 / null / 普通对象 / 数组送得进框里`;
  }

  if (parents.has(data)) {
    return `${where} 绕回了自己：那种结构送不进框里`;
  }

  if (!isPlainContainer(data)) {
    return `${where} 是另一种对象（不是普通对象也不是数组，如 Date / Map / Set）：那种东西送不进框里`;
  }

  const parentsOfChildren = new Set([...parents, data]);
  const children = Array.isArray(data)
    ? data.map((item, index) => [`${where}[${index}]`, item] as const)
    : Object.entries(data).map(
        ([field, item]) => [`${where}.${field}`, item] as const,
      );

  for (const [childWhere, child] of children) {
    const error = frameDataError(child, childWhere, parentsOfChildren);

    if (error !== undefined) {
      return error;
    }
  }

  return undefined;
}

/**
外层这一页要送进框里的那一份数据：并好的入参（不含 `content`，那一格是 React 组件，本来就送不
出去）。登记名不在这一格 —— 它在 `init` 消息上另占一格（`frameMessages.init`），框内按它查组件。

`component-page` 组装 `page` 那一侧入参用的是 `componentPageProps()`，次序在那里定一次；这一格
是它的同形状版本（只少 `content`），所以「本页事实盖掉静态同名格」那条对两种渲染都成立。
*/
export function frameInitPayload(
  value: ComponentPageValue,
  frontMatter: Record<string, unknown> | undefined,
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...props, frontMatter: frontMatter ?? {}, value };
}
