# @show-docs/docusaurus-theme-markmap

在文档页正文上方渲染思维导图的 Docusaurus 主题插件。frontmatter 写 `markmap: true` 时，页面顶部
出现由 markdown 标题结构生成的导图，正文保持原样。

## 安装

```bash
pnpm add @show-docs/docusaurus-theme-markmap
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: ['@show-docs/docusaurus-theme-markmap']
};
```

### 写 frontmatter

```md
---
title: 思维导图示例
markmap: true
---

# 一级标题

## 二级标题
```

导图渲染在整页内容上方；正文仍由官方 `DocItem` 正常渲染，标题、目录、翻页都不受影响。

## 层栈

本层提供 `theme/DocItem/index.tsx`：它先向下面那一层要 `DocItem` 的实现
（`@theme-prev/DocItem`），把导图摆在它前面，正文一格都不动。命不中（frontmatter 没写
`markmap`）时原样交回，这一页看不出这一层存在过。

层栈怎么推导、谁能盖住谁，是核心解析器那一格的事，见
[`plugin-prev-layer-resolver` 的 README](../../plugins/plugin-prev-layer-resolver/README.md)；
这一层自己只负责「摆在哪一格」。

## 配置

没有插件选项。`markmap` 同时是开关与渲染选项：

| 写法               | 作用                                                |
| ------------------ | --------------------------------------------------- |
| `markmap: true`    | 开启导图，使用 markmap 默认选项                     |
| `markmap: { ... }` | 开启导图，对象原样交给 markmap 的 `deriveOptions()` |
| `markmap: false`   | 不开启                                              |

对象写法支持 markmap-view 的视图选项，例如 `colorFreezeLevel`、`maxWidth`、`initialExpandLevel`；
完整清单见 [markmap 文档](https://markmap.js.org/)。

## 工作方式

- 构建时由 webpack loader 解析 markdown，把导图数据追加到 md 模块的导出上；导图组件在
  `DocItem` 前渲染。
- 导图跟随站点亮暗模式；工具条不提供暗色切换按钮。
- 导图内的链接在新标签页打开。
- 导图初始化失败时显示一条提示，正文继续渲染。

## 已知限制

- 只处理 `.md` 文件，`.mdx` 不触发。
- 导图在浏览器端渲染，静态 HTML 里没有导图内容，对搜索引擎不可见。
- frontmatter 必须是文件开头的 YAML 块；写在正文里的 `markmap:` 不会生效。

## 相关文档

- [思维导图示例](../../docs/markmap-demo.md)。
- [markmap 文档](https://markmap.js.org/)。
