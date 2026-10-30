# 这一层是「这一页整页交给谁」的唯一套壳：站点配置里那一列 `rules` 给出先后，各包在自己的
# `loadContent()` 里交回组件与规则。站点自己那一条指向 `src/theme/ComponentPageDemo`，
# 命中 `componentPage: true` 的那一页，整个 `DocItem` 换成那个组件 —— 文档正文外壳
# （面包屑、正文、翻页、右侧目录）一并不要，站点的页脚照旧。
#
# 本层自己带的两件东西也在这里钉：`render: 'iframe'` 那条路走的那个通用框
# （`<iframe class="component-frame" src="/__component-frame/">`）和它背后那条框内路由。
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

  # 那条框内路由正常只被外层那个 iframe 加载、数据靠握手从外层送进来。直接打开它就没有外层，
  # 于是这一页该停在「还没拿到数据」那一格：既不是 404，也不是空白，也不是组件报错。
  Scenario: 直接打开框内那条路由，只有等数据那一格
    Given 我直接打开通用框内那条路由
    Then 框里摆的是还没拿到数据那一格
    And 这一页没有站点的导航栏
    And 浏览器里没有运行期错误
