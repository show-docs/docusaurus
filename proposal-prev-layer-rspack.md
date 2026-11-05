# 设计方案：plugin-prev-layer-resolver 在 rspack 下怎么接线

> 日期：2026-11-05。状态：三项实测已在真实站点上跑过，`packages/` 里一行代码没动。
> 仓库级事实放这一份；机制本身、`@theme-prev/X` 的语义与「`@theme-original` 官方语义零改动」的理由
> 仍以[包 README](./packages/plugin-prev-layer-resolver/README.md) 与
> [包 internals](./packages/plugin-prev-layer-resolver/docs/internals.md) 那两处为主，这里只指过去，不抄第二份。

## 结论

**选 A：双接线。** webpack 一支保持现状，rspack 一支加一条 `normalModuleFactory.beforeResolve` 的改写，
两支共用同一个纯判据 `resolveTarget({ request, issuer })`。

两条向 B 靠的让步，实施时必须一起做：

1. **rspack 分支自带能力自检**：`apply()` 时断言 `nmf.hooks.beforeResolve` 在，不在就告警并整体禁用
   （把这条 specifier 交回官方解析，让它表现为一条真实的 Module not found，而不是安静地不生效）。
2. **登记层目录上下文依赖的那条规则两支都注册**，不只挂在 rspack 分支上（理由见「没钉住的那一条」）。

分支判据用 `configureWebpack` 第三份参数里官方算好的那一格
（`utils.currentBundler.name !== 'rspack'`，见
[`packages/plugin-lazy-compilation/src/index.mts:77`](./packages/plugin-lazy-compilation/src/index.mts)
那一支的先例与它文件头「本包不另判一套」的说明），**不读 `siteConfig.future.faster.rspackBundler`**：
后者是自己另判一套，`fasterByDefault` 那类开关的展开口径一变就跟官方脱节。本包
[`index.mts:50`](./packages/plugin-prev-layer-resolver/src/index.mts) 现在第三份参数写着 `_utils` 没用人，
拿它当判据不需要新引任何依赖。

## 根因（实测，不是推演）

`pnpm build` 的真实失败是 `Can't resolve '@theme-prev/ChainDemo' in 'src/theme/ChainDemo'`。

- rspack 的 `ResolveOptions`（`@rspack/core@1.7.12`，`dist/config/types.d.ts`）里没有 `plugins` 这一格。
- 探针证据：往 `resolve.plugins` 里塞一把自定义 resolver，rspack 下它的 `apply()` **从未被调用**；
  那个 key 在配置归一化之后还在，只是没人消费。
- 连带后果：本包那道「拿不到 `internal-resolve` 就抛」的自检
  （[`resolver.mts:399-416`](./packages/plugin-prev-layer-resolver/src/resolver.mts)）也一起不跑，
  所以除了最后那条 module-not-found，构建全程零提示。
- 开关来源：[`docusaurus.config.mjs:280`](./docusaurus.config.mjs) 的 `future.v4.fasterByDefault: true`
  ——它把没显式写的 `future.faster.*` 全打开，其中包含 `rspackBundler`。这一格还没提交，是工作区的改动。

## 三项实测

| #   | 量什么                                             | 结果                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | rspack 下逐请求 tap 的构建开销                     | 整站一次冷缓存构建里 tap 被过 **44,504** 次请求，累计 self-time **12.1ms**，峰值堆 **395MB**，构建 **29–32s** 并到达 `[SUCCESS] Generated static files`。开销是噪声级。                                                                                                                             |
| 2   | server / SSG 那一轮与动态 import 是否走同一条 hook | 走同一条。`beforeResolve` 对 client、server（SSG）两轮都触发，`import()` 与 `require` 的动态形态也一样命中，不需要为 SSG 另接线。                                                                                                                                                                   |
| 3   | rspack dev watch 与持久缓存下的失效链路            | 只有 tap、没有登记层目录时，**改外层主题文件不触发重建**（产物一直是旧的）；在 `beforeResolve` 里往 `resolveData.fileDependencies` / `missingDependencies` push 的路径，缓存与 watcher 都不采信。只有 loader 里 `this.addContextDependency(层目录)` 被两侧认，加上之后 watch 与持久缓存都正确失效。 |

第 3 项决定了那条规则不是可选优化：这个机制的命中条件「下面那层目录里有没有这个文件」是**目录级的**，
而持久缓存记的是上一次的解析结果 —— 不登记目录，缓存命中就整段跳过判定。

