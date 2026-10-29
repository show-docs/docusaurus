# theme-avatar：实现记录（维护者文档）

这份文件收的是**使用者不需要读**的那一半：配置怎么进浏览器的那两条实测、两处字面量为什么必须
一起改、这个包从别的工程搬进来时换掉了什么。使用者侧的事实（装法、每一格选项、看得见的行为）在
[`../README.md`](../README.md)。

## 组成

| 文件                              | 职责                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/index.mts`                   | 插件入口：校验选项、`loadContent()` 查安装前提、`contentLoaded()` 把配置交给全局数据、交出层目录 |
| `src/config.mts`                  | 那一棵 `OPTION_SPEC`：认哪些格、每格收什么形状、不写时用什么缺省                                 |
| `types/avatar-config.d.ts`        | 配置的形状：配置期产它、浏览器期读它，两侧引同一份                                               |
| `theme/ColorModeToggle/index.tsx` | 主题层（未编译的源码）：向下交回 `ColorModeToggle`，从全局数据取回配置                           |
| `components/avatar.tsx`           | 头像与下拉菜单（未编译的源码）：发请求、判「画不画」、拼那两行                                   |

切分只有一条：**`src/` 编译，其余不编**。`src/` 过 `tsc`（`rootDir` 是 `src/`），产物在 `dist/`；
`theme/` 与 `components/` 随包发布成源码，由用它们的站点编译，「谁来编」归
`@show-docs/docusaurus-plugin-prev-layer-resolver`（判据只有它那一处）。

`types/` 那份是 `.d.ts`：不参与产出，所以 `src/` 与 `components/` 能各从自己的位置引同一份声明，
不必为了共享类型把源码搬到 `tsc` 管不到的地方去。

## 配置怎么进浏览器：两条只读代码看不出来的形状

原来是 `useGlobalData()[包名]` 直接取，取到的是 `undefined`。查 `@docusaurus/core@3.10.2` 的
`lib/server/plugins/` 之后，这一格换成了现在的写法，因为它有两处与直觉相反：

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

## 从原来的草稿换掉的三格

这个包最初是别的工程里的一份草稿（`.js` / `.jsx`、包根一份 `index.mjs`、配置里带着那两个工程的
域名与接口地址）。搬进本仓时改了形状，没改行为：

| 原来                                                                                            | 现在                                       | 为什么                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme/**/*.jsx`                                                                                | `theme/**/*.tsx` + `components/avatar.tsx` | 解析器插件那条认领 TS 源码的规则**不认 `.jsx`**（判据写在它的 `src/source-js-rule.mts`，注释里点名了这一格）；站点自己 swizzle 的 `src/theme/**` 才有官方 babel 规则兜住                                   |
| `@theme-init/ColorModeToggle`                                                                   | `@theme-prev/ColorModeToggle`              | `@theme-init/*` 在本仓没有那份声明（`plugin-prev-layer-resolver/types/theme-specifiers.d.ts` 头上写着：没人引的 specifier 不占位，免得「声明还在」假装「还在用」），而链式覆盖这一族统一走 `@theme-prev/*` |
| `enableHostname` / `userApi` / 两条菜单地址都给了具体缺省（`/api/user`、`https://example.com`） | 缺省是空串，空串 = 关闭                    | 一个可安装的包不该带着另一个工程的域名：不写就是不启用，而不是指向一个不存在的服务                                                                                                                         |

`ahooks` 那一条依赖留下了：`useRequest` 给的是防抖、节流与浏览器端那份请求缓存，本层只是用它，
不是重写它。

## 已知限制

- 覆盖率红线只算 `src/*.mts`（`vitest.config.mts` 的 include）：`theme/` 与 `components/` 是
  站点编译的源码，不在红线里，由真实构建与 e2e 钉。本站这一层故意不出现头像，所以 e2e 能钉的
  只有「导航栏还在、没有多余的那颗图」，接口通的那一条路径在本仓没有现场。
- 接口失败没有任何界面：`useRequest` 抛错时 `data` 是 `undefined`，判据走到「不画」。这是刻意的
  （导航栏不该把一次请求失败显成一个错误），代价是排查得开控制台。
- `request` 那一格原样摊进 `useRequest` 的入参，`ready` 由本层写在其后 —— 站点写了 `ready`
  也会被覆盖，这一格不在选项名单里。

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
