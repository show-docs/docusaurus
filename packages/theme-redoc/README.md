# @show-docs/docusaurus-theme-redoc

用 [Redoc](https://github.com/Redocly/redoc) 渲染 OpenAPI 文档的 Docusaurus 主题插件。frontmatter
写 `redoc: <spec 地址>` 时，该文档页整页换成一个 iframe，Redoc 在框内页面 `/redoc-view` 中渲染
那份文档。

## 安装

外层套壳由 theme-iframe 提供，`@theme-prev/*` 的别名由解析器插件提供，三个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-iframe @show-docs/docusaurus-theme-redoc
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@show-docs/docusaurus-theme-iframe',
    '@show-docs/docusaurus-theme-redoc'
  ]
};
```

### 写 frontmatter

```md
---
title: 订单 API
redoc: /openapi.yaml
---
```

`redoc` 的值是框内页面要加载的 spec 地址：`static/openapi.yaml` 对应 `/openapi.yaml`，也可以写
完整 URL（跨域时对方需允许 CORS）。命中后整页换成 iframe，不保留文档正文外壳，也不再渲染导图。
框内页面只接受 spec 地址这一种入参，不支持传入内联文档。

## 配置

本包没有插件选项。Redoc 的渲染参数集中在
`components/redoc-ui.tsx`，当前开启 `disableTelemetry: true`（不把用量
报出去）与 `hideDownloadButtons: true`（正文最前面那一格「Download OpenAPI description」不生成，
链接指向的就是本站那份 yaml）。

## 渲染方式

- 文档页只输出 `<iframe class="api-frame redoc-frame" src="/redoc-view?src=...">`。Redoc 的脚本和
  样式只在框内页面加载，外层页面没有 Redoc 运行时。
- 框内页面同样只做客户端渲染；`build/theme-redoc/docs/redoc-demo/index.html` 里只有 iframe 标签，渲染结果要看
  浏览器。
- 亮暗模式跟随站点开关，不跟随操作系统偏好。

## 路由与深链

- 可分享的地址是外层文档页：`/theme-redoc/docs/redoc-demo#/orders/createorder`。hash 不参与请求文件，整页加载
  返回 200。
- hash 段由框内与框外的消息双向同步；Redoc 的格式是前导 `/`，路径为标签加小写的
  `operationId`（如 `#/orders/createorder`）。
- `/redoc-view?src=…` 可以直接打开，但它是框内页面本身，不带外层 hash，不应作为分享地址。
- 产物中每条接口没有独立的 HTML。

## 已知限制

- iframe 内容对搜索引擎和抓取工具不可见；产物里只有 `build/theme-redoc/docs/redoc-demo/index.html` 一份页面。
- 滚动条在框内，键盘焦点需要先进入框内。
- 页面上的 `#` 由 Redoc 占用，正文标题锚点不适用。
- `/redoc-view` 会进入站点地图；缺少 `src` 参数时整屏空白。
- 直接打开 `/redoc-view` 时没有外层同步，配色保持亮色。
- spec 地址必须能从浏览器访问；外网地址需要配置 CORS。

## 相关文档

- [维护者文档](./docs/internals.md)：样式、路由、亮暗模式与实测记录。
- [跨 iframe 协议](../theme-iframe/docs/iframe-protocol.md)：地址与亮暗同步的消息形状。
- [Redoc 示例](./docs/redoc-demo.md)。
