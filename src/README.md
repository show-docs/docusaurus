# src

站点侧源码。**只有 `theme/` 算主题层**，另外两个不是 —— 这是本仓库最容易踩的一格。

| 目录     | 是什么                                                               | 属于主题层？                          |
| -------- | -------------------------------------------------------------------- | ------------------------------------- |
| `theme/` | 站点层 swizzle，层栈最外圈的哨兵槽位                                 | ✅ 是，见 [README](./theme/README.md) |
| `pages/` | Docusaurus 路由页面（`/`），用 `@theme/Layout` 和 `@docusaurus/Link` | ❌ 不是                               |
| `css/`   | 全局样式，由 `docusaurus.config.mjs` 的 `theme.customCss` 引入       | ❌ 不是                               |

## 为什么这条界线要紧

`@theme-prev/*` 只在「导入者属于某个已知主题层」时被改写，而层栈里站点侧**只有 `src/theme`**，
所以把 specifier 写进 `pages/` 或 `css/` 里的文件必定失败：

```js
// src/pages/index.jsx —— 模块不属于任何层
import PrevLogo from '@theme-prev/Logo'; // ❌ 真实的 Module not found，构建失败
```

`issuerIndex = -1` → 交回官方解析 → 官方不认识这个 specifier → 报错。
这不是「有时灵有时不灵」，是**硬失败**（告警 + 必定红，见
[plugin-prev-layer-resolver 的 README「会告警的地方」](../plugins/plugin-prev-layer-resolver/README.md#会告警的地方)），
插件会把这格列为常见成因。

站点页面要用某个主题组件时，两条正路：走官方的 `@theme/X`（全局赢家），
或者显式 import 到具体那一层的路径。需要「剥掉某一层」是主题层的需求，不是页面层的。
