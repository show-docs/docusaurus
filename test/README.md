# test

单元测试（vitest，`.mts`），跑的是**源码**而不是 `tsc` 产物（避免「测的是编译结果」）；
`pnpm test` 已内置 `pnpm build:core`。

**全部按契约面组织**：新用例并入既有契约面文件，不另开 `review*.test.mts` 之类的轮次档。

| 文件                        | 钉住的契约面                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| `chain-invariants.test.mts` | 链式不变量：落点恒在导入者下方、永不指向自己                                     |
| `discover.test.mts`         | 层栈自动发现（真实 `loadContext`）+ 主题插件模块加载次数                         |
| `layers.test.mts`           | 层栈推导与官方 `loadThemeAliases` 同序 · 上游 core 未被补丁 · 官方别名全落层栈内 |
| `resolve.test.mts`          | 纯解析逻辑：组件定位 / 导入者归属 / specifier 匹配                               |
| `resolver.test.mts`         | 逐层解析端到端（真实 resolver）                                                  |
| `plugin.test.mts`           | 插件入口与选项校验 + 站点按包名加载/分包三件套                                   |
| `hardening.test.mts`        | 输入校验 / 失败形态 / 告警                                                       |
| `enhanced-resolve.test.mts` | 与 `enhanced-resolve` 的集成                                                     |
| `helpers.mts`               | 夹具：临时站点骨架、假的 `@docusaurus/core`                                      |

## 覆盖率

CI 把全量覆盖率红线钉在 **100%**，增量同样 100 —— 新增代码必须自带用例。
