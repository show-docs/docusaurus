# demo

验证 / 调研用 demo，**不属于核心包**。核心包见 [`plugins/plugin-prev-layer-resolver`](../plugins/plugin-prev-layer-resolver/README.md)。

用三层本地主题插件（写法与站点层完全一致、都靠 `@theme-prev/Logo` 往上包）验证
「链可任意加长、每层写法相同」。

| 目录       | 内容                                                           |
| ---------- | -------------------------------------------------------------- |
| `theme-a/` | 主题插件 A（`@show-docs/theme-a`，覆盖 Logo / DocItem Footer） |
| `theme-b/` | 主题插件 B（`@show-docs/theme-b`，覆盖 Logo）                  |
| `theme-c/` | 主题插件 C（`@show-docs/theme-c`，验证链可任意加长）           |
| `scripts/` | 验证脚本（`verify-chain.mts`，不是包）                         |

三个主题包各有 `package.json`（见 `pnpm-workspace.yaml`），站点按**包名**加载。

每个主题插件只导出 `getThemePath()` 等标准钩子，Docusaurus 的 babel 直接编译 `.mts` / `.tsx`，
不需要自己的构建产物。

## 验证链

```bash
pnpm build          # 先构建（含 build:core 与静态站点）
pnpm verify:chain   # 读真实 build 产物，验证 4 层链式覆盖成立
```

4 层链，读 `build/index.html` / `build/docs/intro/index.html` 的真实渲染产物：

```
src/theme-logo > theme-c > theme-b > theme-a > (theme-classic 的真实 Logo)
```

每一层都被保留，每层写法相同，且 `@theme-original` 语义零改动。
