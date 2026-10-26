# @show-docs/docusaurus-theme-iframe

把文档页整页替换成 iframe 的 Docusaurus 主题插件。frontmatter 写 `iframe:`、`scalar:`、`redoc:`
或 `oas3:` 时，命中的页面保留站点 navbar，正文区换成一个 iframe。

`iframe:` 由本包直接处理，用来嵌外部页面；`scalar:` / `redoc:` / `oas3:` 分别由 theme-scalar、
theme-redoc、theme-stoplight 在框内渲染，本包负责外层套壳与跨 iframe 的地址、亮暗同步。

## 安装

```bash
pnpm add @show-docs/docusaurus-theme-iframe
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: ['@show-docs/docusaurus-theme-iframe']
};
```

使用 API 三把键时，同时注册对应的渲染包：

```js
[
  '@show-docs/docusaurus-theme-iframe',
  '@show-docs/docusaurus-theme-stoplight',
  '@show-docs/docusaurus-theme-redoc',
  '@show-docs/docusaurus-theme-scalar'
];
```

### 写 frontmatter

```md
---
title: 外部文档
iframe: https://example.com/handbook/
---
```

| 键       | 渲染方                                  | 值的含义         |
| -------- | --------------------------------------- | ---------------- |
| `iframe` | 本包                                    | 要嵌入的页面地址 |
| `scalar` | `@show-docs/docusaurus-theme-scalar`    | OpenAPI 文档地址 |
| `redoc`  | `@show-docs/docusaurus-theme-redoc`     | OpenAPI 文档地址 |
| `oas3`   | `@show-docs/docusaurus-theme-stoplight` | OpenAPI 文档地址 |

`iframe:` 的值原样使用；以 `/` 开头时按当前站点 origin 补成绝对地址。地址栏带
`?path=<相对路径>` 时，会在该地址之下再解析一层，用来切换外部站点的子页面。

## 配置

只有一个可选插件选项，用于覆盖本包判键的顺序和启用范围：

```js
[
  [
    '@show-docs/docusaurus-theme-iframe',
    {
      themeConfig: {
        apiFrame: {
          order: [
            '@show-docs/docusaurus-theme-redoc',
            '@show-docs/docusaurus-theme-stoplight',
            '@show-docs/docusaurus-theme-iframe'
          ]
        }
      }
    }
  ]
];
```

| 选项                         | 类型       | 默认值                                 | 说明                                                         |
| ---------------------------- | ---------- | -------------------------------------- | ------------------------------------------------------------ |
| `themeConfig.apiFrame.order` | `string[]` | `scalar` → `redoc` → `oas3` → `iframe` | 判定顺序与启用范围；排在前面的层优先，未列出的层不参与判定。 |

覆盖不会绕过「已安装」这一条：清单里列了但 `plugins` 里没装的层仍然不参与判定。同一页写了多
把键时，按顺序取第一个命中的已安装层。开发模式下，写了键却没有层接收会在控制台给出告警。

## 工作方式

- 命中时用 iframe 替换整个 `DocItem`：不渲染面包屑、正文、右侧目录和翻页，站点 navbar 保留。
- 页面占满 navbar 以下的一屏，并隐藏站点页脚；框的版式由四条层共用一份样式。
- 三个 API 包的框内页面（`/scalar-view`、`/redoc-view`、`/stoplight-view`）与本包通过
  `postMessage` 同步地址栏 `#` 段和亮暗模式；`iframe:` 嵌外部站点时没有这条通道。
- 与 `theme-markmap` 同页使用且两把键都命中时，导图渲染在 iframe 上方。

## 已知限制

- 外部站点设置了 `X-Frame-Options` 或 CSP `frame-ancestors` 时，iframe 区域会空白；这是浏览器
  拒绝嵌入，不是本插件报错。
- 外部 iframe 的内容与站点主题、亮暗模式、路由互不影响；跨源页面也没有可配合的代码。
- 命中页不渲染官方 `DocItem/Metadata`，浏览器标签页标题与 `<meta name="description">` 退回
  站点默认值，不读该页的 `title:` / `description:`。
- 承载 iframe 的容器会通过 `.container:has(iframe)` 去掉内边距；正文里手写的 iframe 同样命中
  这条样式。
- 对应插件未安装时，frontmatter 里的键不生效，页面按普通文档渲染。

## 相关文档

- [维护者文档](./docs/internals.md)：包内组成、编译方式、新增一条 API 层的步骤。
- [跨 iframe 协议](./docs/iframe-protocol.md)：地址与亮暗同步的消息形状、两侧的监听。
- [iframe 示例](./docs/iframe-demo.md)。
