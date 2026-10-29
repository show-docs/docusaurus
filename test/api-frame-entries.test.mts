import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  framePageUrl,
  framePageWarnings,
  frameSpecUrl,
  warnFramePages,
} from '../packages/theme-iframe/lib/api-frame-entries.ts';
import {
  apiFrameByNamespace,
  type ApiFrameEntryInternal,
} from '../packages/theme-iframe/lib/api-frame-registry.ts';

const SCALAR = '@show-docs/docusaurus-theme-scalar';
const IFRAME = '@show-docs/docusaurus-theme-iframe';

const scalar = apiFrameByNamespace(SCALAR) as ApiFrameEntryInternal;
const outer = apiFrameByNamespace(IFRAME)!;

/**
## 一页上了框之后的那几格

「这一页归哪一层」由 component-page 的清单判（`api-frame-contribute.test.mts` 钉交出什么），
这里只剩页内的事：框里要渲染的地址从哪来、写歪了怎么提示。判据不引 React，单测与
`theme/ApiFramePage` 引同一份。
*/

describe('frameSpecUrl：内层那组 spec 键里第一把非空的地址', () => {
  it('`oas3:` 在前、`aas3:` 在后；两把都写时用 `oas3:`', () => {
    expect(frameSpecUrl(scalar, { oas3: '/x.yaml' })).toBe('/x.yaml');
    expect(frameSpecUrl(scalar, { aas3: '/async.yaml' })).toBe('/async.yaml');
    expect(frameSpecUrl(scalar, { oas3: '/x.yaml', aas3: '/async.yaml' })).toBe(
      '/x.yaml',
    );
  });

  it('空串不算写了；前一把空、后一把有值时用后一把', () => {
    expect(frameSpecUrl(scalar, { oas3: '' })).toBe(undefined);
    expect(frameSpecUrl(scalar, { oas3: '', aas3: '/async.yaml' })).toBe(
      '/async.yaml',
    );
    expect(frameSpecUrl(scalar, {})).toBe(undefined);
    expect(frameSpecUrl(scalar, undefined)).toBe(undefined);
  });
});

describe('framePageUrl：这一页要送进框里的地址', () => {
  it('内层读 spec 键，不看交进来的值', () => {
    expect(framePageUrl(scalar, { oas3: '/x.yaml' }, true)).toBe('/x.yaml');
    expect(framePageUrl(scalar, {}, true)).toBe(undefined);
  });

  it('外层直接就是命中那把键写下的地址', () => {
    expect(framePageUrl(outer, undefined, '/404')).toBe('/404');
    // 值不像地址（站点覆写组件时传错）就不出框，不拼一个坏 `src`。
    expect(framePageUrl(outer, undefined, true)).toBe(undefined);
  });
});

describe('framePageWarnings：框出不来、或用得不对劲时的说明', () => {
  it('外层没有可说的：命中的值就是地址', () => {
    expect(framePageWarnings(outer, { iframe: '/404' }, '/docs/a')).toEqual([]);
  });

  it('写了布尔键却没给 spec 地址：说明带页面地址，且两把 spec 键都点名', () => {
    const [warning, ...rest] = framePageWarnings(
      scalar,
      { scalar: true },
      '/docs/a',
    );

    expect(rest).toEqual([]);
    expect(warning).toContain('/docs/a 写了 `scalar: true`');
    expect(warning).toContain('但没有 `oas3:` / `aas3:`');
    expect(warning).toContain('这一层不出框');
    // 拿不到页面地址时（非路由调用）用不带地址的说法，而不是拼出 `undefined`
    expect(framePageWarnings(scalar, { scalar: true })[0]).toContain(
      '这一页 写了 `scalar: true`',
    );
  });

  it('两把 spec 键同时写：只用前一把，另给一条手误提示', () => {
    const [warning, ...rest] = framePageWarnings(
      scalar,
      { scalar: true, oas3: '/x.yaml', aas3: '/async.yaml' },
      '/docs/a',
    );

    expect(rest).toEqual([]);
    expect(warning).toContain(
      '/docs/a 的 spec 键写了不止一把（`oas3:` / `aas3:`），按注册表顺序只用 `oas3:`',
    );
    expect(warning).toContain('两把都写通常是手误');
  });

  it('给了地址就安静（空串那把不算）', () => {
    expect(
      framePageWarnings(scalar, { scalar: true, oas3: '/x.yaml' }, '/docs/a'),
    ).toEqual([]);
    expect(
      framePageWarnings(
        scalar,
        { scalar: true, oas3: '', aas3: '/async.yaml' },
        '/docs/a',
      ),
    ).toEqual([]);
  });
});

describe('warnFramePages：开发模式把落空原因打到控制台', () => {
  // 去重那张表是**模块级**的（一份站点进程里只打一次），所以每条消息都带本次独有的编号，
  // 用例之间不会互相吃掉。vitest 每个测试文件一个 worker，跨文件也不会串。
  let seq = 0;
  const unique = (label: string): string => `warning-${seq++}-${label}`;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('每条各打一次，前缀是本包的包名', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = unique('a');
    const second = unique('b');

    warnFramePages([first, second]);

    expect(warn.mock.calls).toEqual([
      [`[theme-iframe] ${first}`],
      [`[theme-iframe] ${second}`],
    ]);
  });

  it('同一条文本反复进来只打第一次（同一页反复渲染会重算出同一条）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repeated = unique('same');

    warnFramePages([repeated]);
    warnFramePages([repeated, repeated]);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('空清单什么都不打', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warnFramePages([]);

    expect(warn).not.toHaveBeenCalled();
  });
});
