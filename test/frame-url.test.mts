import { describe, expect, it } from 'vitest';

import {
  frameRouteUrl,
  httpUrlOf,
  upgraded,
  upgradeUrl,
} from '../packages/theme-component-page/lib/frame-url.ts';

/**
## 框内那份文档的地址，与一条外部地址在这一页上能不能用

`frameRouteUrl()` 只管**自己站点**里那条路由（框里那份文档跟站点同源，永远不需要升协议）；
`upgraded()` / `upgradeUrl()` / `httpUrlOf()` 管**别人的**地址（`?src=` 那种从地址里拼出来的
取数指令，跨源就可能跨协议）。

两组各钉一件事：前者钉「服务端与客户端算出同一个字符串」—— 那个 `<iframe>` 的 `src` 一旦两边
不一样，构建产物里就先加载错的、再由 React 改回来，中间那一次加载就是白撞；后者钉混合内容那条
口径（https 页面上的 http 一律升、只升不降、非 URL 的一律不收）。真实浏览器里的拦截归 e2e。
*/

describe('frameRouteUrl：框内那份文档在站点里的地址', () => {
  it('地址只有 baseUrl + 路由名，不写查询参数（那一份数据由消息送）', () => {
    const src = frameRouteUrl({
      baseUrl: '/',
      route: '__component-frame',
      trailingSlash: true,
    });

    expect(src).toBe('/__component-frame/');
    expect(src).not.toContain('?');
  });

  it('尾斜杠：没配与配了 true 都补上，false 保持无斜杠', () => {
    // `false` 时产物是 `{route}.html`，无斜杠才是那个文件本身；其余情况产物是
    // `{route}/index.html`，必须补上斜杠 —— 少了它要先吃部署侧那条「补斜杠」的 301，
    // 而那条 301 的协议跟着部署侧走，反向代理后面常写成 http，https 页面上这一跳
    // 会被按混合内容拦掉，框直接空白。
    const withoutSlash = frameRouteUrl({
      baseUrl: '/',
      route: '__component-frame',
      trailingSlash: false,
    });
    const withSlash = frameRouteUrl({
      baseUrl: '/',
      route: '__component-frame',
      trailingSlash: true,
    });
    const notConfigured = frameRouteUrl({
      baseUrl: '/',
      route: '__component-frame',
      trailingSlash: undefined,
    });

    expect(withoutSlash).toBe('/__component-frame');
    expect(withSlash).toBe('/__component-frame/');
    expect(notConfigured).toBe(withSlash);
  });

  it('站点挂在子路径下时整条跟着 baseUrl：这一份只拼接，不动斜杠', () => {
    // baseUrl 末尾那条斜杠是 Docusaurus 自己保证的（`siteConfig.baseUrl` 总是带），
    // 这里替它补第二遍会变成 `//__component-frame//`，注册侧用的却是 `src/frame-route.ts`
    // 里那条「只留一格」的写法 —— 两边形状不同，各自的职责写在各份头上。
    expect(
      frameRouteUrl({
        baseUrl: '/docs/',
        route: '__component-frame',
        trailingSlash: undefined,
      }),
    ).toBe('/docs/__component-frame/');
  });
});

