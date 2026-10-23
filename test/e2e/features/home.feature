# 主页就是 `docs/intro.md`（`routeBasePath: '/'` + `slug: /`）。
# 站点里只有这一页写了 `<DocCardList />`，所以「多个主题链式覆盖同一个组件」
# 就发生在这里：卡片列表外面从外到内套着站点层加 demo 三层主题，一共四层。
Feature: 主页

  Scenario: 卡片列表一格一个包，通向每个包的顶层页
    Given 我打开主页
    Then 卡片列表被套进四层主题的链里
    And 链里有十张卡片，一格一个包：解析器插件那一份加九个主题包各自的顶层页
    And 卡片上那行说明取自本包 package.json 的 description
    When 我点开指向 theme-markmap 那一格的卡片
    Then 我落在 theme-markmap 的顶层页上，那一页就是这个包的 README
    And 浏览器里没有运行期错误
