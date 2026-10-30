import { describe, expect, it } from 'vitest';

import {
  externalFrameURL,
  httpsOnHttpsSite,
} from '../packages/theme-iframe/lib/external-url.ts';

/**
## `iframe:` 那一格嵌外部站点时，框的地址

`theme-iframe` 收缩成「只嵌 frontmatter 里那条 URL」之后，这一份是它唯一还剩的公共判据：
框里是跨源的别人那份文档，没有同源握手，地址只能在父文档这一侧一次算完。

协议那条口径（只升不降）住在 component-page，本层引它同一句，所以这里只量**这一层自己**
那三件事：`/` 打头补 origin、`?path=` 再解一层、以及这两格都没有时原样交回。
*/

describe('externalFrameURL：frontmatter 那个值落成的最终地址', () => {
  const https = 'https://docs.example.com';

  it('/ 打头的写法补上当前 origin：这一页的站点，不是站点里这一页的路径', () => {
    expect(externalFrameURL({ src: '/404', search: '', origin: https })).toBe(
      `${https}/404`,
    );
  });

  it('绝对写法按页面协议走：https 页面上的 http 升，http 页面一个字不碰', () => {
    expect(
      externalFrameURL({
        src: 'http://cdn.example.com/a.yaml',
        search: '',
        origin: https,
      }),
    ).toBe('https://cdn.example.com/a.yaml');
    expect(
      externalFrameURL({
        src: 'http://cdn.example.com/a.yaml',
        search: '',
        origin: 'http://docs.example.com',
      }),
    ).toBe('http://cdn.example.com/a.yaml');
  });

  it('相对写法（`handbook/a.yaml`）原样交回，交给浏览器按当前页路径解', () => {
    // 展开的基准是「当前这一页」，而这一份没有 DOM、拿不到当前路径，所以不替它展开。
    expect(
      externalFrameURL({ src: 'handbook/a.yaml', search: '', origin: https }),
    ).toBe('handbook/a.yaml');
  });

  it('?path= 绝对写法直接换掉整条地址（基准用不上）', () => {
    expect(
      externalFrameURL({
        src: '/404',
        search: '?path=https%3A%2F%2Fother.example.com%2Fspec.yaml',
        origin: https,
      }),
    ).toBe('https://other.example.com/spec.yaml');
  });

  it('?path= 相对写法按 src 那条地址展开，再跟着页面协议', () => {
    expect(
      externalFrameURL({
        src: 'https://cdn.example.com/specs/a.yaml',
        search: '?path=b.yaml',
        origin: https,
      }),
    ).toBe('https://cdn.example.com/specs/b.yaml');
    expect(
      externalFrameURL({
        src: 'http://cdn.example.com/specs/a.yaml',
        search: '?path=%2Fspecs%2Fc.yaml',
        origin: https,
      }),
    ).toBe('https://cdn.example.com/specs/c.yaml');
  });

  it('?path= 只解一次码：src 里合法的 % 序列不会被二次解坏', () => {
    // `URLSearchParams` 已经把 `?path=` 解好了；`src` 从 frontmatter 来、本来就是明文，
    // 收尾再对整串 `decodeURIComponent` 会把 `a=%25` 变成 `a=%`、`/a%2Fb` 变成 `/a/b`。
    expect(
      externalFrameURL({
        src: 'https://cdn.example.com/a.yaml?ref=main%2Fdocs&v=%257',
        search: '',
        origin: https,
      }),
    ).toBe('https://cdn.example.com/a.yaml?ref=main%2Fdocs&v=%257');
  });

  it('src 是相对写法时 ?path= 展开不了：交回 src，而不是把整页弄崩', () => {
    // `search` 由别人拼得来，任何人都能写一条带 `?path=…` 的链接打开这一页。
    expect(
      externalFrameURL({
        src: 'handbook/a.yaml',
        search: '?path=b.yaml',
        origin: https,
      }),
    ).toBe('handbook/a.yaml');
  });

  it('?path= 之外的那些查询参数一概不看', () => {
    expect(
      externalFrameURL({
        src: '/404',
        search: '?other=x&path=',
        origin: https,
      }),
    ).toBe(`${https}/404`);
  });
});

describe('httpsOnHttpsSite：服务端那一遍只按站点协议归一', () => {
  const httpsSite = 'https://docs.example.com/';

  it('绝对 http 地址在 https 站点上升级（框先加载、后由 React 改 src）', () => {
    expect(httpsOnHttpsSite('http://cdn.example.com/a.yaml', httpsSite)).toBe(
      'https://cdn.example.com/a.yaml',
    );
  });

  it('相对写法一个字不碰：构建产物里不把它钉死成站点配置里的域名', () => {
    expect(httpsOnHttpsSite('/404', httpsSite)).toBe('/404');
    expect(httpsOnHttpsSite('handbook/a.yaml', httpsSite)).toBe(
      'handbook/a.yaml',
    );
  });

  it('http 站点上的 https 地址原样（只升不降）', () => {
    expect(
      httpsOnHttpsSite(
        'https://cdn.example.com/a.yaml',
        'http://docs.example.com/',
      ),
    ).toBe('https://cdn.example.com/a.yaml');
  });
});
