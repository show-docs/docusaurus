import { describe, expect, it } from 'vitest';

import {
  normalizeConfig,
  PLUGIN_NAME,
} from '../packages/theme-avatar/src/config.mts';

/**
`packages/theme-avatar/src/config.mts`：站点那格插件选项判成浏览器要用的那一份。

这一份落在覆盖率红线上（各包 `src` 目录下那批 `.mts`），所以每一条报错、每一个缺省都得有用例走到。
它只管三件事：认得的格才读（写歪的格红在配置加载那一句）、形状判到底（串/布尔/数各有名字，
`null` 与数组不混称 object）、没写的格补上 `OPTION_SPEC` 里那一份缺省。

三格的缺省是空串而空串就是关闭：`userApi`（整层不开）、`menu.profileHref` 与 `menu.logoutHref`
（那一条菜单项不出）。这三格因此**没有**「能用的默认地址」—— 一个可安装的包不该带着
别人的工程那两个域名。
*/

describe('normalizeConfig：没写时补什么', () => {
  it('包名就是插件名那一格', () => {
    expect(PLUGIN_NAME).toBe('@show-docs/docusaurus-theme-avatar');
  });

  it('整格缺席 = 整份缺省，其中 `userApi` 是空串（= 这一层不启用）', () => {
    expect(normalizeConfig(undefined)).toEqual({
      enableHostname: '',
      userApi: '',
      anonymousName: '未命名',
      defaultAvatar: '',
      request: {
        debounceLeading: true,
        debounceWait: 300,
        throttleWait: 300,
        cacheKey: 'avatar-user',
      },
      fields: {
        id: 'id',
        name: 'name',
        displayName: 'displayName',
        avatar: 'avatar',
      },
      menu: {
        profileLabelPrefix: '用户：',
        profileHref: '',
        logoutText: '退出登录',
        logoutHref: '',
        logoutTarget: '_self',
      },
    });
  });

  it('空对象与缺席交回同一份', () => {
    expect(normalizeConfig({})).toEqual(normalizeConfig(undefined));
  });

  it('没有原型的对象也算普通对象（站点从别处传来的那份）', () => {
    expect(normalizeConfig(Object.create(null))).toEqual(
      normalizeConfig(undefined),
    );
  });

  it('组里只写一格，其余各格各自补缺省', () => {
    expect(normalizeConfig({ fields: { id: 'userId' } })).toMatchObject({
      fields: {
        id: 'userId',
        name: 'name',
        displayName: 'displayName',
        avatar: 'avatar',
      },
    });
  });

  it('写了 undefined 与没写是一回事（不会顶掉缺省）', () => {
    expect(
      normalizeConfig({ anonymousName: undefined, request: undefined }),
    ).toEqual(normalizeConfig(undefined));
  });

  it('站点写下的每一格照原样留下', () => {
    expect(
      normalizeConfig({
        userApi: '/api/me',
        enableHostname: 'intranet.example',
        defaultAvatar: '/img/anon.png',
        request: { debounceWait: 0, throttleWait: 0, debounceLeading: false },
        menu: {
          profileHref: '/me',
          logoutHref: '/logout',
          logoutTarget: '_blank',
        },
      }),
    ).toMatchObject({
      userApi: '/api/me',
      enableHostname: 'intranet.example',
      defaultAvatar: '/img/anon.png',
      request: { debounceWait: 0, throttleWait: 0, debounceLeading: false },
      menu: {
        profileHref: '/me',
        logoutHref: '/logout',
        logoutTarget: '_blank',
      },
    });
  });
});

