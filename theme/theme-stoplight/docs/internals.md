# theme-stoplight 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、构建期那一步怎么做的、各处实测到的数字与取值、
哪些做法试过不行。使用者要看的（怎么触发、能分享的地址长什么样、有哪些局限）在
[`README.md`](../README.md)，这里不重复。

源码注释里那些「理由见包 README『…』一节」的指针，落在本节这些章节上的已经改指这份文件。

## 组成

| 文件                            | 编译吗              | 职责                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`                 | ✅ `src/` → `dist/` | 入口：调 `@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts` 那份工厂一次，拿层目录、`/stoplight-view` 的注册与 Plugin 形状；本包的 webpack 差异经 `configureWebpack` 交给它，干两件事（把 Elements 那份 css 拆成独立产物 + 补浏览器 bundle 缺的 Node 侧依赖） |
| `theme/StoplightPage/index.tsx` | ❌ 站点编译         | **框内**那一页：调 theme-iframe 那份框内工厂（`lib/api-frame-view.tsx`）交三格 —— 包名、`StoplightUI`、亮暗的属性名；本包的 CSS 由 `stoplight-ui.tsx` 那一句 import 带进 bundle                                                                                         |
| `components/stoplight-ui.tsx`   | ❌ 站点编译         | 浏览器端渲染 `API`（只收地址那一种入参），外面套 `HashRouter`；`LocationMirror` 把路由变化报给外层；那条 `<link>` 挂 Elements 的样式表                                                                                                                                  |
| `components/stoplight-ui.css`   | ❌ 站点编译         | 生效在框内那一页：给 `.stoplight-root` 定高、把站点主题加在 Elements 子树上的几处默认样式还原、收掉署名与那颗发送按钮、滚动条配色沿用站点                                                                                                                               |
| `tsconfig.build.json`           | ——                  | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                                                                                                                                                                                                                  |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

跨 iframe 的那一套（外层套壳、地址怎么拼、三条消息的形状、来源校验、两侧的监听）**不在本包**，
在 `@show-docs/docusaurus-theme-iframe`：外层归它的 `DocItem` 与 `components/api-frame.tsx`，
约定归 [`lib/`](../../theme-iframe/lib/index.ts)（口径见 [`iframe-protocol.md`](../../theme-iframe/docs/iframe-protocol.md)）；本包交出的只有注册表里那个命名空间。
为什么两侧各推一次消息、为什么框内 → 外层不听 `hashchange`，那份理由记在共享层的文档，
不在这里抄第二遍。

## 两份文档各放什么

|                   | 外层：站点的文档页（`/stoplight-demo`）                                                         | 框内：本包那条页面（`/stoplight-view?src=…`）         |
| ----------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 本层放的东西      | 一个 `<iframe class="api-frame stoplight-frame">`（由 theme-iframe 的 `ApiFrame` 按注册表渲染） | `StoplightUI`，即 `.stoplight-root` 那一格            |
| Elements 的运行时 | 不加载，一行都没有                                                                              | 全在这里                                              |
| 样式表            | 站点的产物 CSS（不含 Elements 那份）                                                            | 站点的产物 CSS + **一条 `<link>` 指向 Elements 那份** |
| 亮暗模式          | 站点的 `<html data-theme>`，开关在这                                                            | 自己 `<html>` 上的 `data-theme`，值由外层送来         |
| 能分享的地址      | 有，`#` 那一段代表当前那条接口                                                                  | 有，但那是「直接打开框里那一页」，见下面「深链」      |

## 上一版的做法（prefixwrap）为什么换掉

上一版是 Elements 直接渲染在文档页里，靠构建期把它的样式逐条圈进 `.stoplight-root`
（`configurePostCss()` + `postcss-prefixwrap`）。圈定能收的只有「一条规则打到哪些元素」这一层，
收不到的有几处：`body` 与 `:root` 上那批变量、它自己的路由（换一条接口就改整份文档的地址）、
`@stoplight/mosaic` 往 localStorage 写的那份存档、它按整份文档用的 `document.querySelector`。

换成 iframe 之后，DOM、路由、localStorage 那三样由浏览器给的文档边界负责：框里那份文档整份就是
给 Elements 的（`theme/StoplightPage/index.tsx` 就是 theme-iframe 那份框内工厂造出的一页，
没有 navbar、没有 footer、
没有正文容器），站点的文档页一行都碰不到。**唯独样式表不是** —— 见「样式」一节，那一格要靠构建期处理，
圈定那条路本来也到不了它（它不在文档页里了）。

## `/stoplight-view` 这条路由怎么注册

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

那张表里有一批不带 `.sl-` 的全局规则（`html`、`body`、`*`、`:root`、`a`、`h1`–`h6`…）。要说清这一格
威胁的不是「框里的样式打到框里的内容」—— 那有文档边界管着，不成问题 —— 而是**外层每一条页面**都
`<link>` 同一份文件，站点的壳跟着一起被它改。所以这一处非在构建期动手不可，iframe 那份边界替不了它。

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
的痕迹」与「Elements 那份样式表只挂在框里」量的东西，另有「站点自己的那几处样式不被 Elements
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
路径上根本执行不到，细节见它的维护者文档。）

