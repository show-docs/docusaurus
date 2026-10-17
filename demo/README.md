# demo

验证 / 调研用 demo，**不属于核心包**。核心包见 [`plugins/plugin-prev-layer-resolver`](../plugins/plugin-prev-layer-resolver/README.md)。

用三层本地主题插件（写法与站点层完全一致、每层都用 `@theme-prev/X` 包住上一层的同一个组件）验证
「链可任意加长、每层写法相同」，并且把它落在**两根不同的组件链**上看得到：`Logo` 与 `DocCardList`。

| 目录       | 内容                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| `theme-a/` | 主题插件 A（`@show-docs/theme-a`，覆盖 Logo / DocItem Footer / DocCardList）  |
| `theme-b/` | 主题插件 B（`@show-docs/theme-b`，覆盖 Logo / DocCardList）                   |
| `theme-c/` | 主题插件 C（`@show-docs/theme-c`，覆盖 Logo / DocCardList，验证链可任意加长） |
| `scripts/` | 验证脚本（`verify-chain.mts`，不是包）                                        |

三个主题包各有 `package.json`（见 `pnpm-workspace.yaml`），站点按**包名**加载。

每个主题插件只导出 `getThemePath()` 等标准钩子，Docusaurus 的 babel 直接编译 `.mts` / `.tsx`，
不需要自己的构建产物。

## 验证链

```bash
pnpm build          # 先构建（含 build:core 与静态站点）
pnpm verify:chain   # 读真实 build 产物（主页 `build/index.html` 与示例页 `build/markmap-demo/index.html`），验证两根链的每一层都被保留
```

从上面那两份真实渲染产物里回读两条独立的链（同一个组件被三层同时包住，不止 `Logo` 一例）：

```
Logo（全页）        src/theme-logo > theme-c > theme-b > theme-a > (theme-classic 的真实 Logo)
DocCardList（正文） theme-c > theme-b > theme-a > (theme-classic 的真实卡片列表)
```

`DocCardList` 这条**只在主页**：站点里只有 `docs/intro.md` 写了 `<DocCardList />`，别的页面根本不
渲染这个组件 —— 所以不需要「按页面 id 分支」的代码，也正因为这样，脚本在文档页那一格反过来断言
正文里**没有**这条链。站点没有 swizzle `DocCardList`，所以这根链的最里层就是 theme-a（`Logo` 那根
的最外层才是 `src/theme`）。

浏览器里同样钉一次嵌套：`test/e2e/home.spec.mts` 要求 `div[data-theme-wrapper="theme-c"] > … >
div[data-theme-wrapper="theme-a"]` 里就装着那些卡片（跑法见 `test/README.md`）。

每一层都被保留，每层写法相同，且 `@theme-original` 语义零改动。
