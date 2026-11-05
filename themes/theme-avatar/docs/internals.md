# theme-avatar：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：配置怎么进浏览器的那两条实测、两处字面量为什么必须
一起改、这一层为什么是这个形状。使用者侧的事实（装法、每一格选项、看得见的行为）在
[`../README.md`](../README.md)。

## 组成

| 文件                              | 职责                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/index.mts`                   | 插件入口：校验选项、`contentLoaded()` 把配置交给全局数据、交出层目录                              |
| `src/config.mts`                  | 那一棵 `OPTION_SPEC`：认哪些格、每格收什么形状、不写时用什么缺省                                  |
| `types/avatar-config.d.ts`        | 配置的形状：配置期产它、浏览器期读它，两侧引同一份                                                |
| `theme/ColorModeToggle/index.tsx` | 主题层（未编译的源码）：拿官方那一份（`@theme-init/ColorModeToggle`）原样渲染，从全局数据取回配置 |
| `components/avatar.tsx`           | 头像与下拉菜单（未编译的源码）：发请求、判「画不画」、拼那两行                                    |

切分只有一条：**`src/` 编译，其余不编**。`src/` 过 `tsc`（`rootDir` 是 `src/`），产物在 `dist/`；
`theme/` 与 `components/` 随包发布成源码，由用它们的站点编译，「谁来编」归
`@show-docs/docusaurus-plugin-compile-source`（判据只有它那一处）。

`types/` 那份是 `.d.ts`：不参与产出，所以 `src/` 与 `components/` 能各从自己的位置引同一份声明，
不必为了共享类型把源码搬到 `tsc` 管不到的地方去。

## 配置怎么进浏览器：两条只读代码看不出来的形状

从全局数据里按 `useGlobalData()[包名]` 直接取，取到的是 `undefined`（实测 `@docusaurus/core@3.10.2`
的 `lib/server/plugins/`）。这一格用现在的写法，因为它有两处与直觉相反：

1. **`setGlobalData` 不是生命周期方法。** `@docusaurus/types/src/plugin.d.ts` 里它是
   `setGlobalData: (data: unknown) => void` 挂在 `actions` 上 —— 要插件在生命周期里**调用它**，
   而不是定义在插件对象上等着被调。定义成 `setGlobalData() { return config; }` 那种写法不会有人调，
   也不报错：Docusaurus 只遍历它认得的那些名字。
2. **`actions` 只在插件定义了 `contentLoaded` 时才创建。** `lib/server/plugins/plugins.js` 里那一步是
   `if (!plugin.contentLoaded) return { ...plugin, globalData: undefined }` —— 没有 `contentLoaded`
   这一格，连 `actions` 都拿不到，`loadContent()` 里想调也没有。所以本入口必须有 `contentLoaded`，
   哪怕它只做这一件事。

数据落进全局时按 `插件名 → 插件 id → 数据` 分了三段（`pluginsUtils.js` 的 `aggregateGlobalData`），
所以浏览器侧用官方的 `usePluginData(包名)` 取（它默认 `pluginId = 'default'`，且
`failfast` 缺省为假，取不到时交回 `undefined` 而不是抛）。自己去 `useGlobalData()` 里拆那一段也能对，
但那是把官方 hook 已经封装好的分键规则再抄一遍。

## 两处 `PLUGIN_NAME` 字面量：为什么必须一起改

`src/config.mts` 里那个常量是插件名，`theme/ColorModeToggle/index.tsx` 里那句
`const PLUGIN_NAME = '@show-docs/docusaurus-theme-avatar'` 是它的第二处写法。为什么留两处：
浏览器侧那一层不能引 `src/`（那里是 Node 侧的编译产物，`dist/` 里的东西由站点按包名解析，
而站点编译 `theme/` 时引 `../src/config.mts` 会把 Node 侧的 `node:path` 一起拖进浏览器包）。

这一格漂了的症状是「头像静默消失」—— 取到的那一格是 `undefined`，界面上没有任何提示。
所以配了一条读原文回对的测试：`test/package-entries.test.mts` 把 `theme/ColorModeToggle/index.tsx`
读出来，取出那句字面量，与 `src/config.mts` 导出的那个常量比。产物不经 `tsc`，注释挡不住这种漂移。

## 这一层刻意定下的两格

这两格各有其因：

| 位置                                        | 形状                                     | 为什么                                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme/**/*.tsx` + `components/avatar.tsx`  | 主题层与浏览器侧都是 `.tsx`，没有 `.jsx` | 编译插件那条认领 TS 源码的规则**不认 `.jsx`**（判据写在它的 `src/source-js-rule.mts`，注释里点名了这一格）；站点自己 swizzle 的 `src/theme/**` 才有官方 babel 规则兜住 |
| `enableHostname` / `userApi` / 两条菜单地址 | 缺省是空串，空串 = 关闭                  | 一个可安装的包不该带着别的工程的域名：不写就是不启用，而不是指向一个不存在的服务                                                                                       |

