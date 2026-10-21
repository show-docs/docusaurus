# 触发条件是文件扩展名 `.dbml`：这一层把关系图画在正文上方，
# 同一份模型在下方给出六种格式的导出（页签），再往下是字段说明表。
Feature: theme-erd

  Scenario: .dbml 页上方画关系图，下方附六种导出
    Given 我打开 ERD 示例页
    Then 关系图里表、枚举与连线都在
    And 关系图落在正文上方
    And 导出区有六个页签
    When 我点开 Spring Data JPA 那一页签
    Then 面板里是生成的 Java 代码
    And 这一页有站点的页脚
    And 浏览器里没有运行期错误
