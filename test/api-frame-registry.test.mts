import { describe, expect, it } from 'vitest';

import {
  apiFrameByNamespace,
  apiFrameEntriesOrdered,
} from '../packages/theme-iframe/lib/api-frame-registry.ts';

/** 把「internal 才有的格」按类型收窄取出来，别让 TS 在纯数据断言里碍事。 */
const internals = () =>
  apiFrameEntriesOrdered().filter((entry) => entry.kind === 'internal');

describe('api-frame-registry：这一族清单的形状不变量', () => {
  it('四条都在，且 frontmatter 键互不重复', () => {
    const keys = apiFrameEntriesOrdered().map((e) => e.frontmatterKey);
    expect(keys).toEqual(['scalar', 'redoc', 'stoplight', 'iframe']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('三条 internal 共用一组有序 spec 键（`oas3` 在前、`aas3` 在后），与 `iframe:` 无关', () => {
    const rows = internals();
    expect(rows).toHaveLength(3);
    for (const entry of rows) {
      expect(entry.specFrontmatterKeys).toEqual(['oas3', 'aas3']);
    }
    // external 那条嵌的是外部页面，地址自带，不读 spec 键
    const external = apiFrameEntriesOrdered().find(
      (e) => e.kind === 'external',
    );
    expect('specFrontmatterKeys' in (external ?? {})).toBe(false);
  });

  it('三条 internal 占前三、iframe 那条 external 排在最后（默认优先级就靠这个排列）', () => {
    const kinds = apiFrameEntriesOrdered().map((e) => e.kind);
    expect(kinds).toEqual(['internal', 'internal', 'internal', 'external']);
  });

  it('每条的命名空间、类名都唯一 —— 它们是判定、样式与消息命名空间的键', () => {
    const namespaces = apiFrameEntriesOrdered().map((e) => e.namespace);
    const classes = apiFrameEntriesOrdered().map((e) => e.frameClass);
    expect(new Set(namespaces).size).toBe(namespaces.length);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it('internal 三条各自的 route / pageComponent / specParam 齐备且 route 唯一', () => {
    const rows = internals();
    expect(rows).toHaveLength(3);
    for (const entry of rows) {
      expect(entry.route).toMatch(/-view$/);
      expect(entry.pageComponent).toMatch(/^@theme\//);
      expect(entry.specParam).toBe('src');
    }
    const routes = rows.map((e) => e.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('apiFrameByNamespace：命中同一条、认不出交回 undefined（工厂据此当场抛）', () => {
    const scalar = apiFrameByNamespace('@show-docs/docusaurus-theme-scalar');
    expect(scalar?.frontmatterKey).toBe('scalar');
    // 命中同一次拿到的是注册表里那同一个对象（DocItem 判键靠引用相等去重）
    expect(apiFrameByNamespace('@show-docs/docusaurus-theme-scalar')).toBe(
      scalar,
    );
    expect(apiFrameByNamespace('@show-docs/no-such')).toBeUndefined();
  });

  it('external 那条没有 internal 专属的格，命名空间正是本层包名', () => {
    const external = apiFrameEntriesOrdered().find(
      (e) => e.kind === 'external',
    );
    expect(external?.namespace).toBe('@show-docs/docusaurus-theme-iframe');
    expect(external?.frontmatterKey).toBe('iframe');
    expect('route' in (external ?? {})).toBe(false);
  });
});
