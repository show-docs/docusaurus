# @show-docs/docusaurus-theme-iframe

把文档页整页替换成一个指向**外部页面**的 iframe。frontmatter 写 `iframe: <地址>` 时，命中的页面
保留站点 navbar 与页脚位置，正文区换成一个 iframe。

判定与挂载都不在本包：本包在自己的 `loadContent()` 里交回**一个组件 + 一条规则**给
[`@show-docs/docusaurus-theme-component-page`](../theme-component-page/README.md)（组件是
`@theme/ExternalFrame`，规则是 `iframe:` 那把键），由机制层那份 `DocItem` 判表、命中后把整个
`DocItem` 换成这个组件。所以 component-page 与解析器插件是本包的安装前提，`loadContent()`
里当场点名。

这一层只管「嵌别人的页面」：跨源，没有握手、没有消息通道，地址只能在父文档这一侧算完
（`lib/external-url.ts`）。**三条 API 层（`scalar:` / `redoc:` / `stoplight:`）与本包无关** ——
它们各自向 component-page 交自己的组件与规则，那份同源框、`postMessage` 协议与框内页面都在
机制层里；卸载本包，它们和它们的框照常可用，只是 `iframe:` 那一把键不再有人认领。

## 安装

`@theme-prev/*` 的别名由解析器插件提供，命中与挂载由 component-page 负责，三个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver \
  @show-docs/docusaurus-theme-component-page \
  @show-docs/docusaurus-theme-iframe
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@show-docs/docusaurus-theme-iframe',
    // component-page 提供 `DocItem` 并挂各层交来的规则（放在最后 = 层栈最外）
    '@show-docs/docusaurus-theme-component-page'
  ]
};
```

判定先后不在 `plugins` 那一列，在 component-page 自己那一列 `rules`：站点按**键名**引用各包交出
的规则，引用排在哪条之前就先判（没被引用的默认规则接在那一列末尾，按键名排序）。想换先后或
把 `iframe:` 整体关掉（`{ key: 'iframe', enabled: false }`），都改站点那一份配置，本包没有插件选项。
本演示站的顺序写在 `docusaurus.config.mjs` 的 `rules` 那一列（`scalar` → `redoc` → `stoplight` →
`iframe`），`iframe:` 排最后。没装的层不跑 `loadContent()`、不交规则，站点引用一把没有主人的键
会在配置期直接报错。

### 写 frontmatter

```md
---
title: 外部文档
iframe: https://example.com/handbook/
---
```

值原样使用；以 `/` 开头时按当前站点 origin 补成绝对地址。地址栏带 `?path=<相对路径>` 时，
会在该地址之下再解析一层，用来切换外部站点的子页面。

**协议跟着页面走**：站点是 https 时，绝对 `http://` 地址会升成 `https://`（域名、路径与非默认
端口不变，只升不降；相对写法本来就继承页面协议）。http 资源在 https 页面上必被浏览器按混合
内容拦掉，不升那一格只会是空的。对方只支持 http 的话，得把它换到 https，或把那份文件放进
本站 `static/` 用相对地址。

`oas3:` / `aas3:` 那两把键与这一把键**没有关系**：它们给的是三条 API 层要渲染的 spec 地址，
本层嵌的是外部页面，地址自带。

## 工作方式

- 命中时 component-page 把整个 `DocItem` 换成本包的 `theme/ExternalFrame`，后者渲染一个
  `<iframe class="external-frame">`：不渲染面包屑、正文、右侧目录和翻页，站点 navbar 保留。
  没命中（没写、值不是非空文本、本包没装）时这一层什么都不做，页面按普通文档渲染。
- 页面占满 navbar 以下那一屏，并隐藏站点页脚；那两条版式在
  `components/external-frame.css`（与机制层那份同源框的 CSS 同文，为什么各留一份记在那份
  文件头上）。
- 无障碍标题优先用页面自己的 `frontmatter.title`，缺它才落到「嵌入的页面」。
- 与 `theme-markmap` 等其它交给 component-page 的规则同页命中时**不会叠**：一页只挂清单里排在
  最前的那一个组件，落败那把键会在开发模式留一条「一页同时命中多条」的告警。

## 已知限制

- 外部站点设置了 `X-Frame-Options` 或 CSP `frame-ancestors` 时，iframe 区域会空白；这是浏览器
  拒绝嵌入，不是本插件报错。
- 跨源页面没有可配合的代码：内容与站点主题、亮暗模式、路由互不影响，地址栏 `#` 段也不互通。
- 命中页不渲染官方 `DocItem/Metadata`，浏览器标签页标题与 `<meta name="description">` 退回
  站点默认值，不读该页的 `title:` / `description:`。
- 承载 iframe 的容器会通过 `.container:has(iframe)` 去掉内边距；正文里手写的 iframe 同样命中
  这条样式。
- 本包未安装时，frontmatter 里的 `iframe:` 不生效，页面按普通文档渲染（那一把键没人认领，
  也就没有「框指向不存在路由」那种落空）。

## 相关文档

- 本包是基础设施链最上面的一格（依赖下一格 `theme-component-page` 把规则挂上去）；最下面是
  解析器包。三格的规矩写在仓库根 `README.md` 的「基础设施包」一节。
- [维护者文档](./docs/internals.md)：包内组成、编译方式、这一族收缩的来龙去脉。
- [跨 iframe 协议](../theme-component-page/docs/iframe-protocol.md)：机制层那条同源框的消息形状
  （本层的跨源框不走它）。
- [iframe 示例](./docs/iframe-demo.md)。
