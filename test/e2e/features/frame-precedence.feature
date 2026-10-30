# 「整页交给一个框」这一族的四把键分别由各层在自己的 `loadContent()` 里交给 `theme-component-page`，
# 清单顺序 = 站点 `plugins` 的声明顺序（本站 scalar → redoc → stoplight → iframe，见
# `docusaurus.config.mjs`）；命中页整个 `DocItem` 换成 `@theme/ApiFramePage`。这一条用例钉的就是这条语义 ——
# 同一页写多把键时，清单里排前面的赢，其余键一概轮不到（口径见
# `packages/theme-iframe/docs/iframe-protocol.md` 的「注册表与分发」一节）。
# 三条 API 层的键是布尔（`scalar: true`……），spec 地址由两把 spec 键给（`oas3:` 摆 OpenAPI、
# `aas3:` 摆 AsyncAPI 3）；`iframe:` 嵌外部页面，与这两把无关。
Feature: theme-iframe 框页 —— 同页多把键按声明顺序判

  Scenario: 四把键同写的页面，声明在最前的 scalar 生效
    Given 我打开四把键同写的演示页
    Then 这一页只摆一个框，而且是 scalar 那一个
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误

  # 上一份夹具只钉得住「scalar 赢」；这一份拿掉 scalar 那把，剩下三把按顺序该 redoc 赢 ——
  # 钉的是判定真的在逐条走清单，不是「只有 scalar 那一条被实现」。
  Scenario: 不写 scalar 的页面，剩下三把里 redoc 生效
    Given 我打开不写 scalar 的三把键演示页
    Then 这一页只摆一个框，而且是 redoc 那一个
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误
