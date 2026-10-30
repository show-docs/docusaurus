---
id: component-page-demo
sidebar_position: 2
title: 组件整页示例
description: 'frontmatter 写 componentPage: true，这一页的整个 DocItem 换成站点配置里点名的那个 React 组件。'
componentPage: true
---

# 这一页由站点配置的组件渲染

这一页的 frontmatter 写了 `componentPage: true`。站点配置里那两格（见下面那段）先把它登记成
`site/ComponentPageDemo`、再由一条规则引用那个登记名，于是正文区整格交回站点自己那个组件 ——
本文件下面这些 Markdown 一个字都不会出现，`title` 与 `description` 这两格倒是照样跟着
frontmatter 进组件。

```js title="docusaurus.config.mjs"
export default {
  plugins: [
    // ……解析器插件与其余各层
    [
      '@show-docs/docusaurus-theme-component-page',
      {
        // 组件登记表：一个登记名 + 那个组件的说明符
        components: [
          {
            id: 'site/ComponentPageDemo',
            component: '@theme/ComponentPageDemo'
          }
        ],
        // 规则表：这一列的顺序就是命中优先级
        rules: [
          {
            key: 'componentPage',
            component: 'site/ComponentPageDemo',
            props: { label: '组件接管了这一页' }
          },
          // 下面这四条不写内容、只把装着的包交出的默认规则**提到这个位置**，
          // 于是它们之间的先后由本站说了算（口径见 internals.md 的「优先级」那一节）。
          'scalar',
          'redoc',
          'stoplight',
          'iframe'
        ]
      }
    ]
  ]
};
```

规则的 `component` 那一格写的是**登记名**，不是模块说明符；说明符只写在 `components` 那一列。
`components` 推荐写成 `@theme/X` —— 那条别名跟着层栈走，站点在 `src/theme/X` 放一份就换掉它，
不必回来改这里。判法、入参形状与「为什么非要生成两份文件」都记在
[本包的使用者文档](../README.md) 与[维护者文档](./internals.md)里。

上面那两条来自站点配置。装了的插件也可以自己交回条目：`theme-iframe` 的 `iframe:`、
三条 API 层的 `scalar:` / `redoc:` / `stoplight:`（那三条写的是 `render: 'iframe'`，框与框内那份
文档都由本层提供）、`theme-markmap` 的 `markmap`、`theme-erd` 的 `dbml_json` 与 `theme-diff` 的
`diff` 就是这么来的 —— 各自在 `loadContent()` 里交回 `{ componentPage }`，命中后分别由
`@theme/ExternalFrame` / `@theme/ScalarView` / `@theme/RedocView` / `@theme/StoplightView` /
`@theme/MarkmapPage` / `@theme/ErdPage` / `@theme/DiffPage` 渲染，不必再抄到站点这一列里。
