# @show-docs/docusaurus-theme-iframe

把文档页整页替换成 iframe 的 Docusaurus 主题插件。frontmatter 写 `iframe:`、`scalar: true`、
`redoc: true` 或 `stoplight: true` 时，命中的页面保留站点 navbar，正文区换成一个 iframe。

`iframe:` 由本包直接处理，用来嵌外部页面；`scalar:` / `redoc:` / `stoplight:` 分别由
theme-scalar、theme-redoc、theme-stoplight 在框内渲染，本包负责外层组件与跨 iframe 的地址、
亮暗同步。四把键不放在本包自己的 `DocItem` 里判：本包在自己的 `loadContent()` 里把**装了的
层**各交一页给
[`@show-docs/docusaurus-theme-component-page`](../theme-component-page/README.md)，由它那份
`DocItem` 判清单、命中后挂上本包的 `theme/ApiFramePage`（所以 component-page 是本包的安装前提）。

**用哪一层渲染**与**渲染哪份文档**是两件事：前者由那三把布尔键决定（`scalar: true`……），
后者由 spec 键决定 —— `oas3:` 摆 OpenAPI、`aas3:` 摆 AsyncAPI 3（三条 API 层读同一组，按顺序
取第一把非空地址）。两把 spec 键与 `iframe:` 无关：`iframe:` 嵌的是外部页面，地址自带。

## 安装

`@theme-prev/*` 的别名由解析器插件提供；交出去的框页由 `theme-component-page` 挂上，两个包
一起安装：

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
    // 框页由这一层挂上去；放在最后 = 层栈最外 = 最先判
    '@show-docs/docusaurus-theme-component-page'
  ]
};
```

使用 API 三把键时，同时注册对应的渲染包：

```js
[
  '@show-docs/docusaurus-plugin-prev-layer-resolver',
  '@show-docs/docusaurus-theme-iframe',
  '@show-docs/docusaurus-theme-stoplight',
  '@show-docs/docusaurus-theme-redoc',
  '@show-docs/docusaurus-theme-scalar',
  '@show-docs/docusaurus-theme-component-page'
];
```

### 写 frontmatter

```md
---
title: 外部文档
iframe: https://example.com/handbook/
---
```

```md
---
title: 订单 API
stoplight: true
oas3: /openapi.yaml
---
```

| 键          | 渲染方                                  | 值的含义                   |
| ----------- | --------------------------------------- | -------------------------- |
| `iframe`    | 本包                                    | 要嵌入的页面地址           |
| `scalar`    | `@show-docs/docusaurus-theme-scalar`    | 写 `true` = 这一层接这一页 |
| `redoc`     | `@show-docs/docusaurus-theme-redoc`     | 写 `true` = 这一层接这一页 |
| `stoplight` | `@show-docs/docusaurus-theme-stoplight` | 写 `true` = 这一层接这一页 |
| `oas3`      | 三条 API 层共用（OpenAPI）              | 要渲染的那份 API 文档地址  |
| `aas3`      | 三条 API 层共用（AsyncAPI 3）           | 要渲染的那份 API 文档地址  |

`iframe:` 的值原样使用；以 `/` 开头时按当前站点 origin 补成绝对地址。地址栏带
`?path=<相对路径>` 时，会在该地址之下再解析一层，用来切换外部站点的子页面。

`oas3:` / `aas3:` 的值是框内页面要加载的 spec 地址（OpenAPI 用前者、AsyncAPI 3 用后者）：
`static/openapi.yaml` 对应 `/openapi.yaml`，也可以写完整 URL（跨域时对方需允许 CORS）。三把
布尔键里写了哪一把就用哪一层渲染它；一把都没写、只给 spec 地址，那一格不生效（开发模式会有
一条告警）。两把 spec 键同时写时按注册表顺序用 `oas3:`，另一把被忽略（开发模式有一条告警）。

**协议跟着页面走**：站点是 https 时，`oas3:` / `aas3:` 与 `iframe:` 给的绝对 `http://` 地址会
升成 `https://`（域名、路径与非默认端口不变，只升不降；相对写法本来就继承页面协议）。http 资源
在 https 页面上必被浏览器按混合内容拦掉，不升那一格只会是空的。对方只支持 http 的话，
得把它换到 https，或把那份文件放进本站 `static/` 用相对地址。

