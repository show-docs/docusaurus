/**
框内那条页面的地址怎么拼，以及一条地址在这份文档里能不能用。

两份都是纯函数、不碰 DOM：`../components/component-frame` 用它算那个 `<iframe>` 的 `src`（服务端与
客户端算出完全一样的字符串，两边不会在 `src` 这一格上对不上），各组件包用 {@link upgradeUrl}
处理自己那份要取的外部地址，`theme-iframe` 的 `lib/external-url.ts` 也引它同一句。
*/

/**
拼框内那一页的地址。

路由里**不写查询参数**：那一份数据（哪个组件、哪一页的 frontmatter）由 `frame-messages.ts`
那套约定送进来，所以这个地址只跟站点走，服务端与客户端算出的完全一样。深链那一段与亮暗模式
也都靠消息送，见 `frame-sync.tsx`。

`trailingSlash` 原样接 `siteConfig.trailingSlash`，决定路径末尾那条斜杠：`false` 时产物是
`{route}.html`，地址保持无斜杠；其余情况（`true` 或没配）产物是 `{route}/index.html`，地址
**补上**尾斜杠 —— 直接请求文件本身，不经过静态服务器那条「补斜杠」的 301。这一条不是洁癖：
那 301 由部署侧生成，协议跟着部署侧走，反向代理后面常写成 `http://`，https 页面上这一跳
会被浏览器按混合内容拦掉，框直接空白（实测 `open.test.xinxiangsui.com.cn` 上就是这样）。
*/
export function frameRouteUrl(options: {
  baseUrl: string;
  route: string;
  trailingSlash: boolean | undefined;
}): string {
  const path =
    options.trailingSlash === false ? options.route : `${options.route}/`;

  return `${options.baseUrl}${path}`;
}

/**
https 页面上的 http 地址，把协议升成 https。

混合内容在 https 页面上是**必被拦**的一格（fetch / XHR / iframe 都拦）：不升，那一格只能是
空的；升了，对方也支持 https 时就正常取到。等价于浏览器 `upgrade-insecure-requests` 的口径 ——
域名、路径、查询与非默认端口一概不动，**只升不降**（http 页面上的 https 地址原样）。
*/
export function upgraded(url: URL, page: URL): string {
  if (page.protocol !== 'https:' || url.protocol !== 'http:') {
    return url.href;
  }

  // 复制一份再改协议：这一条是纯函数，改参数上的属性既不必要、也会被 lint 拦。
  const secure = new URL(url.href);
  secure.protocol = 'https:';

  return secure.href;
}

/**
一条地址在这一页上能不能原样用：解析得了就按 {@link upgraded} 跟着页面走，解析不了
（`handbook/` 这种相对写法）原样交回。

这一格不替调用方展开相对地址 —— 展开的基准各家不一（框里那份文档按自己的 origin，
`iframe:` 那条按当前页路径）。协议口径只有一条：这一份文档是 https 的，去取一个 http 的
外部地址必被浏览器按混合内容拦掉。
*/
export function upgradeUrl(value: string, page: URL): string {
  try {
    return upgraded(new URL(value), page);
  } catch {
    // `value` 本身不是绝对地址时才走到这里（相对写法交给调用方自己展开）。
    return value;
  }
}

/**
只认能解析成 `http:` / `https:` 的那条地址：绝对写法按 {@link upgraded} 跟着页面走，
相对写法与非 URL 的那些（`javascript:` 那种）交回 `undefined`。

这一格的用处是「把别人从地址里拼出来的一条指令变成一句能执行的话」：框里那份文档是条公开地址，
任何人都能手工拼一条带 `?src=javascript:…` 的链接打开它，而组件拿到的是「去取这个地址」的
指令，不该由本层替它把非 URL 的东西喂进去。
*/
export function httpUrlOf(value: unknown, base: string): string | undefined {
  if (typeof value !== 'string' || value === '') {
    return undefined;
  }

  try {
    const page = new URL(base);
    const url = new URL(value, page);

    return url.protocol === 'http:' || url.protocol === 'https:'
      ? upgraded(url, page)
      : undefined;
  } catch {
    // `base` 本身不是合法 URL 时才走到这里（拼错的相对地址在 `new URL` 那一格抛）。
    return undefined;
  }
}
