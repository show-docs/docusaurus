# 命中 frontmatter 的 `markmap: true` 后，这一层把导图插在正文上方。
# 它是「前一个兄弟节点」，不是替换，所以原文要一行不少。
Feature: theme-markmap

  Scenario: 命中页的导图渲染在正文上方，原文照常
    Given 我打开 markmap 示例页
    Then 这一页不渲染卡片列表，整页没有主题包裹标记
    And 导图已经画出来，节点和工具条都在
    And 导图落在正文标题的上方
    And 原文那几行照常在场
    And 浏览器里没有运行期错误