`@theme-init/ColorModeToggle` 用的是官方别名：仓库里只有本层提供这一格，没有第二层覆盖，所以
不走链（链式覆盖才走 `@theme-prev`）。规则与判据在
[解析器包的维护者文档](/plugin-prev-layer-resolver/docs/internals) 的「基础设施链的规矩」一节。

## 请求那一层：`swr` 顶上 `ahooks`，选项面跟着缩了一格

`components/avatar.tsx` 只需要「发一次，把返回存住」，所以这一层的依赖也只为一件事：按
`request.cacheKey` 在浏览器内存里存住接口返回那一份，重挂载时先画旧的那一份。

`ahooks` 的 `useRequest` 给的是同一件事再加上防抖与节流。那三格（`debounceLeading` /
`debounceWait` / `throttleWait`）在本层从来没有可观察的效果：一次挂载只有一个触发点（不 `manual`、
没有 `refreshDeps`），防抖与节流只经过首帧那一下，而两边的缺省都是立刻发。`swr` 没有防抖与节流入参
（数过它 `dist/types-*.d.ts` 里 `PublicConfiguration` 那一整张名单），这三格就随依赖一起退掉了 ——
老站点写过它们会红在加载配置那一句，报错点名那一格并列出还能收的名单；`test/avatar-config.test.mts`
里有一条用例钉住这三格的报错。

`swr` 的三条缺省会做出本层没有的界面，都在调用处关掉：

| 关掉的那一格            | 不关会怎样                                                                       |
| ----------------------- | -------------------------------------------------------------------------------- |
| `shouldRetryOnError`    | 接口失败按 `errorRetryInterval`（缺省 5000ms）重试，`errorRetryCount` 还不限次数 |
| `revalidateOnFocus`     | 切回标签页就重发一次：那边已经退登录时，头像会在用户没做任何动作的时候消失       |
| `revalidateOnReconnect` | 断网恢复同样重发一次                                                             |

这四条行为都在 `swr@2.5.1` 上实测过（jsdom + `createRoot`，看渲染出来的文本，不是看 hook 的返回值）：
`null` 键一次都不发；键落定发一次并把返回送上界面；关掉重试后接口失败始终只有那一次；`focus` 与
`online` 两个事件都不再触发请求。这三格的名字与缺省读自那一版的类型定义，升版后回读一遍。

留着的一条差别：`swr` 在 `dedupingInterval`（缺省 2000ms）之内合并同键请求，所以 2 秒内的重挂载只
读到缓存、不再发一次，而 `ahooks` 那份是无条件再验一次。导航栏在整个会话里只挂载一次，本层碰不到
这一条的现场，也就没为它加判据。另一条：`ahooks` 那份缓存另有 5 分钟过期时间，`swr` 的没有。

## 已知限制

- 覆盖率红线只算 `src/*.mts`（`vitest.config.mts` 的 include）：`theme/` 与 `components/` 是
  站点编译的源码，不在红线里，由真实构建与 e2e 钉。本站这一层故意不出现头像，所以 e2e 能钉的
  只有「导航栏还在、没有多余的那颗图」，接口通的那一条路径在本仓没有现场。
- 接口失败没有任何界面：`swr` 拿到 rejection 时 `data` 仍是 `undefined`，判据走到「不画」。这是刻意的
  （导航栏不该把一次请求失败显成一个错误），代价是排查得开控制台。
- 「发不发」那一格不给站点碰：本层把 `request.cacheKey` 用作 `swr` 的键，没启用时交 `null` 键。
  站点没有 `ready` 这类入参可写，写了也不在这一层的名单里。

## 升级检查单

Docusaurus 升版之后复跑这四条，顺序无所谓：

1. `node_modules/@docusaurus/core/lib/server/plugins/plugins.js` 里那句
   `if (!plugin.contentLoaded)` 还在不在 —— 它决定了「必须有 `contentLoaded`」这一格。
2. `lib/server/plugins/pluginsUtils.js` 的 `aggregateGlobalData` 还是不是
   `globalData[name][id]` 那两层 —— 它决定了浏览器侧为什么用 `usePluginData` 而不是自己拆。
3. `@docusaurus/module-type-aliases` 还声明 `@docusaurus/useGlobalData` 与 `@docusaurus/useIsBrowser`
   吗 —— 少了任何一个，`pnpm lint:type` 会红在 `theme/` 那一层。
4. `pnpm build` 之后在 `.docusaurus/` 里回读一次全局数据，确认 `@show-docs/docusaurus-theme-avatar`
   那一格是配置期校验过的形状（本站应该是 `{}` 补齐缺省那一份，`userApi` 是空串）。
