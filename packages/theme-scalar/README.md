# @show-docs/docusaurus-theme-scalar

用 [Scalar](https://github.com/scalar/scalar) 的 `@scalar/api-reference` 渲染 API 文档的
Docusaurus 主题插件。frontmatter 写 `scalar: true`（渲染哪份文档由 spec 键 `oas3:` / `aas3:`
给）时，该文档页整页换成一个 iframe，Scalar 在框内页面 `/scalar-view` 中渲染那份文档。

`oas3:` 摆 **OpenAPI**、`aas3:` 摆 **AsyncAPI 3** —— 两把都是 spec 键、给的都是地址，这一层
不判断类型，厂商自己按文档里那一格（`openapi:` / `asyncapi:`）认。两把同时写时 `oas3:` 优先
（开发模式有一条告警）。

## 安装

外层套壳由 theme-iframe 提供，交出去的框页由 theme-component-page 挂上，`@theme-prev/*` 的别名
由解析器插件提供，四个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-component-page @show-docs/docusaurus-theme-iframe @show-docs/docusaurus-theme-scalar
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    // 本层排在同页其它框层前面 = 它先判
    '@show-docs/docusaurus-theme-scalar',
    '@show-docs/docusaurus-theme-iframe',
    '@show-docs/docusaurus-theme-component-page'
  ]
};
```

### 写 frontmatter

```md
---
title: 订单 API
scalar: true
oas3: /openapi.yaml
---
```

`scalar` 只写布尔 `true`：它说的是「这一层接这一页」。要渲染哪份文档由 spec 键给（OpenAPI 写
`oas3:`，AsyncAPI 3 写 `aas3:`）—— `static/openapi.yaml` 对应 `/openapi.yaml`，也可以写完整
URL（跨域时对方需允许 CORS）。命中后整页换成 iframe，不保留文档正文外壳，也不再渲染导图。
框内页面只接受 spec 地址这一种入参，不支持传入内联文档。

两把 spec 键只是「文档地址」的两个出处：判据不在本层，在厂商那边 —— Scalar 认文档里
`asyncapi:` 那一格。AsyncAPI 3 那一版见 [AsyncAPI 示例](./docs/scalar-asyncapi-demo.md)。

## 配置

本包没有插件选项。Scalar 的渲染参数集中在
`components/scalar-ui.tsx`：界面语言为简体中文
（`localization.locale: 'zh-cn'`），并关闭了 Test Request、Ask AI、暗色切换、正文顶上那一格
下载等入口。语言值要使用 Scalar 内置的小写连字符 id（例如 `zh-cn`，不是 `zh-CN`）。

## 渲染方式

- 文档页只输出 `<iframe class="api-frame scalar-frame" src="/scalar-view/?src=...">`。Scalar 的
  脚本只在框内页面加载，外层页面没有 Scalar 运行时。
- 框内页面只做客户端渲染，静态 HTML 里没有渲染结果。
- 亮暗模式跟随站点开关；直接打开 `/scalar-view` 时使用页面加载时的模式，之后不再跟随站点。

## 路由与深链

- 可分享的地址是外层文档页：`/theme-scalar/docs/scalar-demo#tag/orders/POST/orders`。hash 不参与请求文件，整页
  加载返回 200。
- hash 段由框内与框外的消息双向同步；Scalar 的格式是 `#tag/<tag>/<METHOD>/<path>`，`#` 后面没有
  前导斜杠。
- AsyncAPI 3 那一版的 hash 是按通道走的：`#channel/<通道 id>`，进到某条操作再往下一段
  `#channel/<通道 id>/operation/<操作 id>`（同样没有前导斜杠）。
- `/scalar-view/?src=…` 可以直接打开，但它是框内页面本身，不带外层 hash，不应作为分享地址。
- 产物中每条接口没有独立的 HTML。

## 已知限制

- 厂商那份样式表（实测 277,962 字节）已在构建期摘成独立产物，只在框内那份文档里被 `<link>`；
  外层页面不再为它多下载一份（原先每页多约 359 KB），全站那一份只剩本包自己写的一条规则。
  实测数据见 [维护者文档](./docs/internals.md) 的「样式」一节。
- 站点保留 300px 宽的文档侧栏；Scalar 左栏需要 iframe 宽度至少 1024px 才展开。视口 1280px 时
  iframe 只有 980px，整套 API 导航会收成「打开菜单」抽屉。
- 正文按需挂载：视口下方尚未滚动到的章节不在 DOM 中。
- iframe 内容对搜索引擎和抓取工具不可见。
- 页面上的 `#` 由 Scalar 占用，正文标题锚点不适用。
- `/scalar-view` 会进入站点地图；缺少 `src` 参数时整屏空白。
- spec 地址必须能从浏览器访问；外网地址需要配置 CORS。

## 相关文档

- [维护者文档](./docs/internals.md)：样式、宽度、界面文案与实测记录。
- [跨 iframe 协议](../theme-iframe/docs/iframe-protocol.md)：地址与亮暗同步的消息形状。
- [Scalar 示例](./docs/scalar-demo.md)。
- [Scalar AsyncAPI 示例](./docs/scalar-asyncapi-demo.md)。
