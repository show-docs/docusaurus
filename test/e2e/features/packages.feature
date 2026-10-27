# 站点按包组织：`packages/` 下每个包占侧边栏的一顶层格，那一格的顶层页就是
# 这个包自己的 `README.md`，它的子页是这个包 `docs/` 目录里的那几页。
# 内容根就是 `packages/`，于是**页面上的地址等于那份文件相对内容根的路径** ——
# 这一族用例钉的就是这个对应关系。
Feature: 站点按包组织

  Scenario: 顶层页就是这个包的 README，子页挂在它下面
    Given 我打开 theme-scalar 那一格的顶层页
    Then 这一页的正文就是这个包的 README
    And scalar 那一格的子页是示例页与维护者文档那两份
    And 这一格里没有 tools 那三层假主题
    And 浏览器里没有运行期错误

  Scenario: 子页的地址等于它自己那份文件相对 packages 的路径
    Given 我打开 markmap 示例页
    Then 地址栏那一串就是这份文件相对 packages 的路径
    And 面包屑的上一格是 theme-markmap 的 README
