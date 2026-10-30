import { describe, expect, it } from 'vitest';

import {
  FRAME_HASH_TYPE,
  FRAME_INIT_TYPE,
  FRAME_MODE_TYPE,
  FRAME_READY_TYPE,
  frameDataError,
  frameInitPayload,
  frameMessages,
  isFrameHash,
  isFrameInit,
  isFrameMode,
  isFrameReady,
} from '../packages/theme-component-page/lib/frame-messages.ts';

/**
## 那四条消息与「送得出去」的那道门槛

文档页与框内那份独立文档之间只有一套消息名（这一族共用一条框内路由，组件由数据里的登记名区分），
所以这里的判据是**通道级**的：形状对不对、取值在不在那两格里。真正的「是不是自家窗口发的」归
`frame-sync.tsx` 的 `isTrustedMessage`，两边各管一段：这一份管收进来之后能不能直接用。

**数据必须是 JSON**：`frameDataError()` 那条走到底的判据与配置期 `src/config.mts` 对 `props`
那一格做的是同一件事，只是这里读的是某一页的 frontmatter —— 配置期看不到它。
*/

describe('frameMessages：四条消息的形状', () => {
  it('type 都挂在同一套约定下面，各自的载荷各占一格', () => {
    expect(frameMessages.ready()).toEqual({ type: FRAME_READY_TYPE });
    expect(frameMessages.init('scalar', { value: 1 })).toEqual({
      type: FRAME_INIT_TYPE,
      componentId: 'scalar',
      data: { value: 1 },
    });
    expect(frameMessages.mode('dark')).toEqual({
      type: FRAME_MODE_TYPE,
      mode: 'dark',
    });
    expect(frameMessages.hash('#/paths/users')).toEqual({
      type: FRAME_HASH_TYPE,
      hash: '#/paths/users',
    });
  });

  it('那一份数据原样带走（外层已经并好，这里不做第二次）', () => {
    const data = { frontMatter: { title: 'x' }, value: true, height: '480' };

    expect(frameMessages.init('widget', data).data).toBe(data);
  });
});

describe('isFrameReady：只看 type 这一格', () => {
  it('自家的算，别的一律不算', () => {
    expect(isFrameReady({ type: FRAME_READY_TYPE })).toBe(true);
    expect(isFrameReady({ type: FRAME_READY_TYPE, extra: 1 })).toBe(true);
    expect(isFrameReady(frameMessages.mode('dark'))).toBe(false);
    expect(isFrameReady(null)).toBe(false);
    expect(isFrameReady(undefined)).toBe(false);
    expect(isFrameReady('ready')).toBe(false);
    expect(isFrameReady(0)).toBe(false);
  });
});

describe('isFrameInit：登记名与那一份数据要一起认', () => {
  it('一条真的 init 认下来', () => {
    expect(isFrameInit(frameMessages.init('scalar', { value: 1 }))).toBe(true);
    expect(
      isFrameInit({ type: FRAME_INIT_TYPE, componentId: 'a', data: {} }),
    ).toBe(true);
  });

  it('登记名缺席、空串或不是串都不算', () => {
    for (const componentId of [undefined, '', 42, {}, null]) {
      expect(
        isFrameInit({ type: FRAME_INIT_TYPE, componentId, data: {} }),
      ).toBe(false);
    }
  });

  it('那一份数据缺席、null 或数组都不算（框里拿到那种东西只会渲染成空白）', () => {
    for (const data of [undefined, null, 42, ['a']]) {
      expect(
        isFrameInit({ type: FRAME_INIT_TYPE, componentId: 'a', data }),
      ).toBe(false);
    }
  });

  it('type 对不上时一个字都不看（第三方脚本能拼出内容，拼不出这套约定）', () => {
    expect(
      isFrameInit({ type: 'other/init', componentId: 'a', data: {} }),
    ).toBe(false);
    expect(isFrameInit(null)).toBe(false);
    expect(isFrameInit('init')).toBe(false);
    expect(isFrameInit([])).toBe(false);
  });
});

describe('isFrameMode：亮暗只认那两个值', () => {
  it('light / dark 各自认下', () => {
    expect(isFrameMode({ type: FRAME_MODE_TYPE, mode: 'light' })).toBe(true);
    expect(isFrameMode({ type: FRAME_MODE_TYPE, mode: 'dark' })).toBe(true);
  });

  it('取值不在这两格就不往这份文档上写 —— 地址栏与第三方脚本都能送形状对上的对象', () => {
    expect(isFrameMode({ type: FRAME_MODE_TYPE, mode: 'auto' })).toBe(false);
    expect(isFrameMode({ type: FRAME_MODE_TYPE })).toBe(false);
    expect(isFrameMode({ type: FRAME_MODE_TYPE, mode: true })).toBe(false);
    expect(isFrameMode({ type: FRAME_READY_TYPE })).toBe(false);
    expect(isFrameMode(null)).toBe(false);
    expect(isFrameMode(undefined)).toBe(false);
    expect(isFrameMode('mode')).toBe(false);
    expect(isFrameMode(0)).toBe(false);
  });
});

