---
id: stoplight-demo
sidebar_position: 4
title: API 文档示例
description: 'frontmatter 写 oas3: <URL>，整页换成一个 iframe，框里用 Stoplight Elements 渲染 API 文档。'
# 命中 theme-stoplight 那一层：整页换成一个 iframe，Elements 跑在本包自己那条 /stoplight-view 页面上。
# /openapi.yaml 由仓库根的 static/ 在构建时复制到站点根，不依赖外网。
oas3: /openapi.yaml
---

# API 文档示例

下面这些正文在渲染后的页面上**看不到**：theme-iframe 那一份 `DocItem` 按注册表命中 `oas3` 时
把整个 `DocItem` 换成 iframe，
整页换成一个 iframe，所以也没有文档外壳、不会再有导图。这一段是给读仓库源文件的人看的。

- 取的是 `static/openapi.yaml`（构建产物里的 `/openapi.yaml`）：与 Redoc 那页同一份输入，
  为的是两个渲染器能横向比对，也保证离线就能看完整渲染。
- **Elements 不在这一页里渲染，而在另一份文档里**：这一页放的是一个
  `<iframe class="api-frame stoplight-frame" src="/stoplight-view?src=%2Fopenapi.yaml">`，`/stoplight-view`
  是本包自己注册的一条插件路由，构建产物里真的有一份 `build/stoplight-view/index.html`。框里那份
  文档装的是 Elements 的运行时代码、它自己的路由、它写的 localStorage，站点的文档页都碰不到。
- **这一层比 Redoc 那层多做一步：那份样式表不进站点的 css**。Redoc 的样式是运行时插进它自己那份
  文档的，而 Elements 的样式是一张静态文件（`@stoplight/elements/styles.min.css`）——站点只有
  **一份**全站 css，每个页面都 `<link>` 同一个文件，iframe 拦不住这种静态样式。所以本包的入口在
  构建配置期把这一条路径改成「当一个独立文件发出去」，产物里是
  `assets/css/styles.min.<hash>.css`，只由框内那份文档挂一条 `<link>`。那文件里有 20 条不带前缀的
  全局规则（`html`、`body`、`a`、`h1`–`h6`、`button`、`ol,ul`…），以前它们进全站那一份时实测把
  站点 `<html>` 的字体换成了 Inter、主页 `h1` 压到 `16px`、正文链接没了下划线；现在站点那一份 css
  里一条 Elements 的规则都没有。口径与依据记在 `theme/theme-stoplight/README.md` 的「样式」一节
  （站点文档源只收 `docs/`，链接出去只会是死链）。
- **点进接口后的地址也能分享**：能发给别人的地址**还是这一页自己的** ——
  `/stoplight-demo#/operations/createOrder`。地址栏里 `#` 那一段由框里那份文档报给外层（Elements
  换接口走 `history.pushState`，`hashchange` 收不到），整页加载一条深链时反过来由框里向外层要一次
  再写进自己的地址；写外层地址用的是替换，所以框里换一条接口不会在浏览器历史里多出一格。hash 段
  不参与取文件，浏览器请求的还是这一页那份 html，`pnpm serve` 回 **HTTP 200**。要说清两点：每条
  接口在产物里**没有自己的 html**；`/stoplight-view?src=…` 虽然也能直接打开，但那是「框里那一页
  本身」，不是拿来分享的地址。
- **亮暗模式跟站点那个开关走，不跟操作系统走**：Elements 那套配色自己也有亮暗（判据存在它自己的
  localStorage 存档里），而它用的那条属性和站点的是同一个名字，所以本层只要把站点当前那一格送进
  框内、写在那份文档自己的 `<html>` 上就够了；框内那份文档不套站点的任何外壳与 provider，也不读
  那份存档。实测送进来的值压得过 Elements 自己的存档，两边不会打架。
- **滚动条长在框里**：外层那一页不滚（框占满 navbar 以下那一屏，页脚收掉），框内那一份文档自己滚，
  所以这一页没有「正文跟着页面滚」那种观感；键盘要先落到框里才能用方向键。
- 左栏底部那条「Powered by Stoplight」与「Try it」面板里那颗发送按钮收掉了（用的是
  `display: none`，元素仍在 DOM 里）；「Export / Download」那一格是 Elements 真读的配置，用配置关的。
- 组件只在浏览器端渲染（服务端那一遍返回 `null`），所以 `build/stoplight-demo/index.html` 里除了
  那个 iframe 标签之外是空的，框内那份 html 也一样；要看结果得 `pnpm build && pnpm serve`。
- 命中的是文档页，站点的侧栏仍然在那一列里（框只占正文那一格）。要连侧栏一起让位，用 `iframe:` 那一层。

同一页同时写 `oas3:` 与 `redoc:` 时，redoc 那层在外，本层不出现。
