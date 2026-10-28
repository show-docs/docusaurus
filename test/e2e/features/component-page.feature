# 这一层自己不带组件：清单里那一条由站点配置给（本站指向 `src/theme/ComponentPageDemo`）。
# 命中 `componentPage: true` 的那一页，整个 `DocItem` 换成清单里那个组件 —— 文档正文外壳
# （面包屑、正文、翻页、右侧目录）一并不要，站点的页脚照旧。
Feature: theme-component-page

  Scenario: 命中那把键的页整页交给站点配置的组件
    Given 我打开组件接管示例页
    Then 这一页摆出组件从配置里拿到的标题
    And 它把命中的键值与这一页的标题都送进组件
    And 这一页没有本页 markdown 的正文
    And 这一页没有文档正文外壳
    And 这一页有站点的页脚
    And 浏览器里没有运行期错误

  # 落空 = 透明：这一层套在其余各层外面，不命中时一个字都不改。
  Scenario: 没写那把键的页照常是文档页
    Given 我打开 markmap 示例页
    Then 这一页的文档正文外壳还在
    And 这一页有站点的页脚
    And 浏览器里没有运行期错误
