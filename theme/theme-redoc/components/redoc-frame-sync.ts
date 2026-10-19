/**
外层文档页与框内那一页之间的约定：地址怎么拼、地址栏里那一段 `#/…` 怎么双向送过去。

两边都是本包自己的代码，跑在**同一个源**里（框内那一页是站点自己的一条路由），
所以这里不需要跨源信任：每条消息都还要过 origin 与来源窗口的校验，为的是「别人往这一页
postMessage」时不会被当成我们的消息，而不是为了防自己。

`src/index.mts` 里注册路由用的是同一个路径名，两处各写一份常量 —— 两边站在编译边界两侧，
共享不了，改要一起改。
*/

/** 框内那一页的路径名（不带 `baseUrl`），与 `src/index.mts` 里注册的那一条同值。 */
export const REDOC_VIEW_ROUTE = 'redoc-view';

/** iframe 地址里带 spec 地址的那一条查询参数名。 */
export const REDOC_SPEC_PARAM = 'src';

/** 外层那个 iframe 的类名：本包外层的版式规则都挂在它上面（比裸 `iframe` 收得多）。 */
export const REDOC_FRAME_CLASS = 'redoc-frame';

/** 消息的标识前缀：只有带这个 `type` 的那一份数据才认成自家消息。 */
const MESSAGE_TYPE = '@show-docs/docusaurus-theme-redoc';

/**
框内外层互送的三件事：选中了哪条接口、「框里那份刚起来，把你要的那一段给我」，
以及站点的亮暗模式（外层 → 框内，见 {@link redocModeMessage}）。
*/
const ROUTE_MESSAGE_TYPE = `${MESSAGE_TYPE}/route`;
const READY_MESSAGE_TYPE = `${MESSAGE_TYPE}/ready`;
const MODE_MESSAGE_TYPE = `${MESSAGE_TYPE}/mode`;

/** 亮暗那一格。形状与站点的开关同值，但**不引**它的类型：那条属性由本层自己写。 */
export type RedocColorMode = 'light' | 'dark';

type RedocRouteMessage = {
  type: typeof ROUTE_MESSAGE_TYPE;
  hash: string;
};
type RedocReadyMessage = { type: typeof READY_MESSAGE_TYPE };
type RedocModeMessage = {
  type: typeof MODE_MESSAGE_TYPE;
  mode: RedocColorMode;
};

/**
拼框内那一页的地址。

`specUrl` 编码进去，`hash` **不**放进去：iframe 的 `src` 因此只跟 frontmatter 走，服务端与
客户端算出的完全一样，两边不会在 `src` 这一格上对不上（深链那一段靠框里那句 ready 送进去，
见 {@link redocReadyMessage}）。
*/
export function redocViewSrc(baseUrl: string, specUrl: string): string {
  return `${baseUrl}${REDOC_VIEW_ROUTE}?${REDOC_SPEC_PARAM}=${encodeURIComponent(specUrl)}`;
}

/** 要送出去的那一条：外层地址栏里 `#` 那一段。 */
export function redocRouteMessage(hash: string): RedocRouteMessage {
  return { type: ROUTE_MESSAGE_TYPE, hash };
}

/**
要送出去的那一条：框里那份文档起来了，向外层要它地址里那一段与当前模式。

为什么是框里开口问、而不是外层守 iframe 的 `load` 事件（命中缓存时那个事件能先于外层的
监听器发生，深链静默丢掉）：实测过程与两种写法的关系记在包 README 的
「深链：`#/orders/createorder` 那一段怎么跨过 iframe」一节。

但**只靠这一句是不够的**：外层那句「监听器装好了就主动推一次」（`redoc-frame.tsx` 的
`pushToFrame`）与这里问的一句是**一对**，因为外层装监听器要等它自己的 React 挂载跑完，
而框里那份文档可能在更早之前就起来问过了 —— iframe 的 `src` 就在外层那份 SSR html 里，
浏览器解析到那一格就开始加载框里那份文档，命中缓存时它甚至能先于外层的水合跑完。
实测栽过一次：`page.reload()` 之后框里问的那句先发出、外层的监听器还没装上，那条 ready
就没人接，于是框里既没拿到深链、也没拿到模式。两边各推一次之后，谁先谁后都不丢。
*/
export function redocReadyMessage(): RedocReadyMessage {
  return { type: READY_MESSAGE_TYPE };
}

