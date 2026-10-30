# 主页就是 `packages/README.md`（`routeBasePath: '/'` + `slug: /`）。
# 站点渲染 `<DocCardList />` 的是两棵内容根的落地页（主页与 `/themes/`），组件别名是全局解析的，
# 所以「多个主题链式覆盖同一个组件」在这两格都发生：卡片列表外面从外到内套着站点层加 `tools/`
# 那三层主题，一共四层。
Feature: 主页

  Scenario: 卡片列表一格一个包，通向每个包的顶层页
    Given 我打开主页
    Then 卡片列表被套进四层主题的链里
    And 链里一格一个包都有卡片，指向各包自己的顶层页
    And 卡片上那行说明取自本包 package.json 的 description
    When 我点开指向 theme-markmap 那一格的卡片
    Then 我落在 theme-markmap 的顶层页上，那一页就是这个包的 README
    And 浏览器里没有运行期错误

  # 另一棵内容根（`themes/`）的落地页由主页正文里那一条入口连着，渲染的是同一个组件，
  # 于是同一条四层链、同样自动生成的卡片清单。
  Scenario: 主页给 themes 那一族一条入口，那一格也是自动的卡片列表
    Given 我打开主页
    When 我点开指向 themes 那一族的入口
    Then 我落在 themes 那一棵内容根的落地页
    And 卡片列表被套进四层主题的链里
    And themes 那一族每个包都有一张卡，指向各包自己的顶层页
    And 浏览器里没有运行期错误
