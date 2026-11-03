# 主页就是 `packages/README.md`（`routeBasePath: '/'` + `slug: /`）。
# 站点渲染 `<DocCardList />` 的是两棵内容根的落地页（主页与 `/themes/`），组件别名是全局解析的，
# 所以两处渲染的是同一个组件；卡片清单由各自那一份侧栏扫出来，不在文档里抄。
# 那条四层链（`TOCInline`）不在这一页上 —— 它在解析器包那份示例页，见 `chain-demo.feature`。
Feature: 主页

  Scenario: 卡片列表一格一个包，通向每个包的顶层页
    Given 我打开主页
    Then 卡片列表一格一个包都有卡片，指向各包自己的顶层页
    And 卡片上那行说明取自本包 package.json 的 description
    When 我点开指向 theme-markmap 那一格的卡片
    Then 我落在 theme-markmap 的顶层页上，那一页就是这个包的 README
    And 浏览器里没有运行期错误

  # 另一棵内容根（`themes/`）的落地页由主页正文里那一条入口连着，渲染的是同一个组件，
  # 于是同样一份自动生成的卡片清单。
  Scenario: 主页给 themes 那一族一条入口，那一格也是自动的卡片列表
    Given 我打开主页
    When 我点开指向 themes 那一族的入口
    Then 我落在 themes 那一棵内容根的落地页
    And themes 那一族每个包都有一张卡，指向各包自己的顶层页
    And 浏览器里没有运行期错误

  # navbar 那两格是 `type: 'docSidebar'`：配置里只点名两份侧栏（`docs` / `themes`），地址由官方从
  # 那份侧栏的第一项算出来 —— 所以这一格不会跟着新增包变，`test/plugin.test.mts` 钉的是「不抄地址」，
  # 这里钉的是「抄来的地址真通向各自那棵根的索引页」，以及「哪一格亮着」跟着所在那棵根翻。
  Scenario: navbar 两格通向两棵内容根，当前那一格跟着所在那棵根翻
    Given 我打开主页
    Then navbar 的两格分别通向两棵内容根的索引页
    And navbar 里只有 "包" 那一格是当前
    When 我点 navbar 里 "主题包" 那一格
    Then 我落在 themes 那一棵内容根的落地页
    And navbar 里只有 "主题包" 那一格是当前
    When 我打开 markmap 示例页
    Then navbar 里只有 "包" 那一格是当前
    And 浏览器里没有运行期错误
