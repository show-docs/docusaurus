# 命中 frontmatter 的 `scalar: <地址>` 后，这一层整页换成**一个 iframe**：Scalar 跑在本包自己
# 那条插件路由（`/scalar-view`）上的一份独立文档里。它的运行时代码（Vue 3）、它那份 335K 的
# 样式表、它写的 localStorage 与它自己的路由都关在框内，站点的文档页一行都碰不到
# （口径见包 `docs/internals.md` 的「为什么要换一份文档」一节）。形状与 `theme-redoc` 一对一，
# 差在框内那一页里挂的是 `createApiReference`。
Feature: theme-scalar

  Scenario: 命中页整页交给 iframe，Scalar 在框里渲染
    Given 我打开 scalar 示例页
    Then 这一页放的是一个 iframe，指向 scalar 那条独立页面
    And Scalar 在框里接管了这一屏，读的是本站那份 yaml
    And Scalar 没有报那份文档取不到
    And 三个接口都在 Scalar 的左栏里
    When 我点开 Scalar 左栏里的新建订单那条接口
    Then Scalar 的详情面板换成那条接口，外层地址也跟着换
    And 那条接口的 operationId 也摆在正文里
    And Scalar 代码块里的复制按钮还在
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 框的无障碍标题用的是页面自己的标题 "Scalar 示例"
    And 正文容器在这一页让位
    And 框占满 navbar 以下那一屏
    And Scalar 左栏贴满那一份文档的一屏
    And Scalar 自己那颗亮暗开关不出现
    And Scalar 那条署名不出现，左栏那一格还在
    And Scalar 那颗「问 AI」的按钮不出现
    And Scalar 那颗「试调用」的按钮不出现
    And Scalar 那两颗下载按钮不出现
    And 左栏底部那一颗换成了 API client，不是 MCP 安装入口
    And Scalar 那条开发者工具栏不出现
    And Scalar 那颗「生成 SDK」的按钮不出现
    And 外层文档里没有 Scalar 的痕迹
    And 站点自己的那几处样式不被 Scalar 改写
    And 浏览器里没有运行期错误

  # 能发给别人的是**外层**那条地址：`/theme/theme-scalar/docs/scalar-demo#tag/orders/POST/orders`（Scalar 自己那串 id
  # 的前导就是 `#tag`，**不带**斜杠 —— 与 Redoc 的 `#/orders/…` 不同，写错了它只是不跳，不报错）。
  # hash 段不参与取文件，浏览器请求的还是这一页自己的那份 html，所以整页加载它回 200；页面起来
  # 之后，那一段由框里那句 ready 换进框内那份文档，再经 `scalar-ui.tsx` 那一步
  # `hashchange` → `popstate` 的转发交给 Scalar（为什么不是外层在 iframe 的 load 事件上推，
  # 见 theme/theme-iframe/docs/iframe-protocol.md 的「对齐是两侧各推一次的」一节）。
  Scenario: 那条接口的地址在静态产物里也打得开
    Given 我直达 scalar 那条接口的地址
    Then Scalar 在框里接管了这一屏，读的是本站那份 yaml
    And Scalar 没有报那份文档取不到
    And Scalar 框里摆的是地址里那条接口
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 正文容器在这一页让位
    And 框占满 navbar 以下那一屏
    And 浏览器里没有运行期错误

  # Scalar 自带一套亮暗模式：判据是 `<body>` 上互斥的两个类名（`dark-mode` / `light-mode`），
  # 自己还会把选择写进 localStorage。站点自己另有开关（`<html data-theme>`），两处各切各的就打架。
  # 本层用配置 `hideDarkModeToggle` 收掉它自己那颗按钮，配色改由共享层那条消息驱动那两个类名
  # （见包 `docs/internals.md` 的「亮暗模式」一节）。
  Scenario: 亮暗模式跟站点走，不跟操作系统走
    Given 我按操作系统的深色偏好打开 scalar 示例页
    Then 站点的亮暗模式不受操作系统影响
    And Scalar 那一格收的是站点这一头的亮色，它自己那份类名不写暗色
    And Scalar 的配色不跟操作系统走
    When 我在框里那份文档上做个记号
    And 我把站点切成暗色
    Then 框里的配色跟着站点翻过去，那份文档没有重新加载
    And Scalar 那一格也收到站点送进来的暗色
    And 站点自己的那几处样式在暗色下也不被 Scalar 改写

  # 框内那条地址本身也是站点的一条页面：带着 `src` 就能独立打开（调试、别人点到它），
  # 缺了 `src` 就什么都不摆 —— 它不该把 Scalar 那句「could not be loaded」摆出来。
  Scenario: 框内那条地址带着地址能独立打开，缺了就什么都不摆
    Given 我直接打开 scalar 框内那条地址
    Then 这一页直接渲染 Scalar
    And 这一页没有站点的 navbar
    When 我把 scalar 框内那条地址里的 spec 去掉
    Then Scalar 那一格不出现，那句「取不到」也不出现
    And 浏览器里没有运行期错误
