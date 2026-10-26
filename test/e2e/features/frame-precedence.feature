# 「整页交给一个框」这一族的**四把键现在由一份 `DocItem` 判**（收拢前三条 API 层各带一层
# `DocItem`，先后由 `plugins` 的排列决定；现在先后钉在 `packages/theme-iframe/lib/api-frame-registry.ts`
# 的条目顺序上：scalar → redoc → oas3 → iframe）。这一条用例钉的就是这条语义 ——
# 同一页写多把键时，注册表里排前面的赢，其余键一概轮不到（口径见
# `packages/theme-iframe/docs/iframe-protocol.md` 的「注册表」一节）。
Feature: theme-iframe 注册表 —— 同页多把键按注册表顺序判

  Scenario: 四把键同写的页面，注册表里排第一的 scalar 生效
    Given 我打开四把键同写的演示页
    Then 这一页只摆一个框，而且是 scalar 那一个
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误

  # 上一份夹具只钉得住「scalar 赢」；这一份拿掉 scalar 那把，剩下三把按顺序该 redoc 赢 ——
  # 钉的是判定真的在逐条走注册表，不是「只有 scalar 那一条被实现」。
  Scenario: 不写 scalar 的页面，剩下三把里 redoc 生效
    Given 我打开不写 scalar 的三把键演示页
    Then 这一页只摆一个框，而且是 redoc 那一个
    And 这一页没有文档正文外壳
    And 这一页没有站点的页脚
    And 浏览器里没有运行期错误
