# @show-docs/docusaurus-theme-stoplight

用 [Stoplight Elements](https://github.com/Stoplight/elements) 渲染 OpenAPI 文档的 Docusaurus
主题插件。frontmatter 写 `oas3: <spec 地址>` 时，该文档页整页换成一个 iframe，Elements 在框内
页面 `/stoplight-view` 中渲染那份文档。

## 安装

外层套壳由 theme-iframe 提供，两个包一起安装：

```bash
pnpm add @show-docs/docusaurus-theme-iframe @show-docs/docusaurus-theme-stoplight
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-theme-iframe',
    '@show-docs/docusaurus-theme-stoplight'
  ]
};
```

### 写 frontmatter

```md
---
title: 订单 API
oas3: /openapi.yaml
---
```

`oas3` 的值是框内页面要加载的 spec 地址：`static/openapi.yaml` 对应 `/openapi.yaml`，也可以写
完整 URL（跨域时对方需允许 CORS）。命中后整页换成 iframe，不保留文档正文外壳，也不再渲染导图。
框内页面只接受 spec 地址这一种入参，不支持传入内联文档。

## 配置

本包没有插件选项。Elements 的渲染参数集中在
`components/stoplight-ui.tsx`，当前固定 `hideExport: true` 与
`router: 'hash'`。

## 渲染方式

- 文档页只输出 `<iframe class="api-frame stoplight-frame" src="/stoplight-view?src=...">`。
  Elements 的脚本只在框内页面加载，外层页面没有 Elements 运行时。
- Elements 的静态样式表由框内页面自己挂 `<link>`，不会进入站点全站样式表。
- 框内页面只做客户端渲染，静态 HTML 里没有渲染结果。
- 亮暗模式跟随站点开关；直接打开 `/stoplight-view` 时属性为空，页面保持亮色。

## 路由与深链

- 可分享的地址是外层文档页：`/theme/theme-stoplight/docs/stoplight-demo#/operations/createOrder`。hash 不参与请求文件，
  整页加载返回 200。
- hash 段由框内与框外的消息双向同步；Elements 的格式是 `#/operations/<operationId>`，
  `operationId` 保留原样大小写。
- `/stoplight-view?src=…` 可以直接打开，但它是框内页面本身，不带外层 hash，不应作为分享地址。
- 产物中每条接口没有独立的 HTML。

## 已知限制

- iframe 内容对搜索引擎和抓取工具不可见；产物里只有 `build/theme/theme-stoplight/docs/stoplight-demo/index.html` 一份页面。
- 滚动条在框内，更准确地说由 Elements 的两条内层容器负责滚动；键盘焦点需要先进入框内。
- 页面上的 `#` 由 Elements 占用，正文标题锚点不适用。
- `/stoplight-view` 会进入站点地图；缺少 `src` 参数时整屏空白。
- spec 地址必须能从浏览器访问；外网地址需要配置 CORS。

## 相关文档

- [维护者文档](./docs/internals.md)：样式隔离、浏览器 polyfill 与实测记录。
- [跨 iframe 协议](../theme-iframe/docs/iframe-protocol.md)：地址与亮暗同步的消息形状。
- [Stoplight 示例](./docs/stoplight-demo.md)。