一次没算进结果的跑：中途 `PROBE=rspack-tap` 的复跑涨到 4GB 堆后 OOM。日志标记显示
`插件工厂开始` / `包内模块 import 完成` 成对无限重复，是**探针自己的 bug**：它按路径注册进 `plugins`，
而 `PluginDiscovery` 走 core 的 `loadPluginConfigs`，于是「实例化我 → 我又 discover → 又实例化我」。
真实包靠 [`plugins.mts:257-261`](./packages/plugin-prev-layer-resolver/src/plugins.mts) 的 `isSelfPlugin()`
（按包目录真实路径前缀跳过自己）挡住这件事，临时复刻没带这道墙。机制本身没被这条证据否掉。

## 四条候选与取舍

| 方案                    | 一句话                                                        | 判决                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A 双接线                | webpack 走 `resolve.plugins` 不动，rspack 走 `beforeResolve`  | **选它**：新支路的唯一未知（开销）已量成噪声级，已验证的一侧不动                                                                                                                  |
| B 单机制统一            | 两支都改走 `beforeResolve`，删掉 enhanced-resolve 那套        | 不选：见下面「分歧一」与「分歧三」                                                                                                                                                |
| C loader 改写 specifier | 在 loader 层把源码里的 `@theme-prev/X` 文本换成真实路径       | 不选：失败形状变坏 —— 认领不到的那些 import 形态不再让构建报错，而是安静走错一层，正是这个包最怕的那类静默错误；还要额外处理和 swc-loader、`plugin-compile-source` 那条规则的先后 |
| D 先关 rspack 止血      | 显式把 `rspackBundler` / `rspackPersistentCache` 设回 `false` | 不是方案，且今天止不住：对照组报了另一个错，见「没定性的那一条」                                                                                                                  |

### 分歧一：护栏，不是解析结果

这次的症状是**我们 tap 的那个东西在那个 bundler 里不存在，而全程没人说话**。B 删掉的正是唯一会把这类事
喊出来的机制（连带 `internal-resolve` 出口、`doResolve` 重入与 `stackHasEntry` 防递归），删完 webpack 侧也
进入「tap 没挂上就安静不生效」的形状 —— 等于把这次的 bug 类别从一支扩大到两支。

一处更正：`getHook` 那道自检管的**只是「上游 hook 改名」**这一类，层栈漏了一层、官方别名漂了那些不变量
由 `test/layers.test.mts` / `test/discover.test.mts` 钉，不由它负责。B 也不是永久失去护栏 —— 是要求
「先补好新的、再删旧的」，顺序错一步两支同时失守。

### 分歧二：B 的「单语义」收益比字面小

[`resolve.mts:84`](./packages/plugin-prev-layer-resolver/src/resolve.mts) 的 `resolveComponentInLayer` 已经把
赢家定到**具体文件**（目录形式恒胜单文件，同类里 `tsx > ts > jsx > js`，顺序与官方别名的发射顺序由
`test/resolve.test.mts` 钉在一起）。所以两支改写出来的 target 是同一个路径，剩下的分歧只在管道
（重入、alias 交互、`?query`），不是「同一个 import 解析成两个模块」那种会咬人的东西。

### 分歧三：测试资产

|              | A                                                                                           | B                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| webpack 支路 | 现状不动                                                                                    | 整段换掉                                                                                                                       |
| 已有契约     | `test/resolver.test.mts` 20 例 + `test/enhanced-resolve.test.mts` 4 例继续当 webpack 侧契约 | 这 24 例的主语（`apply` / `getHook` / `doResolve` / `stackHasEntry`）不存在，要重写到 tap 上                                   |
| 纯判据       | `test/resolve.test.mts`（560 行）两支共用                                                   | 同                                                                                                                             |
| 净变化       | +1 个分支、+2 类用例                                                                        | −约 110 行 src（`apply()` 那 77 行 + `stackHasEntry` 与 `ResolverLike` 那一截）、重写 24 例契约，且新契约从没在 webpack 上跑过 |
| 依赖         | 留 `enhanced-resolve`（devDependency 与 e2e 用例用）                                        | 可去掉                                                                                                                         |

B 不是「删掉测试」，是「把已经在生产里验证过的一侧换成从没在 webpack 上验证过的形状」。

### 分歧四：webpack 一支还不是遗产

