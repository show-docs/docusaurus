# @show-docs/docusaurus-theme-redoc

用 [Redoc](https://github.com/Redocly/redoc) 渲染 API 文档的 Docusaurus 主题插件。frontmatter
写 `redoc: true`（渲染哪份文档由 spec 键 `oas3:` / `aas3:` 给）时，该文档页整页换成一个**同源**
iframe，Redoc 在 component-page 那条通用框内路由（`/__component-frame`）的一份独立文档里渲染
那份文档。

`oas3:` 摆 **OpenAPI**、`aas3:` 摆 **AsyncAPI 3** —— 两把都是 spec 键、给的都是地址，这一层
不判断类型，厂商自己按文档里那一格（`openapi:` / `asyncapi:`）认。两把同时写时 `oas3:` 优先
（开发模式有一条告警）。

## 安装

那一格框、两侧的握手与框内那份文档都由 theme-component-page 提供，`@theme/*` 的别名与
「谁来编本包那几份未编译的 `.tsx`」由解析器插件提供，两个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-component-page @show-docs/docusaurus-theme-redoc
```

本层不依赖 `@show-docs/docusaurus-theme-iframe`（那一层只管「整页交给一个**外部站点**的 URL」
那一把键），装上或卸载它都不影响这一层。

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@show-docs/docusaurus-theme-redoc',
    // 提供 `DocItem` 那一份判表：写在各层之后 = 层栈最外 = 最先判
    '@show-docs/docusaurus-theme-component-page'
  ]
};
```

本层在自己的 `loadContent()` 里交回一对条目（`{ componentPage: { components, rules } }`：组件
`@theme/RedocView` 登记成 `redoc`，规则 `{ key: 'redoc', match: 'boolean', render: 'iframe' }`），
不必再抄进站点配置。站点 `plugins` 里那一列的先后**不**决定同一页多把键时谁赢 —— 那个顺序看
站点 component-page 的 `rules` 那一列（写法见
[component-page 的 README](../theme-component-page/README.md)）。

### 写 frontmatter

```md
---
title: 订单 API
redoc: true
oas3: /openapi.yaml
---
```

`redoc` 只写布尔 `true`：它说的是「这一层接这一页」。要渲染哪份文档由 spec 键给（OpenAPI 写
`oas3:`，AsyncAPI 3 写 `aas3:`）—— `static/openapi.yaml` 对应 `/openapi.yaml`，也可以写完整
URL（跨域时对方需允许 CORS）。命中后整页换成 iframe，不保留文档正文外壳，也不渲染别的层挂在
正文上方那些东西。框里只接**文档地址**这一种入参，不支持传入内联文档。

两把 spec 键只是「文档地址」的两个出处：判据不在机制层，在本层
（`components/redoc-spec.ts`）—— Redoc 认文档里 `asyncapi:` 那一格。AsyncAPI 3 那一版见
[AsyncAPI 示例](./docs/redoc-asyncapi-demo.md)。

## 配置

本包没有插件选项。Redoc 的渲染参数集中在
`components/redoc-ui.tsx`，当前开启 `disableTelemetry: true`（不把用量
报出去）与 `hideDownloadButtons: true`（正文最前面那一格「Download OpenAPI description」不生成，
链接指向的就是本站那份 yaml）。

## 渲染方式

- 命中页只输出 `<iframe class="component-frame" src="/__component-frame/">`：那一格框由
  component-page 提供，**地址里不带本页的信息**（这一页的 frontmatter 与命中的值随握手送进框里），
  所以每一条命中页上的框长得一模一样。
- Redoc 那 2 MB 上下的运行时代码走框内那一份文档里的 `import()`，父文档既不 import 它，
  也不下载它；它往 `<head>` 插的那张样式表因此天然只属于框内那份文档。
- 框内那份文档只做客户端渲染；`build/theme-redoc/docs/redoc-demo/index.html` 里只有 iframe 标签，
  渲染结果要看浏览器。
- 亮暗模式跟随站点开关，不跟随操作系统偏好：站点那一头由外层随消息送进框内，落成框内
  `<html>` 上的 `data-redoc-mode`（Redoc 自带那套暗色表被本层改挂到这条属性上）。

## 路由与深链

- 可分享的地址是外层文档页：`/theme-redoc/docs/redoc-demo#/orders/createorder`。hash 不参与请求文件，整页加载
  返回 200。
- hash 段由框内与框外的消息双向同步；Redoc 的格式是前导 `/`，路径为标签加小写的
  `operationId`（如 `#/orders/createorder`）。
- AsyncAPI 3 那一版的 hash 是按通道走的：`#/channels/<通道 id>`，进到某条操作再往下一段
  `#/channels/<通道 id>/operations/<操作 id>`。
- 那条框内路由 `/__component-frame/` 是三条层共用的，单独打开它只会停在「正在从这一页的文档里
  取数据…」那一格（没有外层就没人送数据），不该作为分享地址。
- 产物中每条接口没有独立的 HTML。

## 已知限制

- iframe 内容对搜索引擎和抓取工具不可见；产物里只有 `build/theme-redoc/docs/redoc-demo/index.html` 一份页面。
- 滚动条在框内，键盘焦点需要先进入框内。
- 页面上的 `#` 由 Redoc 占用，正文标题锚点不适用。
- 写了 `redoc: true` 却没给 `oas3:` / `aas3:`：命中还是命中、框照挂，框里摆本层那句「这一页没给
  Redoc 要渲染的文档」的说明。这一格必须看得见，因为 Redoc 拿到空地址**不报错**，而是把它自己
  那份「No page at this address」摆在正文区，看着像渲染器坏了。
- spec 地址必须能从浏览器访问；外网地址需要配置 CORS。

## 相关文档

- [维护者文档](./docs/internals.md)：样式、路由、亮暗模式与实测记录。
- [跨 iframe 协议](../theme-component-page/docs/iframe-protocol.md)：那四条消息、握手顺序与边界。
- [Redoc 示例](./docs/redoc-demo.md)。
- [Redoc AsyncAPI 示例](./docs/redoc-asyncapi-demo.md)。
