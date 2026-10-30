# @show-docs/docusaurus-theme-stoplight

用 [Stoplight Elements](https://github.com/Stoplight/elements) 渲染 OpenAPI 文档的 Docusaurus
主题插件。frontmatter 写 `stoplight: true`（渲染哪份文档由 spec 键 `oas3:` / `aas3:` 给）时，
该文档页整页换成一个**同源** iframe，Elements 在 component-page 那条通用框内路由
（`/__component-frame`）的一份独立文档里渲染那份文档。

`oas3:` 摆 **OpenAPI**、`aas3:` 摆 **AsyncAPI 3** —— 两把都是 spec 键、给的都是地址，这一层
不判断类型。

## 安装

那一格框、两侧的握手与框内那份文档都由 theme-component-page 提供，`@theme/*` 的别名与
「谁来编本包那几份未编译的 `.tsx`」由解析器插件提供，两个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-component-page @show-docs/docusaurus-theme-stoplight
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
    '@show-docs/docusaurus-theme-stoplight',
    // 提供 `DocItem` 那一份判表：写在各层之后 = 层栈最外 = 最先判
    '@show-docs/docusaurus-theme-component-page'
  ]
};
```

本层在自己的 `loadContent()` 里交回一对条目（`{ componentPage: { components, rules } }`：组件
`@theme/StoplightView` 登记成 `stoplight`，规则 `{ key: 'stoplight', match: 'boolean', render: 'iframe' }`），
不必再抄进站点配置。站点 `plugins` 里那一列的先后**不**决定同一页多把键时谁赢 —— 那个顺序看
站点 component-page 的 `rules` 那一列（写法见
[component-page 的 README](../theme-component-page/README.md)）。

### 写 frontmatter

```md
---
title: 订单 API
stoplight: true
oas3: /openapi.yaml
---
```

`stoplight` 只写布尔 `true`：它说的是「这一层接这一页」。要渲染哪份文档由 spec 键给（OpenAPI
写 `oas3:`，AsyncAPI 3 写 `aas3:`）—— `static/openapi.yaml` 对应 `/openapi.yaml`，也可以写
完整 URL（跨域时对方需允许 CORS）。命中后整页换成 iframe，不保留文档正文外壳，也不渲染别的层
挂在正文上方那些东西。框里只接**文档地址**这一种入参，不支持传入内联文档。

这一层只覆盖 **OpenAPI** —— `oas3:`（或 `aas3:`）给一份 AsyncAPI 3 文档过来，Elements 那边
不认，本层没测过。两把键的读法在本层（`components/stoplight-spec.ts`），机制层不认识它们。

## 配置

本包没有插件选项。Elements 的渲染参数集中在
`components/stoplight-ui.tsx`，当前固定 `hideExport: true` 与
`router: 'hash'`。

## 渲染方式

- 命中页只输出 `<iframe class="component-frame" src="/__component-frame/">`：那一格框由
  component-page 提供，**地址里不带本页的信息**（这一页的 frontmatter 与命中的值随握手送进框里），
  所以每一条命中页上的框长得一模一样。
- Elements 那 1.8 MB 上下的运行时代码走框内那一份文档里的 `import()`，父文档既不 import 它，
  也不下载它。
- Elements 的样式表是一份**静态**文件，Docusaurus 默认会把它并进全站那一份 css（每个页面都
  `<link>` 同一个文件，iframe 拦不住这种构建期就写进 html 的样式）。本包的 webpack 接线把它的
  `import` 换成一条 `asset/resource` 产物，只由框内那份文档挂一条 `<link>`；口径见
  [维护者文档](./docs/internals.md) 的「样式」一节。
- 框内那份文档只做客户端渲染，静态 HTML 里没有渲染结果。
- 亮暗模式跟随站点开关；直接打开那条框内路由时属性为空，页面保持亮色。站点那一头由外层随消息
  送进框内，落成框内 `<html>` 上的 `data-theme` —— Elements 那份暗色表本来就挂在这条属性上，
  所以这一格不需要任何运行期的改写。它自己那份存在 localStorage 里的存档（`mosaic-theme`）
  因此压不过站点：站点送的那一次写在它之后（用例钉住了这一条）。

## 路由与深链

- 可分享的地址是外层文档页：`/theme-stoplight/docs/stoplight-demo#/operations/createOrder`。hash 不参与请求文件，
  整页加载返回 200。
- hash 段由框内与框外的消息双向同步；Elements 的格式是 `#/operations/<operationId>`，
  `operationId` 保留原样大小写。
- 那条框内路由 `/__component-frame/` 是三条层共用的，单独打开它只会停在「正在从这一页的文档里
  取数据…」那一格（没有外层就没人送数据），不该作为分享地址。
- 产物中每条接口没有独立的 HTML。

## 已知限制

- iframe 内容对搜索引擎和抓取工具不可见；产物里只有 `build/theme-stoplight/docs/stoplight-demo/index.html` 一份页面。
- 滚动条在框内，更准确地说由 Elements 的两条内层容器负责滚动；键盘焦点需要先进入框内。
- 页面上的 `#` 由 Elements 占用，正文标题锚点不适用。
- 写了 `stoplight: true` 却没给 `oas3:` / `aas3:`：命中还是命中、框照挂，框里摆本层那句「这一页
  没给 Stoplight 要渲染的文档」的说明，而不是一个人点进一页空白。
- spec 地址必须能从浏览器访问；外网地址需要配置 CORS。

## 相关文档

- [维护者文档](./docs/internals.md)：样式隔离、浏览器 polyfill 与实测记录。
- [跨 iframe 协议](../theme-component-page/docs/iframe-protocol.md)：那四条消息、握手顺序与边界。
- [Stoplight 示例](./docs/stoplight-demo.md)。
