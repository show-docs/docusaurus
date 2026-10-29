# @show-docs/docusaurus-theme-iframe

把文档页整页替换成 iframe 的 Docusaurus 主题插件。frontmatter 写 `iframe:`、`scalar: true`、
`redoc: true` 或 `stoplight: true` 时，命中的页面保留站点 navbar，正文区换成一个 iframe。

`iframe:` 由本包直接处理，用来嵌外部页面；`scalar:` / `redoc:` / `stoplight:` 分别由
theme-scalar、theme-redoc、theme-stoplight 在框内渲染，本包负责外层套壳与跨 iframe 的地址、
亮暗同步。

**用哪一层渲染**与**渲染哪份文档**是两件事：前者由那三把布尔键决定（`scalar: true`……），
后者由 spec 键决定 —— `oas3:` 摆 OpenAPI、`aas3:` 摆 AsyncAPI 3（三条 API 层读同一组，按顺序
取第一把非空地址）。两把 spec 键与 `iframe:` 无关：`iframe:` 嵌的是外部页面，地址自带。

## 安装

`@theme-prev/*` 的别名由解析器插件提供，两个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-iframe
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@show-docs/docusaurus-theme-iframe'
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
把键时，按顺序取第一个命中的已安装层。开发模式下，写了键却没有层接收会在控制台给出告警
（键的形状不对、没给 spec 地址、只给了 spec 地址没写用哪一层、两把 spec 键同时写，各给一条）。

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
- 三条 API 层写了布尔键却没给 spec 地址（`oas3:` / `aas3:`）时同样不生效（那一层出不了框）；
  键写成非布尔值（老写法把地址写进 `scalar:`）也不生效。两种都有开发模式的告警。

## 相关文档

- 本包是基础设施链最上面的一格：单独装上就能用 `iframe:` 换整页；下面那格
  `theme-component-page` 是「整页交给一个组件」的一般形态，最下面是解析器包。三格的规矩写在
  仓库根 `README.md` 的「基础设施包」一节。
- [维护者文档](./docs/internals.md)：包内组成、编译方式、新增一条 API 层的步骤。
- [跨 iframe 协议](./docs/iframe-protocol.md)：地址与亮暗同步的消息形状、两侧的监听。
- [iframe 示例](./docs/iframe-demo.md)。
