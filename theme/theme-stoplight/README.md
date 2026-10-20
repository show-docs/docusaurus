# theme/theme-stoplight

主题包：md 的 frontmatter 写 `oas3: <URL>` 时，该文档页整页换成**一个 iframe**，框里是本包
自己那条页面（`/stoplight-view`），[Stoplight Elements](https://github.com/Stoplight/elements)
渲染的 OpenAPI 文档跑在那一份文档里。

形状与 [`theme-redoc`](../theme-redoc/README.md)、[`theme-scalar`](../theme-scalar/README.md)
是一对一的，而且**外层那一半三家共用一份**：判 `oas3:` 的 `DocItem`、那个 `<iframe>`、地址拼装
与跨文档那两格（地址栏里的 `#` 段与亮暗模式）都住在 [`theme-iframe`](../theme-iframe/README.md)
（键与形状登记在它的 [`lib/api-frame-registry.ts`](../theme-iframe/lib/api-frame-registry.ts)，
口径见 [`docs/iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)），本包只剩入口那一次
工厂调用与**框内那一页**。**差的也是同一处来源**：Redoc 的样式
由 styled-components 在运行期插进它自己那份文档的 `<head>`，Elements 的是一份**静态样式表** ——
而站点只有全站那一份 css，每个页面都 `<link>` 同一个文件，iframe 拦不住它。所以这一层多做了
一步构建期处理（见「样式」一节），那是本包入口里唯一 `theme-redoc` 没有的事。

## 组成

| 文件                             | 编译吗              | 职责                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                  | ✅ `src/` → `dist/` | 入口：调 `@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts` 那份工厂一次，拿层目录、`/stoplight-view` 的注册与 Plugin 形状；本包的 webpack 差异经 `configureWebpack` 交给它，干两件事（把 Elements 那份 css 拆成独立产物 + 补浏览器 bundle 缺的 Node 侧依赖） |
| `theme/StoplightPage/index.tsx`  | ❌ 站点编译         | **框内**那一页：调 theme-iframe 那份框内工厂（`lib/api-frame-view.tsx`）交三格 —— 包名、`StoplightUI`、亮暗的属性名；这一句 import 也是 `stoplight-frame.css` 进全站 bundle 的唯一通道                                                                                  |
| `components/stoplight-frame.css` | ❌ 站点编译         | **只属于本层的那一条**：页脚收掉（见「高度」一节）。框定高与正文容器让位不在这份里，四条层共用 theme-iframe 那份 `components/api-frame.css`；类名 `stoplight-frame` 取自注册表                                                                                          |
| `components/stoplight-ui.tsx`    | ❌ 站点编译         | 浏览器端渲染 `API`（只收地址那一种入参），外面套 `HashRouter`；`LocationMirror` 把路由变化报给外层；那条 `<link>` 挂 Elements 的样式表                                                                                                                                  |
| `components/stoplight-ui.css`    | ❌ 站点编译         | 生效在框内那一页：给 `.stoplight-root` 定高、把站点主题加在 Elements 子树上的几处默认样式还原、收掉署名与那颗发送按钮、滚动条配色沿用站点                                                                                                                               |
| `module-aliases.d.ts`            | 类型                | 引官方 `@docusaurus/module-type-aliases`，给 `useIsBrowser` 与 `*.css` 这些构建期才存在的 import 补类型                                                                                                                                                                 |
| `tsconfig.build.json`            | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                                                                                                                                                                                                  |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

跨 iframe 的那一套（外层套壳、地址怎么拼、三条消息的形状、来源校验、两侧的监听）**不在本包**，
在 `@show-docs/docusaurus-theme-iframe`：外层归它的 `DocItem` 与 `components/api-frame.tsx`，
约定归 [`lib/`](../theme-iframe/lib/index.ts)（口径见 [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)）；本包交出的只有注册表里那个命名空间。
为什么两侧各推一次消息、为什么框内 → 外层不听 `hashchange`，那份理由记在共享层的文档，
不在这里抄第二遍。

## 怎么用

```md
---
title: 订单 API
oas3: /openapi.yaml
---
```

命中时整页换成那一个 iframe，**不包下层 `DocItem`**（判键与替换都发生在 theme-iframe 那一份
`DocItem` 里，与 redoc / scalar / `iframe:` 同一落点），所以那一页不会有
文档正文外壳、也不会再有导图。要「其它页照常、这页是 API 文档」就是这个位置。

`oas3:` 那个值是**框里那份文档去取哪个地址**，它被编码进 iframe 的 `src`
（`/stoplight-view?src=%2Fopenapi.yaml`）。

框内那一格的入参只有地址这一种（`StoplightUI` 的 `Props` 是 `url` + `onRouteChange`）：
`@stoplight/elements` 的 `APIProps` 本来是「给地址」与「给内联文档」两支的并集（两个 prop 同时
出现谁都不落，所以原先按并集写、组件里按 `url` 分叉），而本层唯一的入参来自 `frontMatter.oas3`，
那是个地址，内联那一支从来没有调用方 —— 已经删掉，[`theme-redoc` 的
`RedocUI`](../theme-redoc/README.md) 那一份同形同判、一起删的。

## 渲染放在独立页面，文档页只嵌它

上一版是 Elements 直接渲染在文档页里，靠构建期把它的样式逐条圈进 `.stoplight-root`
（`configurePostCss()` + `postcss-prefixwrap`）。圈定能收的只有「一条规则打到哪些元素」这一层，
收不到的有几处：`body` 与 `:root` 上那批变量、它自己的路由（换一条接口就改整份文档的地址）、
`@stoplight/mosaic` 往 localStorage 写的那份存档、它按整份文档用的 `document.querySelector`。

换成 iframe 之后，DOM、路由、localStorage 那三样由浏览器给的文档边界负责：框里那份文档整份就是
给 Elements 的（`theme/StoplightPage/index.tsx` 就是 theme-iframe 那份框内工厂造出的一页，
没有 navbar、没有 footer、
没有正文容器），站点的文档页一行都碰不到。**唯独样式表不是**——见下一节，那一格要靠构建期处理，
圈定那条路本来也到不了它（它不在文档页里了）。

|                   | 外层：站点的文档页（`/stoplight-demo`）                                                         | 框内：本包那条页面（`/stoplight-view?src=…`）         |
| ----------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 本层放的东西      | 一个 `<iframe class="api-frame stoplight-frame">`（由 theme-iframe 的 `ApiFrame` 按注册表渲染） | `StoplightUI`，即 `.stoplight-root` 那一格            |
| Elements 的运行时 | 不加载，一行都没有                                                                              | 全在这里                                              |
| 样式表            | 站点的产物 CSS（不含 Elements 那份）                                                            | 站点的产物 CSS + **一条 `<link>` 指向 Elements 那份** |
| 亮暗模式          | 站点的 `<html data-theme>`，开关在这                                                            | 自己 `<html>` 上的 `data-theme`，值由外层送来         |
| 能分享的地址      | 有，`#` 那一段代表当前那条接口                                                                  | 有，但那是「直接打开框里那一页」，见「深链」          |

`/stoplight-view` 是本包入口经 theme-iframe 那份工厂（`lib/api-frame-theme.mts` 的
`contentLoaded`）用 `actions.addRoute()` 注册的一条插件路由，路由名与组件别名都写在 theme-iframe
的注册表里，组件是 `@theme/StoplightPage`（走层栈解析，与本包其它 `@theme/` 覆写同一个口径），
`exact: true`。构建产物里真的有一份 `build/stoplight-view/index.html`，所以 `pnpm serve` 对它回 200。

收拢前路径名在 `src/index.mts` 与 `components/stoplight-frame-sync.ts` 里各写了一份
常量（两边站在编译边界两侧，共享不了，改要一起改）；现在注册表那一份源码两侧同引，**只剩一处**。

## 样式：那份静态样式表怎么只出现在框内那一页

### 全站只有一份 css，iframe 拦不住它

Docusaurus 把每一个 css 导入都并进同一个 `styles` chunk（`splitChunks.styles` 那条
`type: 'css/mini-extract'` 加 `enforce: true`，为的就是不让多份 css 的加载顺序变成不确定的）。
所以 `import '@stoplight/elements/styles.min.css'` **一定**落进全站那一份，产物里每一条页面都
`<link>` 它 —— 实测改造前 `build/stoplight-demo/index.html`、`build/stoplight-view/index.html`
与主页上 `<link>` 的是同一个文件名。iframe 隔的是 DOM、脚本、localStorage 和路由，
静态 CSS 在构建期就写进 html 了，它隔不了。

那份表里有 20 条不带 `sl-` 的裸选择器规则（`html`、`body`、`*`、`:root`、`a`、`h1`–`h6`、`ol,ul`、
`button,input,optgroup,select,textarea`、`iframe`、`table`、`textarea`、`select`、`:focus`…），
进了那一份 bundle 就是整站生效。改造前实测到的症状：`<html>` 的字体被换成它的 `--font-ui`（Inter）、
主页 `h1` 掉到 `16px / 400`、正文里的 `a` 变成继承色且没有下划线、`.markdown ol` 的编号被
`list-style: none` 收掉。

### 改法：别让这个文件进打包

`configureWebpack()` 里给这一条路径加一条 `module.rules`，类型是 webpack 5 的
`asset/resource` —— 文件原样发出去成为一个独立产物，`import` 拿到的是它的**地址**（一个字符串），
由框内那份文档自己挂一条 `<link>`（`components/stoplight-ui.tsx`）。实测产物：

| 产物                                       | 字节    | 内容                                                                                                                |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `build/assets/css/styles.aa2e4d11.css`     | 82,518  | 站点那一份：`.sl-` 只剩 3 处，全部是本包 `stoplight-ui.css` 自己写的、带 `.stoplight-root` 前缀的规则；`Inter` 0 处 |
| `build/assets/css/styles.min.48d2237a.css` | 272,412 | Elements 那一份：只在框内那份文档里被 `<link>`                                                                      |

框内那份文档里那张表实测 2344 条规则（按 `cssRules` 计数，一条 `@media` 算一条）原样生效；
外层那份文档里它的 `<link>` 0 条、`.stoplight-root` 0 个。这就是两条判据「外层文档里没有 Elements
的那份样式表」与「Elements 那份样式表只挂在框里」量的东西，另有「站点自己的那几处样式不被 Elements
改写」按值比（同一批元素在 stoplight 页与主页各算一遍 computed style 比相等，不抄站点该有的值）。

`?url` 行内查询**用不了**：那是 Vite / Rspack 的写法，webpack 5 没有这一条（实测：请求连规则匹配
都没走到，先在包的 `exports` 那一步报 `./styles.min.css?url is not exported`）。这里靠规则匹配，
不靠查询串。

### 加规则之外还要把它从带 loader 的规则里摘出去

两条规则同时命中同一份文件会把 loaders 和资源类型叠在一起（css 被处理两遍）。所以入口除了
`unshift` 那条资源规则，还要遍历每一条**带 `use`** 的规则，把这份文件加进它的 `exclude`。

判据不是抄官方那条 `.css` 规则的正则（版本一变就对不上），而是拿一个假的 Elements 路径
（`/a/node_modules/@stoplight/elements/styles.min.css`）去试每一条规则 —— 真路径同样命中，
pnpm 把它装在 `.pnpm/@stoplight+elements@…\/node_modules/` 下面也一样。官方哪天改了规则的形状，
这一条会失配，症状是产物里少了那个独立 css 文件、样式漏回全站那一份，上面那两句判据会红。

> 两处要留意，都是踩过或核过的：
>
> - **改了 `configureWebpack()` 要 `pnpm clear` 再 `pnpm build`**：webpack 的持久化缓存不认配置函数的
>   改动（同一目录里 `configurePostCss()` 那一版就栽过：第二次构建客户端 chunk 的哈希都没变，
>   shim 根本没进产物）。
> - **这一格改的是传进来的 `config` 本身，返回值仍然只可能是增量**。官方 `applyConfigureWebpack`
>   用 webpack-merge 拼接，数组策略是 concat，返回整体等于把 `rules` 翻倍，症状是「每个
>   `.module.css` 被 css-loader 处理两遍、第二遍拿到的是上一遍的 JS 产物」。这条与
>   `plugins/plugin-prev-layer-resolver` 里「只返回自己那一个 resolver」是同一件事。

`styles.min.css` 里没有 `url()`、没有 `@import`、没有 data URI（实测各 0 处），所以不经 css-loader
也不丢东西 —— 这是这一格能这么拆的前提，Elements 升版若引入 `url()`，得改回 css-loader 那一路。

## 浏览器 bundle 要补的那几格 Node 侧依赖

这一格现在服务的是**框内那份文档**（Elements 整个搬进 `/stoplight-view`，站点的文档页只嵌一个框，
不再加载它），补的还是同一批东西。三种形状：

**① `require('url')` / `require('buffer')`** —— `@stoplight/json-schema-ref-parser` 里
`require('url')`、`@stoplight/yaml-ast-parser` 里 `require('buffer')`。webpack 5 起不再自动补
Node 核心模块，站点构建会直接 `Module not found`。客户端那一遍在 `resolve.fallback` 里配上
`url` / `buffer` 两个 polyfill 包（本包 `dependencies`），服务端原样返回：SSG 跑在 Node 里，
那两个模块本来就有。补的是真 polyfill 不是 `false`：这两个都走在「按 URL 取 spec」那条路上，
置空会在运行时抛。（`theme-redoc` 那边给 `worker_threads` 选 `false` 不矛盾 —— 那一支在本仓这条
路径上根本执行不到，细节见它的 README。）

**② 裸的全局 `process`** —— `@stoplight/json-schema-ref-parser` 的 `lib/util/url.js` 与
`lib/resolvers/http.js` 里写的不是 `require('process')`，而是直接取 `process.browser` /
`process.cwd()` / `process.platform`。`resolve.fallback` 只按**模块 id**筛，管不到自由变量，
所以浏览器里求值这个 chunk 就 `ReferenceError: process is not defined`（构建期不报，
只有页面打开时看得到）。补法是 `ProvidePlugin`：把 `process` 这个标识符在每个模块作用域里换成
对 `process/browser` 的 require，同一份路径也进 `resolve.fallback`。插件构造函数取自
`configureWebpack` 第三个参数的 `utils.currentBundler.instance`（官方就是用它自己的
`DefinePlugin`，这样不必把 `webpack` 声明成本包依赖）。

> 那份 shim 只给 `process.env` / `nextTick` / `cwd()`（返回 `/`），**没有** `process.browser`
> —— 取到 `undefined`，那几个分支走非浏览器一侧。示例页用的是站点根绝对路径 `/openapi.yaml`，
> 所以结果一样；要嵌相对路径的 spec，得再把它显式设成 `true`。

**③ `@stoplight/elements` 的类型** —— 它 `exports` 里没有 `types`，那一格由仓库根 `tsconfig.json`
的 `paths` 补，只影响类型检查，不影响产物。

## 亮暗模式：配色跟站点的开关走，靠的是两条属性正好同名

`@stoplight/elements` 那套配色（底下是 `@stoplight/mosaic`）自己也有亮暗：判据是它存在
localStorage 里那份 `mosaic-theme` 存档，并把 `data-theme` 写到 `<html>` 上，暗色那些变量与规则
本来就挂在 `[data-theme=dark]` 打头的选择器上。站点那个开关写的也是
`<html data-theme="light|dark">` —— **同名**，所以本层不需要像 `theme-redoc` 那样写一个
styled-components 的中间件去改它暗色表的生效条件，只要把「站点当前那一格」搬到框内那份文档的
`<html>` 上就够了。

搬的办法就是共享层那条 `mode` 消息：外层读 `useColorMode()` 送进来，框内 `useInnerFrameSync`
按本层给的属性名（`stoplight-ui.tsx` 的 `COLOR_MODE_ATTRIBUTE = 'data-theme'`）写到自己
`<html>` 上。属性名是本层选的：Elements 认这一条，写上去它的暗色表就地生效，没有第二份样式要维护。

**实测过它会不会跟 mosaic 自己那一份打架**：mosaic 的 `useThemeStore` 会按那份存档写同一条属性，
而存档的默认值是 `light`。把 `mosaic-theme` 手工写成 `dark`、站点切成暗色、再把框内那份文档重新
渲染一遍，结论是站点这一头赢 —— 本层的写发生在它之后，而且这一页没有任何东西去调它那个开关。
判据就是那条「框里的暗色是站点送进来的，不是 Elements 自己那份存档选的」：切成暗色后
`<html data-theme>` 是 `dark`，`localStorage['mosaic-theme']` 里仍然是 `light`。

框内那份文档 `<html>` 上的信号，实测两格取值：亮色是 `--canvas-l: 100%` /
`--color-text-primary: #0081cc` / 底色 `transparent`，暗色翻成 `8%` / `#66c7ff` / `rgb(27,27,29)`。
用例「亮暗模式跟站点走，不跟操作系统走」先用 `emulateMedia({ colorScheme: 'dark' })` 打开这一页
（要在加载前定下来），钉两份文档都还是亮色；再把站点切成暗色，钉框里翻过去了**而且那份文档没有
重新加载**（判据是它自己的 `performance.timeOrigin` —— 重新加载也能翻对颜色，但会把 Elements 的
展开状态和滚动位置一起冲掉）；最后把站点自己那几处样式在暗色下也按值量一遍。

Elements 这一版没有给用户看的亮暗切换按钮（`theme-redoc` 那边有，收掉了），所以这一格不需要处理。

那条 `mode` 不塞进 iframe 的 `src`：那个地址必须服务端与客户端算出同一个字符串（理由见「深链」），
而它会跟着开关变。

## 高度：两侧都要定高，这一点与 theme-redoc 相反

**外层**：框的尺寸与正文容器让位四条层共用一条规则，住在
[`theme-iframe` 的 `components/api-frame.css`](../theme-iframe/README.md)（`.api-frame` 定高
`calc(100vh - var(--ifm-navbar-height))` + `.container:has(iframe)` 去内边距与最大宽度），本包
**不**重复写那两条。iframe 是一个「尺寸由外面决定」的元素，不给它定高，框就只有一点高、里面那份
文档的滚动条也没地方长。

本包自己那条是页脚（`stoplight-frame.css` 挂在注册表给的 `.stoplight-frame` 上，`ApiFrame` 把它
与共用的 `.api-frame` 一起挂在 `<iframe>` 上）：框已经占满 navbar
以下那一屏，页脚留在下面只会被推出可视区，显式收掉与「整页交给 Elements」的观感一致。
`theme-redoc` 与 `theme-scalar` 那两层没有这一条（页脚留着，redoc 那层实测落在可视区之外），
三条 API 层里只有本层收掉它，这一处差别是本层自己的取舍。

**框内**（`stoplight-ui.css`）：`.stoplight-root` **也**定高，取 `100vh`。这一点与
`theme-redoc` 正好相反，原因是两个渲染器的滚动模型不一样：Elements 自带内层滚动（左栏与右侧正文
各是一条滚动容器），给它套一格固定高度不会凭空多出一层抢滚动的容器；Redoc 按「整份文档跟着滚动」
排版，同样的写法会把它的左栏关进一层会自己滚的容器里（那条实测记在它的 README）。
这里的一屏就是**框**那一格的大小，框内那份文档没有 navbar，`--ifm-navbar-height` 在这一页没有
对应的栏，不该从高度里扣掉。

判据两句，各在一份文档上量：外层「框占满 navbar 以下那一屏」（上沿差、下沿差各留 1px 容差），
框内「框里那一屏不留下自己的滚动条」（`.stoplight-root` 上沿贴着那份文档的顶、下沿贴着它的底，
实测两边都是 0px，且那份文档的 `scrollHeight` 等于 `innerHeight` —— 660px，即外层那一格的大小）。

顺带一处：命中的是**文档页**，所以站点的 docs 侧栏仍然在那一列里（实测框的左偏移 300px，就是
侧栏那一列的宽度）。要把整屏连侧栏一起给渲染器，用 theme-iframe 那一层。

## 收掉的两处 Elements 自己的东西

两条都在 `components/stoplight-ui.css`（生效在框内那份文档），都是 `display: none`，所以元素仍留在
DOM 里 —— e2e 那两句按可见性判、不按数量判：

- **左栏底部那条「Powered by Stoplight」** ——
  `.sl-elements-api > div a:last-child[href^='https://stoplight.io']`。认的是它**是什么**
  （那一栏最后一条指向 stoplight.io 的链接），不是它包里的类名。口径与 `theme-redoc` 收 Redocly
  署名那一条相同。
- **「Try it」面板里那颗发送按钮** —— `.SendButtonHolder > div > button:first-of-type`。这一格
  没有可核对的语义标识，只能按 DOM 里的位置认（那一格的最后一颗），哪天 Elements 换了这里的结构
  就收不住，用例「「Try it」面板里那颗发送按钮不出现」会直接红，不会静默失效。另外它只在接口页
  上存在（实测概览那一格 `.SendButtonHolder` 数量为 0，接口页是 1 个、里面那颗是隐藏的），
  所以那句挂在点开接口之后的那一步。

「Export / Download」那一格不用 CSS 收：`API` 的 `hideExport` 是真读的配置（见 `shared` 那一格），
本仓的示例文档是站点自己那份 `static/openapi.yaml`，导出一份再存回本地没有意义。

## 路由：框内那份文档钉成 hash

Elements 的 `API` 外面套着它自己的 `withRouter`，那个高阶组件按 `useInRouterContext()` 决定
要不要自建一个路由。本层在它外面套一层 `HashRouter`，它就不自建，于是「框里换一条接口」只是
这一份文档里的一次 hash 变化，整份文档不重新加载，而外层那条能分享的地址也不会有人替它请求
一个产物里不存在的 html。

- `react-router-dom` 必须与 `@stoplight/elements-core` 内部用的是**同一个模块实例**，否则那句
  `useInRouterContext()` 读不到这里的 context，它还是会自己再造一个路由；那时框里的地址照样变，
  但本层收不到，外层地址栏就不跟着换。版本线由本包 `package.json` 里那一条
  `"react-router-dom": "^6.30.6"` 钉住，它要和 `elements-core` 自己声明的那一条落在同一份产物上
  （pnpm 的扁平安装在这里帮了忙，但它不是保证 —— 判据就是那句「详情面板换成那条接口，外层地址
  也跟着换」）。
- `options` 里那一条 `router: 'hash'` **不再**决定用哪种路由（外面那层 `HashRouter` 才是），它喂
  的是 Elements 的 `RouterTypeContext`：章节标题那颗锚点链接按这一格决定要不要把 `#id` 接在当前
  路径后面（`hash` 那一支会，见它包里的 `LinkHeading`）。
- **不传 `basePath`**：命中 `outerRouter` 那一支时它会被拿去做「从当前路径里剥掉前缀」那一步，
  而这一份文档没有前缀可剥，传了只会让侧栏认不出当前那条接口。

有一条老教训跟着换了对象但依然成立：**渲染器认不出当前地址时一个字都不报**，而是把它自己那份
404 摆在正文区 —— 左栏、搜索框、样式全在，页面看着完全正常，中间写着找不到内容。这一页
`#/operations/createOrder` 那一段是 `operationId` **原样**（大小写不变），与 Redoc 那段全小写的
形状不同，抄错就成了那种「看着正常其实空了」的失败。

## 深链：`#/operations/createOrder` 那一段怎么跨过 iframe

能发给别人的是**外层**那条地址：`/stoplight-demo#/operations/createOrder`。hash 段不参与取文件，
浏览器请求的还是这一页自己的那份 html，产物里有它，所以 `pnpm serve` 回 **HTTP 200**。

四个方向各自的路、两侧各推一次的理由、`replaceState` 与 `popstate` 那两格，都记在
[`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)，本层不抄第二遍。这里只留四条本层专属的：

- **`LocationMirror` 刚挂载那一次不报**：那条「初始位置会把外层深链擦掉」的约定住在共享层，
  见 [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md) 的「四个方向各走一条路」一节。
- **`src` 只由 frontmatter 决定**：深链那一段与亮暗模式都不塞进地址，否则整页加载一条深链时
  SSR 那份 html 与客户端第一次渲染就在这一格上对不上。
- **`/stoplight-view?src=%2Fopenapi.yaml` 本身也是条能直接打开的地址**（产物里有那份 html）。
  它不带外层那段 hash，也不该有人拿它当分享链接 —— 这一条另有用例钉「带着 `src` 就能渲染」
  「缺了 `src` 就什么都不摆」（Elements 拿到取不到的地址会把它自己那份「加载失败」摆在正文区，
  那个观感反而更像坏了，所以缺参数时本层什么都不渲染）。
- **整页直达一条深链时，正文区第一颗 `h1` 是那条接口的 summary，不是文档标题**：Elements 从地址
  指的那一格往下铺（实测 `/stoplight-demo#/operations/createOrder` 那份文档里 `h1` 就是
  「新建订单」），而先打开这一页再点下去时 `h1` 是「主题覆盖演示 API」。左栏那条 API 标题
  （一颗 `h4`）两种入口都在、且只有一颗，所以「框里真取到了那份 yaml」这一句量的是它，
  不是跟着入口形状变的 `h1`。

## 局限

- **每条接口在产物里没有自己的 html**。外层地址是真的，但内容仍然只有
  `build/stoplight-demo/index.html` 一份，接口那一格是框里客户端渲染出来的 —— 爬虫、按状态码判活
  的监控看到的是页面本身，不是那条接口。
- **框里那一页对搜索引擎与抓取工具是不可见的**：iframe 的内容按惯例不算进宿主页面。
  以前 Elements 直接渲染在文档页里时，那一页的文字至少在客户端渲染后是本页面的内容；换成 iframe
  之后这条没了。要对外被检索到的 API 文档，得走能出静态 HTML 的路子。
- **两份文档、两套地址**。外层那条能分享；框内那条是本站的一条公开页面，直接打开也能渲染，
  但它没有同步对象，也不该发给别人。地址栏里能看到的只有外层那一条。
- **滚动条在框里**：外层那一页不滚（实测它的 `scrollHeight` 等于视口高度），框内那一份文档自己滚
  （更准确说是 Elements 那两条内层容器在滚）。键盘焦点要先落到框里才能用方向键。
- **`#` 归 Elements 用**：站点常规那种「正文里某个小标题的锚点」在这一页上不成立。
- **`/stoplight-view` 会进站点地图**：`addRoute` 注册的路由在 Docusaurus 眼里就是一条页面，
  实测 `build/sitemap.xml` 里有它。那一页没有标题、没有描述、`src` 缺着时整屏空白。本站的 `url`
  还是 `https://example.com`（占位），所以这里先只记现象；真要收掉，是在配置的 `sitemap` 那一格里
  按路径过滤。
- **拆样式表那一步绑在 Docusaurus 的规则形状上**：入口是靠「拿假路径去试每一条带 loader 的规则」
  把它摘出 `exclude` 的，官方改了规则写法就会失配，症状是样式漏回全站那一份。它不会静默通过：
  框内那份文档 `<link>` 数量与站点 bundle 里 `.sl-` 的处数两句判据会红。
- **亮暗模式只有一个来源**：框里那份文档自己不判断模式（mosaic 那份存档不参与配色）。直接打开
  `/stoplight-view?src=…` 时那条属性是空的，也就一直是亮色。本站默认是亮色，所以「送达之前先亮
  一下」看不出来；把 `themeConfig.colorMode` 的默认改成暗色就会露那一格亮。
- 收掉的两处是 CSS 收的，不是配置关的：DOM 里仍然有。Elements 升版换了那两处的位置，这两条就收不住，
  用例那两句会直接红。
- 站点根目录得真的有 `static/openapi.yaml` 那种本站可读的 spec；外网 spec 要另配 CORS。

## 状态：已接入站点，浏览器里那两份文档都真渲染

`docusaurus.config.mjs` 的 `plugins` 里排在 iframe 之后、redoc 之前（这一条先后现在只影响
`@theme/` 层栈的覆写关系；四把键的判定顺序在 theme-iframe 的注册表默认与站点覆盖里定，与它无关），
站点根的 `package.json` 声明了 `"@show-docs/docusaurus-theme-stoplight": "workspace:^"`，
本包把它声明在 `peerDependencies`（`"@show-docs/docusaurus-theme-iframe": "workspace:^"`，
那份版本契约）。`pnpm build`、`pnpm verify:chain` 与
`pnpm test:e2e` 都绿，层栈里能看到 `theme/theme-stoplight/theme`（只剩 `StoplightPage` 那一格）。

已实测到的（都在 `test/e2e/features/stoplight.feature` 那四条用例里）：

- 外层：`build/stoplight-demo/index.html` 里是
  `<iframe class="api-frame stoplight-frame" src="/stoplight-view?src=%2Fopenapi.yaml">`；这一页没有
  `<article>` 正文外壳、没有 `.stoplight-root`、没有 Elements 那张表的 `<link>`、控制台干净。
- 框内：左栏三条接口在，点「新建订单」后详情面板换过去，**外层地址栏那一段跟着换**
  （`#/operations/createOrder`）；那张表 2344 条规则在这里生效，`.stoplight-root` 定高占满整屏，
  那份文档自己不滚。
- 样式边界：站点那一份 css 里 `.sl-` 3 处（全是本包自己写的、带前缀那几条）、`Inter` 0 处；
  站点自己的那几处元素在 stoplight 页与主页上算出来的 computed style 相等（亮色、暗色各量一遍）。
- 亮暗：操作系统深色不影响这一页；切成站点暗色后框内 `<html data-theme>` 是 `dark` 而
  `mosaic-theme` 仍是 `light`；翻色时那份文档的 `timeOrigin` 没换数（没重载）。
- 收掉的两处看不见，同一栏里别的东西还在。

顺带记三处不报错的形状：

- **服务端那一遍两份文档都不渲染东西**：外层那份 html 里只有 iframe 标签本身，框内那份是空的
  （theme-iframe 那份框内工厂在非浏览器那一遍返回 `null`，它要读的地址服务端根本没有），那条指向
  Elements 样式表的 `<link>` 也是客户端起来之后才挂上的。
- **`pnpm build` 时控制台会冒一句**
  `[zustand persist middleware] … 'mosaic-theme' … does not contain a 'removeItem' method`：那是
  预渲染 `/stoplight-view` 时求值 Elements 模块树里 mosaic 那个 store 在抱怨（`mosaic-theme` 这个键
  在产物里只由 `@stoplight/elements` 与 `@stoplight/mosaic` 两个包提到，Redoc 不碰它）。不影响产物，
  也不是本仓的代码 —— 本层不读也不写那份存档（「亮暗模式」一节量的是它没盖过站点送进来的值）。
- `@stoplight/elements` 进了懒加载 chunk（实测产物里 `assets/js/564.*.js`，1.9 MB 上下；主页那份
  html 里既没有它也没有 Redoc 那一个 `973.*.js`，也就是没命中的页面不下载它）。theme-iframe 的
  `DocItem` 静态 import 那个框，框本身不含渲染器 —— 渲染器全在框内那条页面里。

> **改了 `configureWebpack()` 记得 `pnpm clear`**：本包的样式表拆分那一格就在里面，实测过缓存
> 不认配置改动的那次（详见「样式」一节那条引用）。

## 没实测到的

`Try it` 面板真发一次请求、`models` 那一类非接口页的渲染、以及相对路径的 spec（`process.browser`
那一格见「浏览器 bundle 要补的那几格 Node 侧依赖」末了那条注）都没试。

## 参考

- [`@stoplight/elements` 仓库](https://github.com/Stoplight/elements) 与
  [文档](https://docs.stoplight.dev/docs/elements/)。
- webpack 的 [Asset Modules](https://webpack.js.org/guides/asset-modules/)（`asset/resource`
  那一格）。
- [`iframe-protocol.md`](../theme-iframe/docs/iframe-protocol.md)：跨 iframe 那三条消息与两侧的监听。
- [`theme-redoc` 的 README](../theme-redoc/README.md)：同一形状的另一条层，样式那一步的差别
  与两处取舍（定高、亮暗）都在这里对照着写。
- [`components/stoplight-ui.tsx`](./components/stoplight-ui.tsx) 的 `Props` 与
  `theme-redoc` 的 `RedocUI` 是同一形状（`url` + `onRouteChange`），两家的入参只有地址那一格。
