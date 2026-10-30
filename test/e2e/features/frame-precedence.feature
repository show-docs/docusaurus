# 「整页交给一个框」这一族的四把键，组件与规则由各层在自己的 `loadContent()` 里交给
# `theme-component-page`；最终那张规则表的顺序由**站点配置里那一列 `rules`** 定
# （本站 scalar → redoc → stoplight → iframe，见 `docusaurus.config.mjs`）。这一条用例钉的就是
# 这条语义 —— 同一页写多把键时，那列里排前面的先判、第一个命中的赢，其余键一概轮不到（口径见
# `packages/theme-component-page/docs/iframe-protocol.md` 的「规则表」一节）。
# 三条 API 层的键是布尔（`scalar: true`……），spec 地址由两把 spec 键给（`oas3:` 摆 OpenAPI、
# `aas3:` 摆 AsyncAPI 3）；`iframe:` 嵌外部页面，与这两把无关。
#
# 四把键命中的是**同一个框**：`<iframe class="component-frame" src="/__component-frame/">`，
# 区别只在框里渲染的是哪一个组件（由 `id` 经握手送进框内），所以「谁赢」是按**框里长出来的那棵
# 渲染根**量的，不是按框的类名或地址。
Feature: component-page 规则表 —— 同页多把键按站点那一列判

  Scenario: 四把键同写的页面，那一列里排最前的 scalar 生效
    Given 我打开四把键同写的演示页
    Then 这一页只摆一个框，而且是 scalar 那一个
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误

  # 上一份夹具只钉得住「scalar 赢」；这一份拿掉 scalar 那把，剩下三把按顺序该 redoc 赢 ——
  # 钉的是判定真的在逐条走那一列，不是「只有 scalar 那一条被实现」。
  Scenario: 不写 scalar 的页面，剩下三把里 redoc 生效
    Given 我打开不写 scalar 的三把键演示页
    Then 这一页只摆一个框，而且是 redoc 那一个
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误
