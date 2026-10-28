# AsyncAPI 走 `aas3:`（OpenAPI 走 `oas3:`）：这一把给的也是一个**地址**，本层不判断它指向哪一份
# 文档 —— 判据在渲染器那边（按文档根上那个 `openapi` / `asyncapi` 字段分派）。这一份 feature 钉的
# 就是这件事：给一份 **AsyncAPI 3.0.0** 文档，`theme-redoc` 与 `theme-scalar` 两层照样在框里把它
# 渲染出来。
#
# 形状与 OpenAPI 那一族一样（整页交给一个框，渲染器整个跑在框内那份文档里），但地址与形状
# 三处都换了：框的 `src` 带的是那份 AsyncAPI 夹具、框里那份文档是通道 / 操作 / 消息、hash 段
# 两层各按各的写法（Redoc 有前导斜杠、Scalar 没有）。口径见
# `packages/theme-iframe/docs/iframe-protocol.md` 的「注册表与分发」一节。
Feature: AsyncAPI 文档

  Scenario: redoc 那一层把 AsyncAPI 3 文档渲染出来
    Given 我打开 redoc 的 AsyncAPI 示例页
    Then 这一页放的是一个 iframe，指向 redoc 那条 AsyncAPI 页面
    And Redoc 在框里渲染的是那份 AsyncAPI 文档
    And Redoc 左栏里摆的是那条通道
    And Redoc 那一格下载不出现
    And Redoc 自己那颗亮暗开关不出现
    And Redoc 那条署名不出现，同一格里的收起侧栏还在
    And 章节标题旁那一整格操作按钮不出现
    When 我点开 Redoc 左栏里的那条通道
    Then Redoc 的详情面板换成那条通道，外层地址也跟着换
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误

  Scenario: scalar 那一层把 AsyncAPI 3 文档渲染出来
    Given 我打开 scalar 的 AsyncAPI 示例页
    Then 这一页放的是一个 iframe，指向 scalar 那条 AsyncAPI 页面
    And Scalar 在框里渲染的是那份 AsyncAPI 文档
    And Scalar 左栏里摆的是那条通道
    And Scalar 那一格下载不出现
    And Scalar 自己那颗亮暗开关不出现
    And Scalar 那条署名不出现，左栏那一格还在
    When 我点开 Scalar 左栏里的那条通道
    Then Scalar 的详情面板换成那条通道，外层地址也跟着换
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误
