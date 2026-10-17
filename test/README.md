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

## 端到端（Playwright）

`e2e/` 是另一层：跑的是**构建产物**（`pnpm build` 之后由 `docusaurus serve` 起在
`http://localhost:3021`），在真浏览器里点开每个主题的示例页。

```bash
pnpm test:e2e                        # 先 pnpm build，再 playwright test
pnpm exec playwright install chromium # 只做一次：浏览器不在依赖里，由 Playwright 自己下
```

为什么要这一层：`pnpm test` 与 `pnpm verify:chain` 读的都是**产物文本**（层栈标记、HTML 里有没有
某个标签）。有两类失败只有浏览器能看见 —— 一是运行期才抛的错（例如 `@stoplight/elements` 那份
浏览器 bundle 引用裸的 `process`，构建全绿、页面空白），二是「标签在 HTML 里，但 React 没把它
渲染出来」。第一条靠每条用例开头的 `watchPageErrors()`（收 `pageerror`）拦，第二条靠断言元素
真的可见拦。

这套用例上线第一次跑就抓到一处真缺陷：`theme-iframe` 那层静默不渲染（官方 `DocItem` 不读
`props.children`），落点因此改到 `DocItem/Content` —— 细节记在
[`theme/theme-iframe/README.md`](../theme/theme-iframe/README.md)。

| 文件                 | 钉住的行为                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `home.spec.mts`      | 卡片列表真被套进 theme-a/b/c 那三层的链里，并通向每个示例页；卡片说明取自各页 `description:` |
| `markmap.spec.mts`   | 导图画在正文上方（比较两者的位置），原文一行不少                                             |
| `iframe.spec.mts`    | 正文区换成 iframe，被嵌页面在框里真渲染，文档外壳照旧                                        |
| `stoplight.spec.mts` | 整页交给 OpenAPI 渲染器：导航、点接口、hash 路由，样式不外溢                                 |
| `helpers.mts`        | `watchPageErrors()`：把浏览器运行期错误带回断言                                              |

> **只有本地跑**：`pnpm verify` 与 CI 都不含它（要额外下载浏览器，且依赖一个能起服务的端口）。
> 配置落点是仓库根的 `playwright.config.mts`，用例目录 `test/e2e/`，产物目录
> `test-results/`、`playwright-report/` 已在 `.gitignore`。

## 覆盖率

CI 把全量覆盖率红线钉在 **100%**，增量同样 100 —— 新增代码必须自带用例。
