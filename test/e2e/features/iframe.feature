# 命中 frontmatter 的 `iframe: <地址>` 后，**整个 `DocItem`** 换成这一层交回的那个组件
# （`@theme/ExternalFrame`，`render` 缺省即 `page`，所以那一格是正文里的一个普通组件）：
# 判表与挂载都在 theme-component-page，文档正文外壳（面包屑、正文、翻页、右侧目录）一并不要，
# 站点的 navbar 照旧。
# 地址栏再带一个 `?path=<相对路径>`，换的是嵌进去的那个页面。
# 这一层只认 `iframe:` 这一把键，不认识 `scalar` / `redoc` / `stoplight` 那几把。
Feature: theme-iframe

  Scenario: 命中页整页交给 iframe
    Given 我打开 iframe 示例页
    Then 页面上有一个 iframe
    And 框的无障碍标题用的是页面自己的标题
    And 它指向本站 404 那一页
    And 被嵌的那一页在框里真的渲染出来
    And iframe 占满 navbar 以下那一屏
    And 承载它的容器不留内边距
    And 外层站点的壳还在，navbar 照旧
    And 本页 markdown 的正文一行都不剩
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误

  Scenario: 地址栏带 path 参数时换嵌另一个页面
    Given 我打开 iframe 示例页并带上 path 参数
    Then 它指向本站的 markmap 示例页
    And 被嵌的那一页在框里画出导图
    And 浏览器里没有运行期错误