rspack 在这个包的公开使用者侧仍是 opt-in（`future.faster.rspackBundler`，只有 `future.v4.fasterByDefault`
才默认全开）。装这些主题包的多数项目还在 webpack，所以 A 的 webpack 一支不是维护包袱，而是当前的默认路径。

## 实施要动的格（还没动）

1. [`index.mts:50-78`](./packages/plugin-prev-layer-resolver/src/index.mts)：读 `utils.currentBundler.name`，
   webpack 保持返回 `resolve.plugins`，rspack 返回那条 NMF tap + 上下文依赖规则。
2. [`resolver.mts`](./packages/plugin-prev-layer-resolver/src/resolver.mts)：新增一个 tap 形状的外壳
   （能力自检 + 把 `resolveData.request` 交给 `resolveTarget({ request, issuer: resolveData.contextInfo?.issuer })`），
   解析判据一行不改。改写只在 `@theme-prev/` 前缀上做，与现在的入口口径同一条。
3. 上下文依赖规则：一支共用（让步 2）。它只登记层目录，不改任何请求。
4. 用例：tap 外壳一类（含「hook 不存在 ⇒ 告警并整体禁用」）、规则注册一类，现有 24 例不动。
5. 文档要跟着这一支一起扫的句子（不留旧口径）：包 README
   [第 3](./packages/plugin-prev-layer-resolver/README.md)、13、76 行那三处「在 webpack resolve 阶段」的表述、
   internals 的「插件如何注入 resolver」「两个 hook 的选择（换一个就坏）」「实测」「升级检查单」四节、
   [`plugin-compile-source/src/index.mts:14`](./packages/plugin-compile-source/src/index.mts) 那句
   「那个包管……往 `resolve.plugins` 里放一把 resolver」的分工表述，以及
   [`tools/scripts/verify-chain.mts`](./tools/scripts/verify-chain.mts) 文件头那段机制说明。

## 待补的两跑

1. **补好防递归的 `rspack-tap` 完整构建 + 对那份产物跑 `pnpm verify:chain`。** 上面第 1 项那组数字来自一次
   成功的 rspack 构建（`[SUCCESS]` 有），但那条四层链
   （`src/theme > theme-c > theme-b > theme-a`）**从没在 rspack 产物上验过** —— 这是当前证据里最厚的空档。
2. **webpack 对照要重跑。** `rspackBundler: false` 那一跑报了另一个错：`Can't resolve '@theme/DebugConfig'
in '.docusaurus'`（同类还有 `@theme/DebugSiteMetadata`）。怀疑是 dev 跑过后 `.docusaurus` 里的残留
   （`plugin-debug` 只在 dev 注册那些组件）。**没在 `docusaurus clear` 之后复验过，所以现在既不能说 webpack
   一支坏了，也不能说它是绿的** —— 方案 D 能不能止血取决于这一跑。

## 没钉住的那一条（读码推出来的，未实测）

[`layers.mts:21-33`](./packages/plugin-prev-layer-resolver/src/layers.mts) 的层存在性探测直接走 `node:fs` 的
`existsSync` / `statSync`，绕开了 enhanced-resolve 的缓存文件系统，也没有登记 missing 依赖。照这一条读，
webpack 的 watch 在「外层新建一个组件文件」这个边界上大概有同一个洞。方案 A 的让步 2 顺手把它一起堵上，
但**这条要单独实测**（webpack dev 里新建一个外层组件文件，看站点是否重建那条链）才算证据。

## 探针工件（跑完删，不进提交）

`docusaurus.config.probe.mjs`、`tools/tmp-probe-plugin.mjs`、`tools/tmp-layer-watch-loader.cjs`、
`tools/tmp-layer-watch-loader.mjs`、`tools/tmp-probe15.mjs`、`tools/tmp-probe16.mjs`。
它们只是为了把上面三张表量出来，不复刻真实包的防递归与告警，别当契约读。

## 参考

- Rspack `ResolveOptions` 无 `plugins` 这一格：`node_modules/@rspack/core/dist/config/types.d.ts`（本机装的是 `1.7.12`）。
- 官方算当前 bundler 的那一格：`node_modules/@docusaurus/bundler/lib/currentBundler.js`（`getCurrentBundler()` 读 `siteConfig.future.faster.rspackBundler`）。
- 本仓另一条已经两支都接好的先例：[packages/plugin-lazy-compilation/src/index.mts](./packages/plugin-lazy-compilation/src/index.mts)。
