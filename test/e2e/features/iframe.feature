# 命中 frontmatter 的 `iframe: <地址>` 后，这一层把**正文区**换成那个页面：
# 文档外壳照旧，中间那一格给了被嵌的页面。
Feature: theme-iframe

  Scenario: 命中页把正文区换成目标页面
    Given 我打开 iframe 示例页
    Then 页面上有一个 iframe
    And 它指向本站的 markmap 示例页
    And 被嵌的那一页在框里真的渲染出来
    And 外层文档的外壳照旧，面包屑指回本页
    And 正文区确实被换掉了
    And 浏览器里没有运行期错误
