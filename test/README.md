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

## 端到端（Playwright + BDD）

`e2e/` 是另一层：跑的是**构建产物**（`pnpm build` 之后由 `docusaurus serve` 起在
`http://localhost:3021`），在真浏览器里点开每个主题的示例页。

```bash
pnpm test:e2e                         # 依次跑：pnpm build → bddgen → playwright test
pnpm exec playwright install chromium # 只做一次：浏览器不在依赖里，由 Playwright 自己下
```

用例写成 Gherkin：`features/*.feature` 里是 Given/When/Then 的句子（关键词英文，句子中文），
`steps/*.steps.mts` 里是这些句子的实现。`bddgen` 把两者生成到仓库根的 `.features-gen/`，
Playwright 跑的就是那份产物 —— 它是生成物，不进 git，也别手改。
写成句子不是为了文档好看：`.feature` 里有句子却没有对应实现时，`bddgen` 在生成阶段就报错，
漏实现不会等到跑到一半才暴露。

为什么要这一层：`pnpm test` 与 `pnpm verify:chain` 读的都是**产物文本**（层栈标记、HTML 里有没有
某个标签）。有两类失败只有浏览器能看见 —— 一是运行期才抛的错（例如 `@stoplight/elements` 那份
浏览器 bundle 引用裸的 `process`，构建全绿、页面空白），二是「标签在 HTML 里，但 React 没把它
渲染出来」。第一条靠 `watchPageErrors()`（收 `pageerror`）拦，第二条靠断言元素真的可见拦。

这套用例抓到过两处真缺陷，都是「构建全绿、类型全绿、只有开页面才看得见」的那类：
`theme-iframe` 那层静默不渲染（官方 `DocItem` 不读 `props.children`，iframe 被当成 children 塞进去，
产物里 `iframe` 标签数为 0）；`theme-redoc` 的 `basePath` 用默认值时 Redoc 一声不吭地渲染**它自己那份 404**
（左栏、样式全在，正文区写着 No page at this address，控制台干净）。细节分别记在
[`theme/theme-iframe/README.md`](../theme/theme-iframe/README.md) 与
[`theme/theme-redoc/README.md`](../theme/theme-redoc/README.md)。

| 场景（`features/`） | 实现（`steps/`）      | 钉住的行为                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home.feature`      | `home.steps.mts`      | 卡片列表真被套进「站点层 + theme-a/b/c」那四层的链里，并通向每个示例页；卡片说明取自各页 `description:`                                                                                                                                                                                                                                                                                                                                                 |
| `markmap.feature`   | `markmap.steps.mts`   | 导图画在正文上方（比较两者的位置），原文一行不少；这一页没有任何主题包裹标记                                                                                                                                                                                                                                                                                                                                                                            |
| `iframe.feature`    | `iframe.steps.mts`    | 整页交给 iframe：被嵌页面真在框里渲染、navbar 以下那一屏占满、容器不留内边距、文档正文外壳与本页正文都不在；地址栏带 `?path=` 时换嵌另一个页面                                                                                                                                                                                                                                                                                                          |
| `stoplight.feature` | `stoplight.steps.mts` | 整页交给 OpenAPI 渲染器：导航、点接口、hash 路由，样式被前缀圈进 `.stoplight-root`                                                                                                                                                                                                                                                                                                                                                                      |
| `redoc.feature`     | `redoc.steps.mts`     | 整页交给 Redoc：左栏与详情在同一页里走（地址走 hash，那条接口地址整页加载也是 200），容器让位、左栏占满 navbar 以下那一屏，运行期圈定后外溢只剩 `:root *` 一条、圈定也没把 Redoc 自己的样式压掉、站点那几处在两个页面上算出来一样，配色跟站点的 `data-theme` 走而不跟操作系统的偏好走（暗色下站点那几处也再量一遍），收掉的三处（它那颗亮暗按钮、Redocly 署名、章节标题旁那一整格操作按钮）看不见、而同一格里的「收起侧栏」与代码块里那几颗复制按钮还在 |
| ——                  | `common.steps.mts`    | 两层共用的两句：「浏览器里没有运行期错误」（记录来自 `../helpers.mts` 的 `watchPageErrors()`）、「这一页没有文档正文外壳」                                                                                                                                                                                                                                                                                                                              |

> **只有本地跑**：`pnpm verify` 与 CI 都不含它（要额外下载浏览器，且依赖一个能起服务的端口）。
> 配置落点是仓库根的 `playwright.config.mts`（`testDir` 由 `defineBddConfig()` 给出），
> 用例目录 `test/e2e/features/` + `test/e2e/steps/`，生成目录 `.features-gen/` 与运行产物
> `test-results/`、`playwright-report/` 已在 `.gitignore`。

## 覆盖率

CI 把全量覆盖率红线钉在 **100%**，增量同样 100 —— 新增代码必须自带用例。