**② 裸的全局 `process`** —— `@stoplight/json-schema-ref-parser` 的 `lib/util/url.js` 与
`lib/resolvers/http.js` 里写的不是 `require('process')`，而是直接取 `process.browser` /
`process.cwd()` / `process.platform`。`resolve.fallback` 只按**模块 id**筛，管不到自由变量，
所以浏览器里求值这个 chunk 就 `ReferenceError: process is not defined`（构建期不报，
只有页面打开时看得到）。补法是 `ProvidePlugin`：把 `process` 这个标识符在每个模块作用域里换成
对 `process/browser` 的 require，同一份路径也进 `resolve.fallback`。插件构造函数取自
`configureWebpack` 第三个参数的 `utils.currentBundler.instance`（官方就是用它自己的
`DefinePlugin`，这样不必把 `webpack` 声明成本包依赖）。

> 那份 shim 只给 `process.env` / `nextTick` / `cwd()`（返回 `/`），**没有** `process.browser`
> —— 取到 `undefined`，那几个分支走非浏览器一侧。示例页用的是站点根绝对路径 `/openapi-stoplight.yaml`，
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
判据就是那两句「Elements 那一格也收到站点送进来的暗色」与「暗色不是 Elements 自己那份存档选的」：
切成暗色后 `<html data-theme>` 是 `dark`，`localStorage['mosaic-theme']` 里仍然是 `light`。

框内那份文档 `<html>` 上的信号，实测两格取值：亮色是 `--canvas-l: 100%` /
`--color-text-primary: #0081cc` / 底色 `transparent`，暗色翻成 `8%` / `#66c7ff` / `rgb(27,27,29)`。
用例「亮暗模式跟站点走，不跟操作系统走」先用 `emulateMedia({ colorScheme: 'dark' })` 打开这一页
（要在加载前定下来），钉两份文档都还是亮色；再把站点切成暗色，钉框里翻过去了**而且那份文档没有
重新加载**（判据是它自己的 `performance.timeOrigin` —— 重新加载也能翻对颜色，但会把 Elements 的
展开状态和滚动位置一起冲掉）；最后把站点自己那几处样式在暗色下也按值量一遍。

Elements 这一版没有给用户看的亮暗切换按钮（`theme-redoc` 那边有，收掉了），所以这一格不需要处理。

那条 `mode` 不塞进 iframe 的 `src`：那个地址必须服务端与客户端算出同一个字符串（理由见
[`iframe-protocol.md`](../../theme-iframe/docs/iframe-protocol.md) 的「四个方向各走一条路」一节），
而它会跟着开关变。

## 高度：两侧都要定高，这一点与 theme-redoc 相反

**外层**：框的尺寸、正文容器让位与站点页脚这三条，四条层共用同一份
[`theme-iframe` 的 `components/api-frame.css`](../../theme-iframe/components/api-frame.css)
（`.api-frame` 定高 `calc(100vh - var(--ifm-navbar-height))` + `.container:has(iframe)` 去内边距
与最大宽度 + `.main-wrapper:has(.api-frame) + .footer` 收页脚），本包**不**重复写那三条。
iframe 是一个「尺寸由外面决定」的元素，不给它定高，框就只有一点高、里面那份文档的滚动条也没地方长。

页脚那一格以前是本层独有的一条（写在 `stoplight-frame.css` 里、认注册表给的 `.stoplight-frame`）：
框已经占满 navbar 以下那一屏，页脚留在下面只会被推出可视区，显式收掉与「整页交给 Elements」的观感
一致。站点配上 `themeConfig.footer` 之后实测到那是**这一族共有的**问题 —— `theme-redoc`、
`theme-scalar` 与 `theme-iframe` 自己那三条页，页脚留在框下面多出一条 238px 的空白（那一页因此
能滚 238px，滚到的只有页脚），所以那条规则收进了上面那份共用的里，认四把层都挂的 `.api-frame`；
本包不再有只属于自己的外层规则，`stoplight-frame.css` 随之删掉。判据是共用的那一句
「这一页没有站点的页脚」（四把键的命中页各钉一次），反面一句「这一页有站点的页脚」钉在 markmap
那一页上 —— 缺了反面那句，站点没装配页脚时正面试跑会假绿。

**框内**（`stoplight-ui.css`）：`.stoplight-root` **也**定高，取 `100vh`。这一点与
`theme-redoc` 正好相反，原因是两个渲染器的滚动模型不一样：Elements 自带内层滚动（左栏与右侧正文
各是一条滚动容器），给它套一格固定高度不会凭空多出一层抢滚动的容器；Redoc 按「整份文档跟着滚动」
排版，同样的写法会把它的左栏关进一层会自己滚的容器里（那条实测记在它的维护者文档）。
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

