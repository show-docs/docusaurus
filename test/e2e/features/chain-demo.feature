# 解析器包那份示例页（`packages/plugin-prev-layer-resolver/docs/chain-demo.md`）是那条链唯一的
# 真渲染处：站点层 `src/theme` 加 `tools/` 那三层主题各包一层 `ChainDemo`，从外到内一共四层
# （`[SITE]` `[C]` `[B]` `[A]`），最里面才是链底那份组件本体。
Feature: 链式覆盖示例页

  Scenario: 那一格被四层主题包着，四层一份都没丢
    Given 我打开链式覆盖示例页
    Then 那一格被套进四层主题的链里
    And 四层各自的角标都在
    And 浏览器里没有运行期错误

  # 链底是那份组件本体：theme-a 下面没人了，那一层的 `@theme-prev/ChainDemo` 落到 theme-base。
  Scenario: 链底那份组件在最里面
    Given 我打开链式覆盖示例页
    Then 链底那份组件在最里面
    And 浏览器里没有运行期错误

  # 链只在示例页：主页那张卡片列表不再被包，别的页也一个包裹标记都不该有。
  Scenario: 主页上没有那条链
    Given 我打开主页
    Then 这一页没有主题包裹标记
