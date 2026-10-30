import { describe, expect, it } from 'vitest';

import {
  apiFrameByNamespace,
  IFRAME_ENTRY,
} from '../packages/theme-iframe/src/api-frame-registry.ts';
import {
  framePageOf,
  IFRAME_COMPONENT_PAGES,
} from '../packages/theme-iframe/src/component-pages.mts';

/**
## 这一族交给 component-page 的那一页

装了哪几层、谁先判不再由 theme-iframe 算：三条 API 层在自己的 `loadContent()` 里各交自己那一页
（`lib/api-frame-theme.mts` 的工厂代交），本层由入口交 `iframe:` 那一页。所以这里只有两件事 ——
「一条注册表条目会交成什么样」与「本层自己交的是哪一页」。顺序那一条由 component-page 的清单
按站点 `plugins` 的声明顺序决定，不在这一份里。
*/

const IFRAME = '@show-docs/docusaurus-theme-iframe';

describe('framePageOf：一条注册表条目交成的那一页', () => {
  it('internal 三条判布尔，组件是本层的 `@theme/ApiFramePage`，`props.namespace` 指回自己', () => {
    for (const key of ['scalar', 'redoc', 'stoplight'] as const) {
      const namespace = `@show-docs/docusaurus-theme-${key}`;
      expect(framePageOf(apiFrameByNamespace(namespace)!)).toEqual({
        key,
        match: 'boolean',
        component: '@theme/ApiFramePage',
        props: { namespace },
      });
    }
  });

  it('external（`iframe:`）判地址值 —— 那个值就是框要渲染的页面', () => {
    expect(framePageOf(IFRAME_ENTRY)).toEqual({
      key: 'iframe',
      match: 'value',
      component: '@theme/ApiFramePage',
      props: { namespace: IFRAME },
    });
  });
});

describe('IFRAME_COMPONENT_PAGES：本层只交自己那一页', () => {
  it('只有 `iframe:` 一条 —— 三条 API 层由各包自己的 `loadContent()` 交', () => {
    expect(IFRAME_COMPONENT_PAGES).toEqual([framePageOf(IFRAME_ENTRY)]);
  });
});