「Export / Download」那一格不用 CSS 收：`API` 的 `hideExport` 是真读的配置（本层在
`components/stoplight-ui.tsx` 的 `shared` 常量里设成 `true`），
本仓的示例文档是站点自己那份 `static/openapi-stoplight.yaml`，导出一份再存回本地没有意义。

## 路由：框内那份文档钉成 hash

Elements 的 `API` 外面套着它自己的 `withRouter`，那个高阶组件按 `useInRouterContext()` 决定
要不要自建一个路由。本层在它外面套一层 `HashRouter`，它就不自建，于是「框里换一条接口」只是
这一份文档里的一次 hash 变化，整份文档不重新加载，而外层那条能分享的地址也不会有人替它请求
一个产物里不存在的 html。

- `react-router-dom` 必须与 `@stoplight/elements-core` 内部用的是**同一个模块实例**，否则那句
  `useInRouterContext()` 读不到这里的 context，它还是会自己再造一个路由；那时框里的地址照样变，
  但本层收不到，外层地址栏就不跟着换。版本线由本包 `package.json` 里那一条
  `"react-router-dom": "^6.30.6"` 钉住，它要和 `elements-core` 自己声明的那一条落在同一份产物上
  （pnpm 的扁平安装在这里帮了忙，但它不是保证 —— 判据就是那句「Elements 的详情面板换成那条接口，
  外层地址也跟着换」）。
- `options` 里那一条 `router: 'hash'` **不再**决定用哪种路由（外面那层 `HashRouter` 才是），它喂
  的是 Elements 的 `RouterTypeContext`：章节标题那颗锚点链接按这一格决定要不要把 `#id` 接在当前
  路径后面（`hash` 那一支会，见它包里的 `LinkHeading`）。
- **不传 `basePath`**：命中 `outerRouter` 那一支时它会被拿去做「从当前路径里剥掉前缀」那一步，
  而这一份文档没有前缀可剥，传了只会让侧栏认不出当前那条接口。

有一条老教训跟着换了对象但依然成立：**渲染器认不出当前地址时一个字都不报**，而是把它自己那份
404 摆在正文区 —— 左栏、搜索框、样式全在，页面看着完全正常，中间写着找不到内容。这一页
`#/operations/createOrder` 那一段是 `operationId` **原样**（大小写不变），与 Redoc 那段全小写的
形状不同，抄错就成了那种「看着正常其实空了」的失败。

## 深链：Stoplight 这一层实测到的形状

能发给别人的是**外层**那条地址：`/stoplight-demo#/operations/createOrder`。hash 段不参与取文件，
浏览器请求的还是这一页自己的那份 html，产物里有它，所以 `pnpm serve` 回 **HTTP 200**。四个方向
各走哪条路、为什么框内 → 外层不听 `hashchange`、为什么外层写地址用 `replaceState`，记在
[`iframe-protocol.md`](../../theme-iframe/docs/iframe-protocol.md) 的「四个方向各走一条路」一节；
这里只留这一层实测到的形状：

- **整页直达一条深链时，正文区第一颗 `h1` 是那条接口的 summary，不是文档标题**：Elements 从地址
  指的那一格往下铺（实测 `/stoplight-demo#/operations/createOrder` 那份文档里 `h1` 就是
  「新建订单」），而先打开这一页再点下去时 `h1` 是「Stoplight 演示 API」。左栏那条 API 标题
  （一颗 `h4`）两种入口都在、且只有一颗，所以「框里真取到了那份 yaml」这一句量的是它，
  不是跟着入口形状变的 `h1`。

## 状态：已接入站点，浏览器里那两份文档都真渲染

`docusaurus.config.mjs` 的 `plugins` 里排在 iframe 之后、redoc 之前（这一条先后现在只影响
`@theme/` 层栈的覆写关系；四把键的判定顺序在 theme-iframe 的注册表默认与站点覆盖里定，与它无关），
站点根的 `package.json` 声明了 `"@show-docs/docusaurus-theme-stoplight": "workspace:^"`，
本包把它声明在 `peerDependencies`（`"@show-docs/docusaurus-theme-iframe": "workspace:^"`，
那份版本契约）。`pnpm build`、`pnpm verify:chain` 与
`pnpm test:e2e` 都绿，层栈里能看到 `theme/theme-stoplight/theme`（只剩 `StoplightPage` 那一格）。

已实测到的（都在 `test/e2e/features/stoplight.feature` 那四条用例里）：

- 外层：`build/stoplight-demo/index.html` 里是
  `<iframe class="api-frame stoplight-frame" src="/stoplight-view?src=%2Fopenapi-stoplight.yaml">`；这一页没有
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

- webpack 的 [Asset Modules](https://webpack.js.org/guides/asset-modules/)（`asset/resource`
  那一格，「样式」一节用的就是它）。
