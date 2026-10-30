# 「新建 / 更新」那两枚徽标画在侧边栏的文档条目上。
#
# 载体是官方那条 `sidebar_custom_props` 通道：`themes/theme-git-badge` 把这一页是新建还是
# 更新过的写进 frontmatter，官方把它抄到侧边栏项的 `customProps` 上，那一层把种类写成
# `data-git-badge` 属性。叶子行由包的 CSS 伪元素画一个纯色点；分类行不画点 —— 颜色染在那一行
# 本来就有的折叠箭头上（见 `themes/theme-git-badge/styles/git-badge.css`）。
#
# 判据是 **git**（包自己判）。git 判出来的那两个随提交变、CI 的 checkout 又是新的，
# 所以两枚锚点都由**页面自己写**那把键 `git_badge`：差异视图示例页写 `git_badge: update`，
# 关系图示例页写 `git_badge: new`。那把键只影响侧边栏那一格，正文里不会因此多出东西。
#
# 两页分属两个包，在侧边栏里各占一格，所以「哪一个是哪一个」也顺带被钉住。
Feature: 侧边栏徽标

  Scenario: 差异视图示例页在侧边栏里那一格带一枚「更新」徽标
    Given 我打开差异视图示例页
    Then 这一页在侧边栏里那一格有一个 "更新" 徽标

  Scenario: 关系图示例页在侧边栏里那一格带一枚「新建」徽标
    Given 我打开 ERD 示例页
    Then 这一页在侧边栏里那一格有一个 "新建" 徽标

  # 分类行看整棵子树：theme-erd 那一类里钉了 new 的那页让它也带上 new（自己那页是 update）。
  # 分类行不画点，颜色落在折叠箭头上。
  Scenario: 关系图那个分类跟着子页带一枚「新建」徽标
    Given 我打开 ERD 示例页
    Then 侧边栏里「theme-erd」那一类带一枚 "新建" 徽标

  # 徽标的地盘跟着文档插件走：站点有两棵内容根，注入只做一次，两棵根的页都该有。
  # 这一条钉的是「地盘扩到第二棵根」那一步真的接上了，不是只给 `packages/` 那一族画。
  Scenario: 另一棵内容根里那一格也带一枚「新建」徽标
    Given 我打开徽标示例页
    Then 这一页在侧边栏里那一格有一个 "新建" 徽标
    And 浏览器里没有运行期错误
