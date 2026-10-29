---
id: component-page-demo
sidebar_position: 2
title: 组件整页示例
description: 'frontmatter 写 componentPage: true，这一页的整个 DocItem 换成站点配置里点名的那个 React 组件。'
componentPage: true
---

# 这一页由站点配置的组件渲染

这一页的 frontmatter 写了 `componentPage: true`。站点配置里那一条清单（见下面那段）把它
映射到站点自己的 `@theme/ComponentPageDemo`，于是正文区整格交回那个组件 —— 本文件下面这些
Markdown 一个字都不会出现，`title` 与 `description` 这两格倒是照样跟着 frontmatter 进组件。

```js title="docusaurus.config.mjs"
export default {
  plugins: [
    // ……解析器插件与其余各层
    [
      '@show-docs/docusaurus-theme-component-page',
      {
        pages: [
          {
            key: 'componentPage',
            component: '@theme/ComponentPageDemo',
            props: { label: '组件接管了这一页' }
          }
        ]
      }
    ]
  ]
};
```

清单的**顺序就是优先级**：一页同时写中两条键时只用排在前面那条，开发模式给一条说明。
`component` 推荐写成 `@theme/X` —— 那条别名跟着层栈走，站点在 `src/theme/X` 放一份就换掉它，
不必回来改这里。判法、入参形状与「为什么非要生成一份文件」都记在
[本包的使用者文档](../README.md) 与[维护者文档](./internals.md)里。

上面那一条来自站点配置。装了的插件也可以自己交回条目：`theme-iframe` 的四把框键与
`theme-markmap` 的 `markmap` 就是这么来的 —— 各自在 `loadContent()` 里交回
`{ componentPages }`，命中后分别由 `@theme/ApiFramePage` / `@theme/MarkmapPage` 渲染，
不必再抄到站点这一列里。