describe('normalizeConfig：不认得的格', () => {
  it('顶层写歪一个键：点名那一格，并列出这一层认的名单', () => {
    expect(() => normalizeConfig({ userAPI: '/api/me' })).toThrow(
      /选项 里没有 `userAPI` 这一格/,
    );
  });

  it('Docusaurus 注入的 `id`：收下，但不交进浏览器那一份配置', () => {
    expect(normalizeConfig({ id: 'staff', userApi: '/api/me' })).toEqual({
      ...normalizeConfig({ userApi: '/api/me' }),
    });
  });

  it('`id` 写成了别的形状照样红', () => {
    expect(() => normalizeConfig({ id: 3 })).toThrow(
      /选项\.id 要一个字符串，拿到的是 number/,
    );
  });

  it('组里写歪一个键：点名到 `logoutURL`，名单是那一条组的', () => {
    expect(() => normalizeConfig({ menu: { logoutURL: '/logout' } })).toThrow(
      /选项\.menu 里没有 `logoutURL`.*只有 `profileLabelPrefix`/,
    );
  });

  it('不认得的键写了 undefined：等于没写，不红', () => {
    expect(() => normalizeConfig({ userAPI: undefined })).not.toThrow();
  });
});

describe('normalizeConfig：形状判到底', () => {
  it('选项整格不是对象：点名拿到的是哪一种', () => {
    expect(() => normalizeConfig('/api/me')).toThrow(
      /选项 要一个普通对象，拿到的是 string/,
    );
    expect(() => normalizeConfig(null)).toThrow(/拿到的是 null/);
    expect(() => normalizeConfig(['/api/me'])).toThrow(/拿到的是 数组/);
  });

  it('组那一格给了数组或数字：要普通对象', () => {
    expect(() => normalizeConfig({ menu: [] })).toThrow(
      /选项\.menu 要一个普通对象，拿到的是 数组/,
    );
    expect(() => normalizeConfig({ request: 3 })).toThrow(
      /选项\.request 要一个普通对象，拿到的是 number/,
    );
  });

  it('有原型的对象不算普通对象（Date 那种）', () => {
    expect(() => normalizeConfig({ fields: new Date() })).toThrow(
      /选项\.fields 要一个普通对象，拿到的是 object/,
    );
  });

  it('文本那一格不是串：点名是哪一格、拿到的是哪一种', () => {
    expect(() => normalizeConfig({ userApi: 42 })).toThrow(
      /选项\.userApi 要一个字符串，拿到的是 number/,
    );
    expect(() => normalizeConfig({ enableHostname: null })).toThrow(
      /选项\.enableHostname 要一个字符串，拿到的是 null/,
    );
  });

  it('该有内容的那几格不给空串，并说清要关闭就别写它', () => {
    expect(() => normalizeConfig({ anonymousName: '' })).toThrow(
      /选项\.anonymousName 不能是空串/,
    );
    expect(() => normalizeConfig({ fields: { id: '' } })).toThrow(
      /选项\.fields\.id 不能是空串/,
    );
    expect(() => normalizeConfig({ request: { cacheKey: '' } })).toThrow(
      /选项\.request\.cacheKey 不能是空串/,
    );
  });

  it('布尔那一格只认真布尔值', () => {
    expect(() =>
      normalizeConfig({ request: { debounceLeading: 'true' } }),
    ).toThrow(/选项\.request\.debounceLeading 要一个布尔值，拿到的是 string/);
  });

  it('数字那一格不认串、NaN 与 Infinity（三种都算「不是一个数」）', () => {
    expect(() => normalizeConfig({ request: { debounceWait: '300' } })).toThrow(
      /选项\.request\.debounceWait 要一个数字，拿到的是 string/,
    );
    expect(() => normalizeConfig({ request: { throttleWait: NaN } })).toThrow(
      /选项\.request\.throttleWait 要一个数字/,
    );
    expect(() =>
      normalizeConfig({ request: { debounceWait: Infinity } }),
    ).toThrow(/要一个数字/);
  });

  it('毫秒数不接受负数', () => {
    expect(() => normalizeConfig({ request: { debounceWait: -1 } })).toThrow(
      /选项\.request\.debounceWait 要一个非负的数（毫秒数），拿到的是 -1/,
    );
  });

  it('零是合法的毫秒数（关掉防抖与节流）', () => {
    expect(normalizeConfig({ request: { debounceWait: 0 } })).toMatchObject({
      request: { debounceWait: 0 },
    });
  });
});
