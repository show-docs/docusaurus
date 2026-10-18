# demo

验证 / 调研用 demo，**不属于核心包**。核心包见 [`plugins/plugin-prev-layer-resolver`](../plugins/plugin-prev-layer-resolver/README.md)。

用三层本地主题插件（写法与站点层完全一致、每层都用 `@theme-prev/X` 包住上一层的同一个组件）验证
「链可任意加长、每层写法相同」。它们包的是同一个组件 —— 主页正文区那张卡片列表（`DocCardList`），
站点层 `src/theme` 再往最外面包一层，所以渲染出来是四层。

| 目录       | 内容                                                               |
| ---------- | ------------------------------------------------------------------ |
| `theme-a/` | 主题插件 A（`@show-docs/theme-a`，覆盖 DocCardList）               |
| `theme-b/` | 主题插件 B（`@show-docs/theme-b`，覆盖 DocCardList）               |
| `theme-c/` | 主题插件 C（`@show-docs/theme-c`，覆盖 DocCardList，验证链可加长） |
| `scripts/` | 验证脚本（`verify-chain.mts`，不是包）                             |

三个主题包各有 `package.json`（见 `pnpm-workspace.yaml`），站点按**包名**加载。

每个主题插件只导出 `getThemePath()` 等标准钩子，Docusaurus 的 babel 直接编译 `.mts` / `.tsx`，
不需要自己的构建产物。

## 验证链

```bash
pnpm build          # 先构建（含 build:core 与静态站点）
pnpm verify:chain   # 读真实 build 产物（主页 `build/index.html` 与示例页 `build/markmap-demo/index.html`），验证每一层都被保留
```

从上面那两份真实渲染产物里回读那条链：

```
src/theme > theme-c > theme-b > theme-a > (theme-classic 的真实卡片列表)
```

它**只在主页**：站点里只有 `docs/intro.md` 写了 `<DocCardList />`，别的页面根本不渲染这个组件 ——
所以不需要「按页面 id 分支」的代码。正因为这样，脚本在文档页那一格反过来断言整页一个包裹标记都没有。

浏览器里同样钉一次嵌套：`test/e2e/features/home.feature` 的那条用例要求
`div[data-site-wrapper="src/theme"] > div[data-theme-wrapper="theme-c"] > … > div[data-theme-wrapper="theme-a"]`
里就装着那些卡片，`markmap.feature` 则钉住文档页上一个包裹标记都没有
（步骤实现同在 `test/e2e/`，跑法见 `test/README.md`）。

每一层都被保留，每层写法相同，且 `@theme-original` 语义零改动。
