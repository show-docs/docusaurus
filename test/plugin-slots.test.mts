import { describe, expect, it } from 'vitest';

import {
  assertPrevLayerResolverInstalled,
  declaredNamespaces,
  PLUGIN_NAME,
  pluginSlotName,
  resolverPluginRegistered,
  slotIsNamespace,
} from '../packages/plugin-prev-layer-resolver/src/plugin-slots.mts';

/**
## 那两份原始清单怎么认层，以及「本包注册了没有」那一条前置检查

这一族判据住在解析器包，因为「`@theme-prev/*` 由谁提供」只有本包说得住：住在某一族层的
`lib/` 里，别的层想用就得先装那一族层才能问这一句。它同时被浏览器侧那份装机判定
（`theme-iframe/lib/api-frame-entries.ts`）和各层配置期的 `loadContent()` 读，所以两边
不存在「装机判定认路径、前置检查只认包名」那种不对称。

形状认错的代价是**静默失效**（那一层不当自己装了、或那句点名永远不响），所以四种写法、
认不出名字的那些畸形格、以及按包目录段认路径的两条分支都在这里逐个钉住。
*/

const IFRAME = '@show-docs/docusaurus-theme-iframe';

describe('pluginSlotName：那四种原始写法各交出什么名字', () => {
  it('字符串与元组头：裸包名、带选项的元组都报名字', () => {
    expect(pluginSlotName(IFRAME)).toBe(IFRAME);
    expect(pluginSlotName([IFRAME, { a: 1 }])).toBe(IFRAME);
  });

  it('归一化形状那个 {name} 对象报名字；非字符串的名字格当认不出', () => {
    expect(pluginSlotName({ name: IFRAME })).toBe(IFRAME);
    expect(pluginSlotName({ name: 3 })).toBeUndefined();
    expect(pluginSlotName({})).toBeUndefined();
  });

  it('畸形槽位一律当认不出，不抛', () => {
    // 站点配置经 Docusaurus 校验后到不了这些形状，但浏览器侧读到的是**原始**那一份：
    // 认不出就当这一格不是层，而不是把数字带到 `slotIsNamespace()` 的 `replaceAll` 上。
    expect(pluginSlotName(42)).toBeUndefined();
    expect(pluginSlotName(null)).toBeUndefined();
    expect(pluginSlotName(() => undefined)).toBeUndefined();
    expect(pluginSlotName([42, {}])).toBeUndefined();
  });
});

describe('slotIsNamespace：包名相等，或落在该包目录内', () => {
  it('裸包名相等才算；另一个 scope 下同名目录不算相等', () => {
    expect(slotIsNamespace(IFRAME, IFRAME)).toBe(true);
    expect(slotIsNamespace('@other/docusaurus-theme-iframe', IFRAME)).toBe(
      false,
    );
  });

  it('包目录内的路径两种目录段都认：`docusaurus-theme-x` 与去前缀的 `theme-x`', () => {
    expect(
      slotIsNamespace(
        '/site/node_modules/@show-docs/docusaurus-theme-iframe/dist/index.mjs',
        IFRAME,
      ),
    ).toBe(true);
    // 钉包目录而不是具体入口文件名：产物改名（`lib/x.js`、`theme/x.tsx`）不能变成静默失效
    expect(
      slotIsNamespace(
        '/site/node_modules/theme-iframe/theme/DocItem/index.tsx',
        IFRAME,
      ),
    ).toBe(true);
  });

  it('反斜杠写法与完全无关的路径：前者认得，后者不算', () => {
    expect(
      slotIsNamespace(
        String.raw`C:\site\node_modules\@show-docs\docusaurus-theme-iframe\dist\index.mjs`,
        IFRAME,
      ),
    ).toBe(true);
    expect(slotIsNamespace('/site/src/theme/DocItem.tsx', IFRAME)).toBe(false);
  });

  it('不带 scope 的命名空间也认：那一格去掉 `@scope/` 前缀后就是目录段', () => {
    // `resolveCoreModule()` 那类内部命名空间没有 `@scope/`：`lastIndexOf('/')` 给 -1，
    // slice(0) 就是原样，走的是同一条算式。
    expect(slotIsNamespace('/site/node_modules/foo/dist/x.js', 'foo')).toBe(
      true,
    );
  });
});

describe('declaredNamespaces：两份清单合起来报名字', () => {
  it('两份都缺时是空数组；认不出名字的槽位略过', () => {
    expect(declaredNamespaces({})).toEqual([]);
    expect(
      declaredNamespaces({
        plugins: ['a', ['b', { x: 1 }], () => undefined, {}, { name: 3 }],
      }),
    ).toEqual(['a', 'b']);
  });

  it('`plugins` 与 `themes` 按声明顺序合并（装机判定不能只看一份）', () => {
    expect(
      declaredNamespaces({ plugins: ['p', ['q', {}]], themes: ['t'] }),
    ).toEqual(['p', 'q', 't']);
    expect(declaredNamespaces({ plugins: null, themes: [IFRAME] })).toEqual([
      IFRAME,
    ]);
  });
});

describe('resolverPluginRegistered / assertPrevLayerResolverInstalled：本包注册了没有', () => {
  it('两份清单里任一处按名注册都算；没注册时返回 false', () => {
    expect(resolverPluginRegistered({ plugins: [PLUGIN_NAME] })).toBe(true);
    expect(
      resolverPluginRegistered({
        themes: [[PLUGIN_NAME, { keepPreviousAliases: false }]],
      }),
    ).toBe(true);
    expect(resolverPluginRegistered({ plugins: [IFRAME], themes: [] })).toBe(
      false,
    );
    expect(resolverPluginRegistered({})).toBe(false);
  });

  it('注册了则放行；缺了当场点名，报错里带着调用方的包名与安装方式', () => {
    expect(() =>
      assertPrevLayerResolverInstalled('probe', { plugins: [PLUGIN_NAME] }),
    ).not.toThrow();

    expect(() =>
      assertPrevLayerResolverInstalled('probe', { plugins: [IFRAME] }),
    ).toThrow(new RegExp(String.raw`probe[\s\S]*${PLUGIN_NAME}`));
  });
});