describe('isFrameHash：只认空串与 # 打头的那些', () => {
  it('空串（「把 # 整段去掉」）与带 # 的都算', () => {
    expect(isFrameHash({ type: FRAME_HASH_TYPE, hash: '' })).toBe(true);
    expect(isFrameHash({ type: FRAME_HASH_TYPE, hash: '#/x' })).toBe(true);
  });

  it('不带 # 的字符串不往地址里塞，别的形状同样不算自家消息', () => {
    expect(isFrameHash({ type: FRAME_HASH_TYPE, hash: 'x' })).toBe(false);
    expect(isFrameHash({ type: FRAME_HASH_TYPE })).toBe(false);
    expect(isFrameHash({ type: FRAME_HASH_TYPE, hash: 42 })).toBe(false);
    expect(isFrameHash({ type: 'other/hash', hash: '#x' })).toBe(false);
    expect(isFrameHash(null)).toBe(false);
    expect(isFrameHash('hash')).toBe(false);
    expect(isFrameHash([])).toBe(false);
  });
});

describe('frameInitPayload：并好的那一份，与 page 那一侧同次序', () => {
  it('静态入参垫底，本页那两格盖在上面（配置盖不掉本页事实）', () => {
    expect(
      frameInitPayload('/openapi.yaml', { title: 'x' }, { height: '480' }),
    ).toEqual({
      height: '480',
      frontMatter: { title: 'x' },
      value: '/openapi.yaml',
    });
  });

  it('同名时本页那两格赢：那一格是这一页的事实，配置写的是每一页共用的入参', () => {
    const payload = frameInitPayload(
      true,
      { title: 'x' },
      {
        frontMatter: '假的',
        value: '假的',
      },
    );

    expect(payload.frontMatter).toEqual({ title: 'x' });
    expect(payload.value).toBe(true);
  });

  it('这一页没有 frontmatter 时交一个空对象，而不是 undefined', () => {
    expect(frameInitPayload(true, undefined, undefined)).toEqual({
      frontMatter: {},
      value: true,
    });
  });

  it('静态入参不是复制出来的：改送出去的那一份不影响规则里那一格', () => {
    const props = { height: '480' };
    const payload = frameInitPayload(true, {}, props);

    payload.height = '600';
    expect(props).toEqual({ height: '480' });
  });
});

describe('frameDataError：只有写得成 JSON 的东西送得进框里', () => {
  it('纯数据一路到底都不说话', () => {
    for (const data of [
      'x',
      '',
      42,
      0,
      -1.5,
      true,
      false,
      null,
      {},
      [],
      { a: 1, b: { c: ['d', null, false] } },
      Object.assign(Object.create(null), { deep: 1 }),
    ]) {
      expect(frameDataError(data)).toBeUndefined();
    }
  });

  it('函数、symbol、undefined 会静默消失：这里点名，不静默删字段', () => {
    expect(frameDataError(() => undefined)).toMatch(/data 是 function/);
    expect(frameDataError(Symbol('x'))).toMatch(/data 是 symbol/);
    expect(frameDataError(undefined)).toMatch(/data 是 undefined/);
  });

  it('NaN 与 Infinity 写成 null：点名到那一条并说要的是有限的数字', () => {
    expect(frameDataError(NaN)).toBe(
      'data 是 NaN：送进框里会变成 null（要的是有限的那个数字）',
    );
    expect(frameDataError({ ratio: Infinity })).toBe(
      'data.ratio 是 Infinity：送进框里会变成 null（要的是有限的那个数字）',
    );
  });

  it('Date / Map / Set 那种对象写成串或空对象：不是「送得到」', () => {
    expect(frameDataError({ since: new Date(0) })).toMatch(
      /data\.since 是另一种对象/,
    );
    expect(frameDataError({ tags: new Set(['a']) })).toMatch(
      /data\.tags 是另一种对象/,
    );
  });

  it('自己绕回自己：红在来路那一步，不是等 postMessage 抛', () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;

    expect(frameDataError(loop)).toMatch(/data\.self 绕回了自己/);
  });

  it('深处那一格点名到完整路径（数组用下标，对象用键名）', () => {
    expect(frameDataError({ a: { b: [undefined] } })).toMatch(
      /data\.a\.b\[0\] 是 undefined/,
    );
    expect(frameDataError({ onClick() {} })).toMatch(
      /data\.onClick 是 function/,
    );
  });

  it('调用方给的名字进得了那句报错（外层按 frontmatter 那一格报时用它自己的名字）', () => {
    expect(frameDataError({ fn() {} }, 'frontMatter')).toMatch(
      /frontMatter\.fn 是 function/,
    );
  });
});
