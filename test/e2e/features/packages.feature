# 站点按包组织：每棵内容根下每个包占侧边栏的一顶层格，那一格的顶层页就是
# 这个包自己的 `README.md`，它的子页是这个包 `docs/` 目录里的那几页。
# 站点有两棵内容根 —— `packages/`（地址不带目录段）与 `themes/`（地址带 `/themes` 那一段）——
# 于是**页面上的地址等于那份文件相对它所属内容根的路径**，这一族用例钉的就是这个对应关系。
Feature: 站点按包组织

  Scenario: 顶层页就是这个包的 README，子页挂在它下面
    Given 我打开 theme-scalar 那一格的顶层页
    Then 这一页的正文就是这个包的 README
    And scalar 那一格的子页就是本包 docs 目录里那几页
    And 这一格里没有 tools 那三层假主题
    And 浏览器里没有运行期错误

  Scenario: 子页的地址等于它自己那份文件相对所属内容根的路径
    Given 我打开 markmap 示例页
    Then 地址栏那一串就是这份文件相对它所属内容根的路径
    And 面包屑的上一格是 theme-markmap 的 README

  # 另一棵内容根用同一句判据：`themes/` 那一族的地址多一段 `/themes`，去掉那一段之后
  # 剩下的串仍然是相对 `themes/` 的文件路径。
  Scenario: 搬到 themes 那棵根的一族，地址对的是自己那一棵
    Given 我打开图片查看器示例页
    Then 地址栏那一串就是这份文件相对它所属内容根的路径
