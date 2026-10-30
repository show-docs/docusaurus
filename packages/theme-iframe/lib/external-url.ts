/**
`iframe:` 那一格嵌**外部站点**时，框的地址怎么定。

这里是本层唯一还剩的公共判据：框里是跨源的别人那份文档，没有 component-page 那套同源握手，
地址只能在父文档这一侧算完。协议口径（https 页面上的 `http:` 升成 https，只升不降）住在
`@show-docs/docusaurus-theme-component-page/lib/frame-url.ts`，本层不抄第二遍。

这一份没有 DOM、也没有 React：浏览器那一遍由 `theme/ExternalFrame` 引，单测在 Node 里引同一份。
*/

import {
  upgraded,
  upgradeUrl,
} from '@show-docs/docusaurus-theme-component-page/lib/frame-url.ts';

/**
frontmatter 那个值要落成的最终地址：`/` 打头补上 origin、`?path=` 再解一层，
两格都没有就原样。

`?path=` 由 `URLSearchParams` 自动解码，`src` 从 frontmatter 来、本来就是明文，所以收尾
**不再**对整串做二次解码 —— 旧写法那样会把地址里合法的 `%` 序列解坏（`a=%25` 变成 `a=%`、
`/a%2Fb` 变成 `/a/b`）。

`origin` 由调用方给（浏览器里就是 `window.location.origin`）：这一份没有 DOM，配置期那条链路
也引得到它。绝对 `http:` 地址按 `upgraded` 跟着页面升成 https —— `iframe:` 那一格也是子资源，
https 页面上它一样必被拦。

`src` 是相对写法时 `?path=` 展开不了（基准就是那条地址本身），这时交回 `src` 而不是抛：
`search` 由别人拼得来，任何人都能写一条带 `?path=…` 的链接打开这一页，一条拼错的链接不该把
整页弄崩。
*/
export function externalFrameURL(options: {
  src: string;
  search: string;
  origin: string;
}): string {
  const page = new URL(options.origin);
  const path = new URLSearchParams(options.search).get('path') ?? '';

  const resolved = options.src.startsWith('/')
    ? new URL(options.src, page).href
    : upgradeUrl(options.src, page);

  if (path === '') {
    return resolved;
  }

  try {
    return upgraded(new URL(path, resolved), page);
  } catch {
    // 只有 `resolved` 本身不是绝对地址时才走到这里（`path` 是绝对写法时基准用不上，不会抛）。
    return resolved;
  }
}

/**
服务端渲染那一遍替代 {@link externalFrameURL} 的一条：构建期拿不到 `window`，只知道站点
自己的协议（`siteConfig.url` 的 origin）。

只动**绝对** `http:` 地址的协议，相对写法（`/404`、`?path=` 那些）一个字不碰 —— 构建产物里
把相对地址钉死成某个 origin，会让本地 `serve` 与 e2e 上同一个框指向站点配置里的域名。
这一条存在是因为那个框先加载、后由 React 改 `src`：只在浏览器里归一的话，线上首屏还会先
撞一次混合内容。
*/
export function httpsOnHttpsSite(value: string, siteUrl: string): string {
  return upgradeUrl(value, new URL(siteUrl));
}
