# 命中 frontmatter 的 `redoc: <地址>` 后，这一层整页交给 Redoc：
# 不包下层 `DocItem`，所以这一页没有文档正文外壳；样式不做构建期圈定（原因见包 README）。
Feature: theme-redoc

  Scenario: 命中页整页交给 Redoc，导航与详情都在同一页里走
    Given 我打开 redoc 示例页
    Then Redoc 接管了这一页，读的是本站那份 yaml
    And Redoc 自己的 404 没有出现
    When 我点开 Redoc 左栏的 orders 分组
    Then 三个接口都在 Redoc 的左栏里
    When 我点开 Redoc 左栏里新建订单那条接口
    Then 详情面板换成那条接口
    And 代码块里的复制按钮还在
    And 这一页没有文档正文外壳
    And 正文容器在这一页让位
    And 左栏占满 navbar 以下那一屏
    And Redoc 自己那颗亮暗切换按钮不出现
    And Redocly 的署名不出现，同一格里的收起侧栏还在
    And 章节标题旁那一整格操作按钮不出现
    And Redoc 外溢到站点元素的只剩那一条
    And 圈定没有把 Redoc 自己的样式压掉
    And 站点自己的那几处样式不被 Redoc 改写
    And 浏览器里没有运行期错误

  # Redoc 把选中的接口写进地址栏的 hash 那一段（`/redoc-demo#/orders/createorder`）。
  # hash 不参与取文件，所以这条地址指的就是这一页自己的那份 html —— 整页加载它回 200，
  # 别人把这条地址转发出去、别人收藏它，都成立（口径与理由见包 README 的「深链」一节）。
  Scenario: 那条接口的地址在静态产物里也打得开
    Given 我直达 redoc 那条接口的地址
    Then Redoc 接管了这一页，读的是本站那份 yaml
    And Redoc 自己的 404 没有出现
    And 那条接口从地址里也认得出来
    And 这一页没有文档正文外壳
    And 正文容器在这一页让位
    And 左栏占满 navbar 以下那一屏
    And 浏览器里没有运行期错误

  # Redoc 自带一套亮暗模式：按操作系统的偏好判定，把 `light` / `dark` 写进 `<html>` 的类名，
  # 它那 60 来条暗色规则全挂在 `:root.dark` 上。站点自己也有亮暗开关（`<html data-theme>`），
  # 两处各切各的就打架 —— 实测「站点亮色 + 操作系统深色」时这一页会自己变暗。本层把暗色表
  # 改挂在站点那个开关上（口径与理由见包 README 的「亮暗模式」一节），这一条用例钉的就是
  # 「跟站点、不跟操作系统」。
  #
  # 最后那一句把「站点这一侧不受影响」在暗色下也量一遍：改挂之后，站点一进暗色就会激活
  # Redoc 那 330 条暗色变量，这是亮色用例碰不到的一格。
  Scenario: 亮暗模式跟站点走，不跟操作系统走
    Given 我按操作系统的深色偏好打开 redoc 示例页
    Then 站点的亮暗模式不受操作系统影响
    And Redoc 的配色不跟操作系统走
    When 我把站点切成暗色
    Then Redoc 的配色跟着站点翻过去
    # 上一条自己把站点又翻回了亮色（它靠「两头各量一次」判「跟着翻」），这里再切一次暗色。
    When 我把站点切成暗色
    Then 站点自己的那几处样式在暗色下也不被 Redoc 改写
