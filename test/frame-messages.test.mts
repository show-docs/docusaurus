import { describe, expect, it } from 'vitest';

import { apiFrameMessages } from '../packages/theme-iframe/lib/api-frame-messages.ts';
import {
  createFrameMessages,
  externalFrameURL,
  frameViewSrc,
  specUrlFromSearch,
} from '../packages/theme-iframe/lib/frame-messages.ts';

const REDOC = '@show-docs/docusaurus-theme-redoc';
const SCALAR = '@show-docs/docusaurus-theme-scalar';

describe('createFrameMessages：三条消息的形状与接受规则', () => {
  const messages = createFrameMessages(REDOC);
  const other = createFrameMessages(SCALAR);

  it('type 由命名空间拼出，三条各归各的', () => {
    expect(messages.route('#/paths/users')).toEqual({
      type: `${REDOC}/route`,
      hash: '#/paths/users',
    });
    expect(messages.ready()).toEqual({ type: `${REDOC}/ready` });
    expect(messages.mode('dark')).toEqual({
      type: `${REDOC}/mode`,
      mode: 'dark',
    });
  });

  it('命名空间不同的两份互不认', () => {
    expect(other.isRoute(messages.route('#x'))).toBe(false);
    expect(other.isReady(messages.ready())).toBe(false);
    expect(other.isMode(messages.mode('dark'))).toBe(false);
  });

  it('isRoute 只认空串与 # 打头的 hash，其余形状一律不算', () => {
    expect(messages.isRoute({ type: `${REDOC}/route`, hash: '' })).toBe(true);
    expect(messages.isRoute({ type: `${REDOC}/route`, hash: '#/x' })).toBe(
      true,
    );
    // 不带 # 的字符串不往地址里塞
    expect(messages.isRoute({ type: `${REDOC}/route`, hash: 'x' })).toBe(false);
    expect(messages.isRoute({ type: `${REDOC}/route` })).toBe(false);
    expect(messages.isRoute({ type: 'other', hash: '#x' })).toBe(false);
    expect(messages.isRoute(null)).toBe(false);
    expect(messages.isRoute('route')).toBe(false);
    expect(messages.isRoute([])).toBe(false);
  });

  it('isMode 只认 light / dark 两个值', () => {
    expect(messages.isMode({ type: `${REDOC}/mode`, mode: 'light' })).toBe(
      true,
    );
    expect(messages.isMode({ type: `${REDOC}/mode`, mode: 'dark' })).toBe(true);
    // 取值不在这两格就不往 <html> 上写 —— 地址栏与第三方脚本都能送形状对上的对象
    expect(messages.isMode({ type: `${REDOC}/mode`, mode: 'auto' })).toBe(
      false,
    );
    expect(messages.isMode({ type: `${REDOC}/mode` })).toBe(false);
    expect(messages.isMode({ type: `${REDOC}/ready` })).toBe(false);
    // 连对象都不是的（第三方脚本与手工拼的地址栏都能送进来）走的是同一句拒绝
    expect(messages.isMode(null)).toBe(false);
    expect(messages.isMode(undefined)).toBe(false);
    expect(messages.isMode('mode')).toBe(false);
    expect(messages.isMode(0)).toBe(false);
  });

  it('isReady 只看 type 这一格', () => {
    expect(messages.isReady({ type: `${REDOC}/ready` })).toBe(true);
    expect(messages.isReady({ type: `${REDOC}/ready`, extra: 1 })).toBe(true);
    expect(messages.isReady({ type: `${REDOC}/mode`, mode: 'dark' })).toBe(
      false,
    );
  });
});