describe('upgraded：https 页面上的 http 地址只升不降', () => {
  const httpsPage = new URL('https://open.example.com/api/spec');
  const httpPage = new URL('http://open.example.com/api/spec');

  it('https 页面上的 http 地址换掉协议，其余一个字不动（域名、路径、查询、hash、端口）', () => {
    expect(
      upgraded(new URL('http://cdn.example.com/a/b.yaml?rev=3#sec'), httpsPage),
    ).toBe('https://cdn.example.com/a/b.yaml?rev=3#sec');
    expect(
      upgraded(new URL('http://api.example.com:8080/spec'), httpsPage),
    ).toBe('https://api.example.com:8080/spec');
  });

  it('http 页面上的地址一概不碰（只升不降）', () => {
    expect(upgraded(new URL('http://cdn.example.com/a.yaml'), httpPage)).toBe(
      'http://cdn.example.com/a.yaml',
    );
    expect(upgraded(new URL('https://cdn.example.com/a.yaml'), httpPage)).toBe(
      'https://cdn.example.com/a.yaml',
    );
  });

  it('https 页面上的 https 地址原样', () => {
    expect(upgraded(new URL('https://cdn.example.com/a.yaml'), httpsPage)).toBe(
      'https://cdn.example.com/a.yaml',
    );
  });

  it('是纯函数：交进去那条 URL 不会被改协议', () => {
    const insecure = new URL('http://cdn.example.com/a.yaml');
    upgraded(insecure, httpsPage);
    expect(insecure.protocol).toBe('http:');
  });
});

describe('upgradeUrl：解析不了的交给调用方自己展开', () => {
  it('绝对写法按页面协议走', () => {
    expect(
      upgradeUrl(
        'http://cdn.example.com/a.yaml',
        new URL('https://p.example.com/'),
      ),
    ).toBe('https://cdn.example.com/a.yaml');
  });

  it('相对写法（`handbook/` 那种）一个字不碰', () => {
    // 展开的基准各家不一：框里那份文档按自己的 origin，`iframe:` 那条按当前页路径，
    // 所以这里不替调用方决定基准，只保证「不把相对写法误当绝对的去改协议」。
    const page = new URL('https://p.example.com/');
    expect(upgradeUrl('handbook/a.yaml', page)).toBe('handbook/a.yaml');
    expect(upgradeUrl('/specs/a.yaml', page)).toBe('/specs/a.yaml');
  });

  it('http 页面上的 http 地址原样（升不升只看页面）', () => {
    expect(
      upgradeUrl(
        'http://cdn.example.com/a.yaml',
        new URL('http://p.example.com/'),
      ),
    ).toBe('http://cdn.example.com/a.yaml');
  });
});

describe('httpUrlOf：只收能解析成 http / https 的那条地址', () => {
  const base = 'https://p.example.com/docs/';

  it('不是字符串、或是空串，都不算一条地址', () => {
    for (const value of [undefined, null, 42, {}, [], '']) {
      expect(httpUrlOf(value, base)).toBeUndefined();
    }
  });

  it('绝对写法原样收下，http 的按页面升成 https', () => {
    expect(httpUrlOf('https://cdn.example.com/a.yaml', base)).toBe(
      'https://cdn.example.com/a.yaml',
    );
    expect(httpUrlOf('http://cdn.example.com/a.yaml', base)).toBe(
      'https://cdn.example.com/a.yaml',
    );
  });

  it('相对写法按 base 展开（`?path=` 那一条的来源）', () => {
    expect(httpUrlOf('/specs/a.yaml', base)).toBe(
      'https://p.example.com/specs/a.yaml',
    );
    expect(httpUrlOf('a.yaml', base)).toBe('https://p.example.com/docs/a.yaml');
  });

  it('非 URL 的那些指令一律不收：`javascript:` 与 `data:` 都交回 undefined', () => {
    // 框里那份文档是条公开地址，任何人都能手工拼一条带 `?src=javascript:…` 的链接打开它；
    // 组件拿到的是「去取这个地址」的指令，本层不替它把非 URL 的东西喂进去。
    expect(httpUrlOf('javascript:alert(1)', base)).toBeUndefined();
    expect(httpUrlOf('data:text/plain,hi', base)).toBeUndefined();
  });

  it('base 本身不是合法 URL 时不收，而不是抛', () => {
    expect(httpUrlOf('/specs/a.yaml', 'not a url')).toBeUndefined();
  });

  it('http 页面上的 http 地址也照样收（协议口径与 upgraded 同一条）', () => {
    expect(
      httpUrlOf('http://cdn.example.com/a.yaml', 'http://p.example.com/docs/'),
    ).toBe('http://cdn.example.com/a.yaml');
  });
});
