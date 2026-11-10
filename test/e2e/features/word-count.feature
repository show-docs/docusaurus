# 触发条件是 md 的 frontmatter 里那把 `wordCount` 键：这一层在正文上方多摆一块字数统计。
# 数在配置期按整站算完、随生成模块进浏览器；页面读它时按路由上下文只挑自己所在的内容根。
Feature: theme-word-count

  # 两棵内容根各有一页写了这把键：示例页在 `default`，`/themes/` 落地页在 `themes`。
  # 挑错时会退回全站合计，两个实例 id 都会露在块里，所以「不出现另一个」把那两种症状一起兜住。
  Scenario: 命中页只显示自己所在内容根的数，原文照常
    Given 我打开全站字数示例页
    Then 统计那一格写明总词数与页数
    And 统计那一格只提 "default" 这一个内容根
    And 统计那一格落在正文上方
    And 正文那一段照常在场
    And 这一页有站点的页脚
    And 浏览器里没有运行期错误

  Scenario: 另一棵内容根的命中页看到的是它自己那一份
    Given 我打开主题包说明页
    Then 统计那一格写明总词数与页数
    And 统计那一格只提 "themes" 这一个内容根
    And 统计那一格落在正文上方
    And 主题包说明的正文照常在场
    And 这一页有站点的页脚
    And 浏览器里没有运行期错误

  # 判据只有 frontmatter 那把键：没写的页面这一层等于透明。
  Scenario: 没写 wordCount 的页面不加这一格
    Given 我打开 markmap 示例页
    Then 这一页没有字数统计
    And 浏览器里没有运行期错误