describe('apiFrameMessages：注册表那条层的约定带缓存', () => {
  it('同一命名空间反复取是同一个引用，不同命名空间各一份', () => {
    const direct = createFrameMessages(REDOC);
    // 两条 hook 把它放在 effect 依赖里：引用换了就多一轮监听器拆装
    expect(apiFrameMessages(REDOC)).toBe(apiFrameMessages(REDOC));
    expect(apiFrameMessages(REDOC)).not.toBe(apiFrameMessages(SCALAR));
    expect(apiFrameMessages(REDOC).ready()).toEqual(direct.ready());
    expect(apiFrameMessages(SCALAR).isMode(direct.mode('dark'))).toBe(false);
  });
});

describe('frameViewSrc / specUrlFromSearch：框内地址的拼与拆', () => {
  it('spec 编码进查询参数，hash 不进去（服务端与客户端算出同一个字符串）', () => {
    const src = frameViewSrc({
      baseUrl: '/',
      route: 'scalar-view',
      specParam: 'src',
      specUrl: '/openapi.yaml',
    });
    expect(src).toBe('/scalar-view?src=%2Fopenapi.yaml');
    expect(src).not.toContain('#');
  });

  it('拼出去的值能原样拆回来', () => {
    const src = frameViewSrc({
      baseUrl: '/',
      route: 'redoc-view',
      specParam: 'src',
      specUrl: '/openapi.yaml',
    });
    const query = src.slice(src.indexOf('?'));
    expect(specUrlFromSearch(query, 'https://example.com', 'src')).toBe(
      'https://example.com/openapi.yaml',
    );
  });

  it('只认能解析成 http: / https: 的地址， javascript: 这类一律不算', () => {
    expect(
      specUrlFromSearch(
        '?src=javascript:alert(1)',
        'https://example.com',
        'src',
      ),
    ).toBeUndefined();
    expect(
      specUrlFromSearch('?src=data:text/html,x', 'https://example.com', 'src'),
    ).toBeUndefined();
  });

  it('缺参数、换错参数名、base 本身不合法，都交回 undefined 而不是抛', () => {
    expect(specUrlFromSearch('', 'https://example.com', 'src')).toBeUndefined();
    expect(
      specUrlFromSearch('?url=/openapi.yaml', 'https://example.com', 'src'),
    ).toBeUndefined();
    expect(
      specUrlFromSearch('?src=/openapi.yaml', 'not-a-url', 'src'),
    ).toBeUndefined();
  });
});

describe('externalFrameURL：iframe: 那一层的地址三步', () => {
  const origin = 'https://docs.example.com';

  it('/ 打头的本站写法补上 origin，绝对写法原样', () => {
    expect(externalFrameURL({ src: '/404', search: '', origin })).toBe(
      'https://docs.example.com/404',
    );
    expect(
      externalFrameURL({ src: 'https://a.test/x', search: '', origin }),
    ).toBe('https://a.test/x');
  });

  it('带 ?path= 时在 src 之下再解一层', () => {
    expect(
      externalFrameURL({ src: '/base', search: '?path=/deep', origin }),
    ).toBe('https://docs.example.com/deep');
    expect(
      externalFrameURL({
        src: 'https://a.test/base/',
        search: '?path=deep',
        origin,
      }),
    ).toBe('https://a.test/base/deep');
  });

  it('只对 ?path= 那一段解码，不对整串二次解码（地址里合法的 % 序列不被解坏）', () => {
    expect(externalFrameURL({ src: '/search?a=%25', search: '', origin })).toBe(
      'https://docs.example.com/search?a=%25',
    );
    expect(externalFrameURL({ src: '/a%2Fb', search: '', origin })).toBe(
      'https://docs.example.com/a%2Fb',
    );
    // 这一格只有 ?path= 会被解 —— 它是查询参数，本来就该是编码形式
    expect(
      externalFrameURL({ src: '/base', search: '?path=%2Fa%2Fb', origin }),
    ).toBe('https://docs.example.com/a/b');
  });

  it('path 是绝对地址时直接换成它，src 不参与', () => {
    expect(
      externalFrameURL({
        src: '/base',
        search: '?path=https%3A%2F%2Fb.test%2F',
        origin,
      }),
    ).toBe('https://b.test/');
  });
});
