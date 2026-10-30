---
id: stoplight-demo
sidebar_position: 4
title: API 文档示例
description: 'frontmatter 写 stoplight: true（spec 地址由 oas3: 给），整页换成一个 iframe，框里用 Stoplight Elements 渲染 API 文档。'
# 命中 theme-stoplight 那一层：整页换成一个 iframe，Elements 跑在 theme-component-page 那条通用
# 框内路由 /__component-frame 上。/openapi-stoplight.yaml 由仓库根的 static/ 在构建时复制到站点根，不依赖外网。
stoplight: true
oas3: /openapi-stoplight.yaml
---

# API 文档示例

下面这些正文在渲染后的页面上**看不到**：theme-stoplight 在自己的 `loadContent()` 里把组件
（`@theme/StoplightView`）与那一条规则（键 `stoplight`、`render: 'iframe'`）交给 theme-component-page，
命中时这一页的整个 `DocItem` 换成它那个通用框，
所以也没有文档外壳、不会再有导图。这一段是给读仓库源文件的人看的。

- 取的是 `static/openapi-stoplight.yaml`（构建产物里的 `/openapi-stoplight.yaml`）：frontmatter 的
  `oas3:` 给的就是这个地址，只给这一页用，
  Redoc 与 Scalar 的示例页各取自己那份，三页不再共用同一份输入。
- **Elements 不在这一页里渲染，而在另一份文档里**：这一页放的是一个
  `<iframe class="component-frame" src="/__component-frame/">`。那条地址是 theme-component-page
  自己注册的一条插件路由，**三条 API 层共用同一条**，构建产物里只有一份
  `build/__component-frame/index.html`；框里渲染哪个组件由握手时送进来的登记名（`stoplight`）决定。
  框里那份文档装的是 Elements 的运行时代码、它自己的路由、它写的 localStorage，站点的文档页都碰不到。
- **这一层比 Redoc 那层多做一步：那份样式表不进站点的 css**。Redoc 的样式是运行时插进它自己那份
  文档的，而 Elements 的样式是一张静态文件（`@stoplight/elements/styles.min.css`）——站点只有
  **一份**全站 css，每个页面都 `<link>` 同一个文件，iframe 拦不住这种静态样式。所以本包的入口在
  构建配置期把这一条路径改成「当一个独立文件发出去」，产物里是
  `assets/css/styles.min.<hash>.css`，只由框内那份文档挂一条 `<link>`。要防的不是「框里的样式打到框里
  的内容」（那有文档边界管着），而是这张表里那批不带前缀的全局规则（`html`、`body`、`a`、`h1`–`h6`…）
  跟着全站那一份 css 打到**外层每一条页面**；现在站点那一份里一条 Elements 的规则都没有。
  口径与依据记在 `packages/theme-stoplight/docs/internals.md` 的「样式」一节
  （站点文档源只收 `docs/`，链接出去只会是死链）。
- **点进接口后的地址也能分享**：能发给别人的地址**还是这一页自己的** ——
  `/theme-stoplight/docs/stoplight-demo#/operations/createOrder`。地址栏里 `#` 那一段由框里那份文档报给外层（Elements
  换接口走 `history.pushState`，`hashchange` 收不到），整页加载一条深链时反过来由框里向外层要一次
  再写进自己的地址；写外层地址用的是替换，所以框里换一条接口不会在浏览器历史里多出一格。hash 段
  不参与取文件，浏览器请求的还是这一页那份 html，`pnpm serve` 回 **HTTP 200**。要说清两点：每条
  接口在产物里**没有自己的 html**；`/__component-frame/` 虽然也能直接打开，但那里只有「还没拿到
  数据」那一格 —— 那份数据只有外层文档页能送，它不是拿来分享的地址。
- **亮暗模式跟站点那个开关走，不跟操作系统走**：Elements 那套配色自己也有亮暗（判据存在它自己的
  localStorage 存档里），而它用的那条属性和站点的是同一个名字，所以本层只要把站点当前那一格送进
  框内、写在那份文档自己的 `<html>` 上就够了；框内那份文档不套站点的任何外壳与 provider，也不读
  那份存档。实测送进来的值压得过 Elements 自己的存档，两边不会打架。
- **没给文档地址时框里摆一句说明**：这一页写了 `stoplight: true` 却没写 `oas3:` / `aas3:` 时，命中的
  还是这一层、框照挂，只是框里是本层那句「这一页没给 Stoplight 要渲染的文档」，Elements 自己不挂。
  这一格有个夹具页：[Stoplight 没给文档地址](/theme-stoplight/docs/stoplight-no-spec)。
- **滚动条长在框里**：外层那一页不滚（框占满 navbar 以下那一屏，页脚收掉），框内那一份文档自己滚，
  所以这一页没有「正文跟着页面滚」那种观感；键盘要先落到框里才能用方向键。
- 左栏底部那条「Powered by Stoplight」与「Try it」面板里那颗发送按钮收掉了（用的是
  `display: none`，元素仍在 DOM 里）；「Export / Download」那一格是 Elements 真读的配置，用配置关的。
- 组件只在浏览器端渲染（服务端那一遍返回 `null`），所以 `build/theme-stoplight/docs/stoplight-demo/index.html` 里除了
  那个 iframe 标签之外是空的，框内那份 html 也一样；要看结果得 `pnpm build && pnpm serve`。
- 命中的是文档页，站点的侧栏仍然在那一列里（框只占正文那一格）。要连侧栏一起让位，用 `iframe:` 那一层。

同一页同时写几把键时，赢的是**站点那份 `rules` 清单里排前面的那一条**（本站的顺序见
`docusaurus.config.mjs`：`scalar` → `redoc` → `stoplight` → `iframe`），与各包在 `plugins` 里的声明
先后无关，所以这一页与 redoc 那把键同写时是 redoc 赢。先后这一件事的用例见
`test/e2e/features/frame-precedence.feature`。
