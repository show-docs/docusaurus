# 命中 frontmatter 的 `redoc: <地址>` 后，这一层整页换成**一个 iframe**：Redoc 跑在本包自己
# 那条插件路由（`/redoc-view`）上的一份独立文档里，它的运行时代码、它往 `<head>` 插的那张样式表、
# 它的 localStorage 与它自己的路由都关在框内，站点的文档页一行都碰不到（口径见包 README）。
Feature: theme-redoc

  Scenario: 命中页整页交给 iframe，Redoc 在框里渲染
    Given 我打开 redoc 示例页
    Then 这一页放的是一个 iframe，指向本包那条独立页面
    And Redoc 在框里接管了这一屏，读的是本站那份 yaml
    And Redoc 自己的 404 没有出现
    When 我点开 Redoc 左栏的 orders 分组
    Then 三个接口都在 Redoc 的左栏里
    When 我点开 Redoc 左栏里新建订单那条接口
    Then 详情面板换成那条接口
    And 代码块里的复制按钮还在
    And 这一页没有文档正文外壳
    And 正文容器在这一页让位
    And 框占满 navbar 以下那一屏
    And 框里的左栏占满整屏
    And Redoc 自己那颗亮暗切换按钮不出现
    And Redocly 的署名不出现，同一格里的收起侧栏还在
    And 章节标题旁那一整格操作按钮不出现
    And 外层文档里没有 Redoc 的运行时样式表
    And 站点自己的那几处样式不被 Redoc 改写
    And 浏览器里没有运行期错误

  # 能发给别人的是**外层**那条地址：`/redoc-demo#/orders/createorder`。hash 段不参与取文件，
  # 浏览器请求的还是这一页自己的那份 html，所以整页加载它回 200；页面起来之后，那一段由框里
  # 那句 ready 换进框内那份文档（为什么不是外层在 iframe 的 load 事件上推，见包 README 的
  # 「深链」一节）。
  Scenario: 那条接口的地址在静态产物里也打得开
    Given 我直达 redoc 那条接口的地址
    Then Redoc 在框里接管了这一屏，读的是本站那份 yaml
    And Redoc 自己的 404 没有出现
    And 那条接口从地址里也认得出来
    And 这一页没有文档正文外壳
    And 正文容器在这一页让位
    And 框占满 navbar 以下那一屏
    And 浏览器里没有运行期错误

  # Redoc 自带一套亮暗模式：按操作系统的偏好判定，把 `light` / `dark` 写进它那份文档的
  # `<html>` 类名上，它那 60 来条暗色规则全挂在 `:root.dark` 上。站点自己也有亮暗开关
  # （`<html data-theme>`），两处各切各的就打架 —— 实测「站点亮色 + 操作系统深色」时这一页会
  # 自己变暗。本层把暗色表改挂在框内那份文档自己的 `<html data-redoc-mode>` 上（见包 README 的
  # 「亮暗模式」一节）；那个值写在**外层**文档上，要靠本层那条 postMessage 通道送进框内 ——
  # 框里那份文档不挂站点的 color mode provider，见 `components/redoc-frame.tsx`。
  Scenario: 亮暗模式跟站点走，不跟操作系统走
    Given 我按操作系统的深色偏好打开 redoc 示例页
    Then 站点的亮暗模式不受操作系统影响
    And Redoc 的配色不跟操作系统走
    When 我在框里那份文档上做个记号
    And 我把站点切成暗色
    Then 框里的配色跟着站点翻过去，那份文档没有重新加载
    And 站点自己的那几处样式在暗色下也不被 Redoc 改写

  # 框内那条地址本身也是站点的一条页面：带着 `src` 就能独立打开（调试、别人点到它），
  # 缺了 `src` 就什么都不摆 —— 它不该把 Redoc 那份「No page at this address」摆出来。
  Scenario: 框内那条地址带着地址能独立打开，缺了就什么都不摆
    Given 我直接打开框内那条地址
    Then 这一页直接渲染 Redoc
    And 这一页没有站点的 navbar
    When 我把地址里那一段 spec 去掉
    Then 这一页什么都不摆
    And 浏览器里没有运行期错误