/** 收到的数据是不是「框里起来了」那一条（只看形状，来源由 {@link isTrustedMessage} 判）。 */
export function isRedocReadyMessage(data: unknown): data is RedocReadyMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Partial<RedocReadyMessage>).type === READY_MESSAGE_TYPE
  );
}

/**
收到的数据是不是自家那条接口地址（只看形状，来源由 {@link isTrustedMessage} 判）。

`hash` 只认空串与 `#` 开头的那些：拿到别的东西就当不是自家消息，而不是照原样往地址里塞。
*/
export function isRedocRouteMessage(data: unknown): data is RedocRouteMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const message = data as Partial<RedocRouteMessage>;
  return (
    message.type === ROUTE_MESSAGE_TYPE &&
    typeof message.hash === 'string' &&
    (message.hash === '' || message.hash.startsWith('#'))
  );
}

/**
要送出去的那一条：站点当前是亮色还是暗色（外层 → 框内）。

为什么走消息而不是 iframe 的地址：`src` 那一条参数由 frontmatter 决定，服务端与客户端算出的
必须一模一样（见 {@link redocViewSrc}），而亮暗模式只有客户端知道 —— 写进地址就等于让
SSR 那份 html 与客户端第一次渲染对不上。为什么不借站点自己那个开关（框内套一层
`ColorModeProvider`，靠同源 localStorage 的 `storage` 事件跟随）：那要把整个
`@theme/Layout/Provider` 的六个 provider 一起拉进框内那份文档，而这一页连 navbar、footer
都没有，只消费一个「现在是亮还是暗」的值。送一条消息，框内往自己的 `<html>` 上写一条属性，
要圈的只有这一格。

框内收到就往 `<html>` 上写 `data-redoc-mode`，Redoc 那套暗色表改挂在这条属性上
（`redoc-color-mode.ts`）。第一次送是框里那句 ready 带出来的，之后每次外层换模式再送一次。
*/
export function redocModeMessage(mode: RedocColorMode): RedocModeMessage {
  return { type: MODE_MESSAGE_TYPE, mode };
}

/** 收到的数据是不是「站点换亮暗了」那一条（只看形状，来源由 {@link isTrustedMessage} 判）。 */
export function isRedocModeMessage(data: unknown): data is RedocModeMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const message = data as Partial<RedocModeMessage>;
  return (
    message.type === MODE_MESSAGE_TYPE &&
    (message.mode === 'light' || message.mode === 'dark')
  );
}

/**
这条消息是不是从 `expectedSource` 那个窗口、同一个源发来的。

两个方向都过这一格：外层只收自己那个 iframe 的，框内只收装载它的父窗口的。地址栏里
别人手工拼的那一条、以及页面上任何第三方脚本发的消息，都进不到这条路里。
*/
export function isTrustedMessage(
  event: MessageEvent,
  expectedSource: Window | null,
  origin: string,
): boolean {
  return event.source === expectedSource && event.origin === origin;
}

/**
从框内那一页的地址里取出要渲染的 spec 地址。

只认能解析成 `http:` / `https:` 的：这一格来自地址栏，任何人都能手工拼一条
`/redoc-view?src=javascript:…` 那样的地址，而 Redoc 拿到的是「去取这个地址」的指令，
不该由本层替它把非 URL 的东西喂进去。解析结果恒为绝对地址，`/openapi.yaml` 这种相对
写法按 `base`（调用方给 `window.location.origin`）展开。
*/
export function specUrlFromSearch(
  search: string,
  base: string,
): string | undefined {
  const raw = new URLSearchParams(search).get(REDOC_SPEC_PARAM);
  if (raw === null) {
    return undefined;
  }
  try {
    const url = new URL(raw, base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined;
  } catch {
    // `base` 本身不是合法 URL 时才走到这里（拼错的相对地址在 `new URL` 那一格抛）
    return undefined;
  }
}
