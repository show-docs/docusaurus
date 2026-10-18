# 命中 frontmatter 的 `oas3: <地址>` 后，这一层整页交给 OpenAPI 渲染器：
# 不包下层 `DocItem`，所以这一页没有文档正文外壳；样式全靠入口那一步圈进自己的容器。
Feature: theme-stoplight

  Scenario: 命中页整页交给 OpenAPI 渲染器，样式不外溢
    Given 我打开 stoplight 示例页
    Then OpenAPI 渲染器接管了这一页，读的是本站那份 yaml
    When 我展开左栏的 orders 分组
    Then 三个接口都在导航里
    When 我点开新建订单那条接口
    Then 地址跳到那条接口，标题换成它的名字
    And 这一页没有文档正文外壳
    And Stoplight 的样式都圈在自己的容器里
    And 浏览器里没有运行期错误
