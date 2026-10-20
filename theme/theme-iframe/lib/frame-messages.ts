/**
外层文档页与框内那一页之间的约定：iframe 的地址怎么拼、那三条 postMessage 长什么样。

两边都是站点编译的本仓代码，跑在**同一个源**里（框内那一页是站点自己的一条插件路由），所以这套
约定不需要跨源信任；每条消息仍要过 {@link isTrustedMessage} 那道校验 —— 为的是别人往这一页
postMessage 时不会被当成自家的，而不是为了防自己。

这一份只有**约定与形状**，没有 React、也没有 DOM；两条消息循环在 `frame-sync.ts`，框那一格与
它的共用版式在 `components/api-frame.tsx` 与 `components/api-frame.css`。
*/

/** 亮暗那一格的取值。形状与站点的开关相同，但**不引**它的类型：那条属性由外层送进来。 */
export type FrameColorMode = 'light' | 'dark';

export type FrameRouteMessage = { type: string; hash: string };
export type FrameReadyMessage = { type: string };
export type FrameModeMessage = {
  type: string;
  mode: FrameColorMode;
};

/** 一个命名空间对应的一份消息约定，见 {@link createFrameMessages}。 */
export type FrameMessages = {
  /** 外层 → 框内：外层地址栏里 `#` 那一段（选中了哪条接口）。 */
  route(hash: string): FrameRouteMessage;
  /** 框内 → 外层：框里那份文档起来了，向外层要地址与模式。 */
  ready(): FrameReadyMessage;
  /** 外层 → 框内：站点当前是亮色还是暗色。 */
  mode(mode: FrameColorMode): FrameModeMessage;
  /** 收到的数据是不是那一条接口地址（只看形状，来源由 {@link isTrustedMessage} 判）。 */
  isRoute(data: unknown): data is FrameRouteMessage;
  /** 收到的数据是不是「框里起来了」那一条（只看形状）。 */
  isReady(data: unknown): data is FrameReadyMessage;
  /** 收到的数据是不是「站点换亮暗了」那一条（只看形状）。 */
  isMode(data: unknown): data is FrameModeMessage;
};

/**
按命名空间造一份消息约定。

命名空间取用它的主题包的包名（例如 `@show-docs/docusaurus-theme-redoc`），三条 `type`
就是 `<命名空间>/route`、`/ready`、`/mode`。三条层各用各的命名空间，因此**不会**互相
认到对方的消息 —— 同一站点同时挂三份文档时，这一格是必需的。
*/
export function createFrameMessages(namespace: string): FrameMessages {
  const routeType = `${namespace}/route`;
  const readyType = `${namespace}/ready`;
  const modeType = `${namespace}/mode`;

  return {
    route: (hash) => ({ type: routeType, hash }),
    ready: () => ({ type: readyType }),
    mode: (mode) => ({ type: modeType, mode }),

    isReady: (data): data is FrameReadyMessage =>
      typeof data === 'object' &&
      data !== null &&
      (data as Partial<FrameReadyMessage>).type === readyType,

    // `hash` 只认空串与 `#` 开头的那些：拿到别的东西就当不是自家消息，
    // 而不是照原样往地址里塞。
    isRoute: (data): data is FrameRouteMessage => {
      if (typeof data !== 'object' || data === null) {
        return false;
      }
      const message = data as Partial<FrameRouteMessage>;
      return (
        message.type === routeType &&
        typeof message.hash === 'string' &&
        (message.hash === '' || message.hash.startsWith('#'))
      );
    },

    // 亮暗只认这两个值：地址栏与第三方脚本都能往这一页送形状对上的对象，取值不在这两格
    // 就不往 `<html>` 上写。
    isMode: (data): data is FrameModeMessage => {
      if (typeof data !== 'object' || data === null) {
        return false;
      }
      const message = data as Partial<FrameModeMessage>;
      return (
        message.type === modeType &&
        (message.mode === 'light' || message.mode === 'dark')
      );
    },
  };
}

/**
拼框内那一页的地址。

`specUrl` 编码进去，`hash` **不**放进去：iframe 的 `src` 因此只跟 frontmatter 走，服务端与
客户端算出的完全一样，两边不会在 `src` 这一格上对不上。深链那一段与亮暗模式都靠消息送，
见 {@link createFrameMessages}。
*/
export function frameViewSrc(options: {
  baseUrl: string;
  route: string;
  specParam: string;
  specUrl: string;
}): string {
  const query = new URLSearchParams({ [options.specParam]: options.specUrl });
  return `${options.baseUrl}${options.route}?${query}`;
}

/**
从框内那一页的地址里取出要渲染的 spec 地址。

只认能解析成 `http:` / `https:` 的：这一格来自地址栏，任何人都能手工拼一条
`/redoc-view?src=javascript:…` 那样的地址，而渲染器拿到的是「去取这个地址」的指令，
不该由本层替它把非 URL 的东西喂进去。解析结果恒为绝对地址，`/openapi.yaml` 这种相对写法
按 `base`（调用方给 `window.location.origin`）展开。
*/
export function specUrlFromSearch(
  search: string,
  base: string,
  specParam: string,
): string | undefined {
  const raw = new URLSearchParams(search).get(specParam);
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

/**
`iframe:` 那一层嵌**外部站点**时，frontmatter 那个值要落成的最终地址：`/` 打头补上 origin、
`?path=` 再解一层，两格都没有就原样。

`?path=` 由 `URLSearchParams` 自动解码，`src` 从 frontmatter 来、本来就是明文，所以收尾
**不再**对整串做二次解码 —— 旧写法那样会把地址里合法的 `%` 序列解坏（`a=%25` 变成 `a=%`、
`/a%2Fb` 变成 `/a/b`）。

`origin` 由调用方给（浏览器里就是 `window.location.origin`），与 {@link specUrlFromSearch}
同形状：这一份没有 DOM，配置期那条链路也引得到它。服务端渲染阶段拿不到窗口，调用方直接用
frontmatter 里的原值，不等这一步。
*/
export function externalFrameURL(options: {
  src: string;
  search: string;
  origin: string;
}): string {
  const path = new URLSearchParams(options.search).get('path') ?? '';

  const resolved = options.src.startsWith('/')
    ? new URL(options.src, options.origin).href
    : options.src;

  return path === '' ? resolved : new URL(path, resolved).href;
}
