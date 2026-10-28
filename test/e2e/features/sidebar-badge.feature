# 「新建 / 更新」那两枚徽标画在侧边栏的文档条目上。
#
# 载体是官方那条 `sidebar_custom_props` 通道：站点配置把这一页是新建还是更新过的写进
# frontmatter，官方把它抄到侧边栏项的 `customProps` 上，站点层那一格把标签文字换成
# 「带徽标的样子」（形状见 `src/components/sidebar-badge.tsx`）。
#
# 判据是 **git**（站点自己判，不读标签）。git 判出来的那两个随提交变、CI 的 checkout 又是新的，
# 所以两枚锚点都由**页面自己写**那把键 `git_badge`：差异视图示例页写 `git_badge: update`，
# 关系图示例页写 `git_badge: new`。那把键不是标签 —— 正文里不会因此多出芯片。
#
# 两页分属两个包，在侧边栏里各占一格，所以「哪一个是哪一个」也顺带被钉住。
Feature: 侧边栏徽标

  Scenario: 差异视图示例页在侧边栏里那一格带一枚「更新」徽标
    Given 我打开差异视图示例页
    Then 这一页在侧边栏里那一格有一个 "更新" 徽标

  Scenario: 关系图示例页在侧边栏里那一格带一枚「新建」徽标
    Given 我打开 ERD 示例页
    Then 这一页在侧边栏里那一格有一个 "新建" 徽标
