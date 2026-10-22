# 触发条件是文件扩展名 `.dbml`：这一层把关系图画在正文上方，
# 同一份模型在下方给出一串格式导出（页签）—— 固定那四个加站点自己配的模板页
# （本站在 `docusaurus.config.mjs` 里引了一份 `./erd/table-names.mjs`），再往下是字段说明表。
Feature: theme-erd

  Scenario: .dbml 页上方画关系图，下方附导出页签
    Given 我打开 ERD 示例页
    Then 关系图里表、枚举与连线都在
    And 关系图落在正文上方
    And 导出区有固定四个格式加站点那一条模板页
    When 我点开「表清单」那一页签
    Then 面板里是站点那份生成器落出来的表清单
    And 这一页有站点的页脚
    And 浏览器里没有运行期错误
