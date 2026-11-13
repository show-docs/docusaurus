# 命中 frontmatter 的 `markmap: true` 后，这一层把导图插在正文上方。
# 它是「前一个兄弟节点」，不是替换，所以原文要一行不少。
Feature: theme-markmap

  Scenario: 命中页的导图渲染在正文上方，原文照常
    Given 我打开 markmap 示例页
    Then 这一页没有主题包裹标记
    And 导图已经画出来，节点和工具条都在
    And 工具条里没有暗色按钮
    And 导图落在正文标题的上方
    And 原文那几行照常在场
    And 导图里的链接开新标签
    And 这一页有站点的页脚
    And 浏览器里没有运行期错误

  Scenario: 配色跟站点的开关走
    Given 我打开 markmap 示例页
    Then 导图的配色跟着站点的开关走
