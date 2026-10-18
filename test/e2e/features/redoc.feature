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
    And 这一页没有文档正文外壳
    And 正文容器在这一页让位
    And Redoc 外溢到站点元素的就是那三条
    And 浏览器里没有运行期错误
