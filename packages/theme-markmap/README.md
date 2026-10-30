# @show-docs/docusaurus-theme-markmap

在文档页正文上方渲染思维导图的 Docusaurus 主题插件。frontmatter 写 `markmap: true` 时，页面顶部
出现由 markdown 标题结构生成的导图，正文保持原样。

## 安装

「整页换成导图页」这一格由 theme-component-page 判，本层的共享外壳也住在 theme-component-page 里，
`@theme-prev/*` 的别名由解析器插件提供，三个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-component-page @show-docs/docusaurus-theme-markmap
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@show-docs/docusaurus-theme-markmap',
    '@show-docs/docusaurus-theme-component-page'
  ]
};
```

本层在自己的 `loadContent()` 里交回一对条目（交回的 content 里带 `componentPage`：组件
`@theme/MarkmapPage` 登记成 `markmap`，规则 `{ key: 'markmap', match: 'options' }`），由
theme-component-page 那份 `DocItem` 判表后整页换成它。所以 component-page 要注册，而且要写在
本层**之后** —— 越晚声明 = 层栈越靠外 = 越先判（见
[`plugin-prev-layer-resolver` 的 README](../plugin-prev-layer-resolver/README.md)）。这条顺序只管
「这一页归谁判」；同一页写中多把键时谁先命中，看站点 component-page 那一列 `rules` 的顺序。
本层不依赖 `theme-iframe`。

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

本层不再提供 `theme/DocItem`：它在 `loadContent()` 里交出一把 `markmap` 条目（判法 `options`，组件指回
`@theme/MarkmapPage`），由 theme-component-page 在最外那一格命中后把整页换掉。`MarkmapPage`
自己也不拼外壳 —— 它向官方要 `DocItem`（`@theme-init/DocItem`；仓库里只有 component-page 这
一层提供 `DocItem`，没有要串的链），把导图摆在它前面，正文一格都不动；命不中时那一层等于透明，
这一页看不出它存在过。

层栈怎么推导、谁能盖住谁，是核心解析器那一格的事，见
[`plugin-prev-layer-resolver` 的 README](../plugin-prev-layer-resolver/README.md)；
这一层自己只负责「交哪一把键、摆在哪一格」。

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

- 构建时由 webpack loader 解析 markdown，把导图数据追加到 md 模块的导出上；`MarkmapPage`
  拿到本层数据后把导图摆在 `DocItem` 前面。
- 导图跟随站点亮暗模式；工具条不提供暗色切换按钮。
- 导图内的链接在新标签页打开。
- 导图初始化失败时显示一条提示，正文继续渲染。

## 已知限制

- 只处理 `.md` 文件，`.mdx` 不触发。
- 导图在浏览器端渲染，静态 HTML 里没有导图内容，对搜索引擎不可见。
- frontmatter 必须是文件开头的 YAML 块；写在正文里的 `markmap:` 不会生效。
- 必须同时注册 theme-component-page：本层交出的那一页由它判清单后挂上（缺了它，
  `loadContent()` 当场点名，不会等到页面一片空白才被发现）。它还要写在本层之后，
  否则判不到这一页。
- 一页只挂一个整页组件：同一页既写 `markmap:` 又写 `iframe:`（或别的清单键）时，
  按清单顺序只用排在前面那条，导图不一定赢。

## 相关文档

- [思维导图示例](./docs/markmap-demo.md)。
- [markmap 文档](https://markmap.js.org/)。