两把 spec 键只是「文档地址」的两个出处：`oas3:` 给 OpenAPI、`aas3:` 给 AsyncAPI 3；本层不判断
文档类型，判据在厂商那边（见各层 README）。目前实测过 AsyncAPI 3 的是 `scalar` 与 `redoc`
两层，`stoplight` 那一层没测。

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

| 选项                         | 类型       | 默认值                                      | 说明                                                         |
| ---------------------------- | ---------- | ------------------------------------------- | ------------------------------------------------------------ |
| `themeConfig.apiFrame.order` | `string[]` | `scalar` → `redoc` → `stoplight` → `iframe` | 判定顺序与启用范围；排在前面的层优先，未列出的层不参与判定。 |

覆盖不会绕过「已安装」这一条：清单里列了但 `plugins` 里没装的层仍然不参与判定。同一页写了多
把键时，按顺序取第一个命中的已安装层。覆盖清单里拼错的名字、列了没装的层，在 `loadContent()` 里打一条
告警（每类一次；默认顺序下没装的层静默跳过，那是正常状态）。

四把键交给 component-page 之后，它也守着那一层的合成规则：站点若在 component-page 的
`pages` 里写了同一把键，以站点那条为准（构建日志留一句提示）；写成 `component: false` 就把
那一把键整体关掉。

开发模式下，命中一页但框出不来、或用得不对劲时会告警：写了布尔键却没给 spec 地址、两把 spec
键同时写。**键的形状不对**（例如 `scalar: 一份地址`）由 component-page 那条通用告警说 ——
它判的就是「这把键的形状合不合清单里的判法」；`iframe:` 拿了非字符串也不会出框，交回普通
文档页。落空的一大类现在从「框不出来」变成「键不生效、页面看起来正常」，`loadContent()` 与开发模式各
留了一条话，但**只写了 spec 键、没写任何布尔键**的页面不会再有告警：没有哪一层认领这一页，
自然也没有谁该出框。

## 工作方式

- 命中时 `theme-component-page` 把整个 `DocItem` 换成本包的 `theme/ApiFramePage`，后者渲染
  iframe：不渲染面包屑、正文、右侧目录和翻页，站点 navbar 保留。
- 页面占满 navbar 以下的一屏，并隐藏站点页脚；框的版式由四条层共用一份样式。
- 三个 API 包的框内页面（`/scalar-view`、`/redoc-view`、`/stoplight-view`）与本包通过
  `postMessage` 同步地址栏 `#` 段和亮暗模式；`iframe:` 嵌外部站点时没有这条通道。
- 与 `theme-markmap` 同页使用且两把键都命中时**不会叠**：两边都把各自那一页交给
  `theme-component-page`，一页只挂清单里排在最前的那一个组件（清单顺序 = 站点那一列在前、
  包交出的按声明顺序接在后面），落败那把键会在开发模式留一条「一页同时命中多条」的告警。

## 已知限制

- 外部站点设置了 `X-Frame-Options` 或 CSP `frame-ancestors` 时，iframe 区域会空白；这是浏览器
  拒绝嵌入，不是本插件报错。
- 外部 iframe 的内容与站点主题、亮暗模式、路由互不影响；跨源页面也没有可配合的代码。
- 命中页不渲染官方 `DocItem/Metadata`，浏览器标签页标题与 `<meta name="description">` 退回
  站点默认值，不读该页的 `title:` / `description:`。
- 承载 iframe 的容器会通过 `.container:has(iframe)` 去掉内边距；正文里手写的 iframe 同样命中
  这条样式。
- 对应插件未安装时，frontmatter 里的键不生效，页面按普通文档渲染（那一层根本不会交页）。
- 三条 API 层写了布尔键却没给 spec 地址（`oas3:` / `aas3:`）时同样不生效（那一层出不了框），
  这一条有开发模式的告警；键写成非布尔值（老写法把地址写进 `scalar:`）也不生效，告警由
  component-page 那条通用判据说。

## 相关文档

- 本包是基础设施链最上面的一格（依赖下一格 `theme-component-page` 把页挂上去）；最下面是
  解析器包。三格的规矩写在仓库根 `README.md` 的「基础设施包」一节。
- [维护者文档](./docs/internals.md)：包内组成、编译方式、新增一条 API 层的步骤。
- [跨 iframe 协议](./docs/iframe-protocol.md)：地址与亮暗同步的消息形状、两侧的监听。
- [iframe 示例](./docs/iframe-demo.md)。
