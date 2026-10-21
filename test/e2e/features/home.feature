# 主页就是 `docs/intro.md`（`routeBasePath: '/'` + `slug: /`）。
# 站点里只有这一页写了 `<DocCardList />`，所以「多个主题链式覆盖同一个组件」
# 就发生在这里：卡片列表外面从外到内套着站点层加 demo 三层主题，一共四层。
Feature: 主页

  Scenario: 卡片列表通向每个主题的示例页
    Given 我打开主页
    Then 卡片列表被套进四层主题的链里
    And 链里有七张分别指向 markmap、iframe、stoplight、redoc、scalar、erd、viewer 示例页的卡片
    And 卡片上那行说明取自示例页 frontmatter 的 description
    When 我点开指向 markmap 示例页的那张卡片
    Then 我落在 markmap 示例页上
    And 浏览器里没有运行期错误
