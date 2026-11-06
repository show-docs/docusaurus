# 设计方案：plugin-prev-layer-resolver 在 rspack 下怎么接线

> 日期：2026-11-05。状态：**方案 A 已实施**，两支的真实构建都跑过并绿灯；下面「实施要动的格」
> 记的是实际落点，两条让步一起做完了。实施之后又按「发掘设计缺陷、测试疏漏」重跑了一轮真实编译，
> 两处补正记在下面「实施之后的审计」一节（其中一处正是「两支落点相同」这句话被证伪的形状）；
> 第三处是那节里的判据空缺 —— 那句「由真实构建钉住」当时在门禁里并没有对应的那一条。
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

## 实施落地的格（已做完）

1. [`index.mts`](./packages/plugin-prev-layer-resolver/src/index.mts)：第三份参数从 `_utils` 变成判据，
   webpack 照旧交 `resolve.plugins`，rspack 交 `plugins: [新外壳]`；两支都交 `module.rules` 那一条。
2. [`resolve-tap.mts`](./packages/plugin-prev-layer-resolver/src/resolve-tap.mts)（新）：tap 形状的外壳 ——
   两格能力自检 + `resolveData.request` ← `resolveTarget({ request, issuer: resolveData.contextInfo?.issuer })`，
   抛错时告警并交回官方。解析判据一行不改，`resolver.mts` 里被搬动的只有 `resolveTarget` / `warn`
   改成对外可读。
3. [`layer-watch.mts`](./packages/plugin-prev-layer-resolver/src/layer-watch.mts) +
   [`layer-watch-loader.cts`](./packages/plugin-prev-layer-resolver/src/layer-watch-loader.cts)（新）：
   上下文依赖规则，两支共用（让步 2）。它只登记层目录，不改任何请求、也不参与编译。
4. 用例：`test/resolve-tap.test.mts` 9 例（含「hook 不存在 ⇒ 告警并整体禁用」）、
   `test/layer-watch.test.mts` 7 例、`test/plugin.test.mts` 两支各一条；原有 24 例一行没动。
5. 文档跟着这一支扫完：包 README 那三处「在 webpack 解析阶段」的表述、「工作方式」「与那条规则的分工」
   一节、「告警」第 4/5 条与「已知限制」；internals 新增「rspack 那一支」与「层目录的上下文依赖」两节，
   「两个 hook 的选择」限定为 webpack 支，「不能碰的做法」加两条（`resolve.plugins` 恒被消费、
   在 `beforeResolve` 里 push 依赖），升级检查单从七处变九处；
   `plugin-compile-source` 那句分工表述、`types/theme-specifiers.d.ts` 头部、`test/README.md` 索引同步。

## 待补的两跑（已补，两支都绿）

1. **rspack 完整构建 + `verify:chain`**：`pnpm build`（站点当前配置即 rspack）到 `[SUCCESS]`，
   `pnpm verify:chain` 报「✅ ChainDemo 链成立（4 层全部保留）」、EXIT=0。
   第 1 项那组数字留下的证据空档（四层链从没在 rspack 产物上验过）就此闭合。
2. **webpack 对照**：临时把 `future.faster.rspackBundler` / `rspackPersistentCache` 设回 `false` 再跑，
   同样 `[SUCCESS]` + `verify:chain` EXIT=0。之前那次的 `Can't resolve '@theme/DebugConfig' in '.docusaurus'`
   是 dev 跑过留下的 `.docusaurus` 残留，不是 webpack 一支坏了 —— 所以方案 D 那句「今天止不住」的
   第二个理由不成立（第一个仍然成立：关掉 rspack 不解决接线问题，只是把故障按住）。

**另补一条**：让步 2 那条规则真的把层目录登记上了吗 —— 用**包内产物**（`dist/` 的
`resolver.mjs` / `resolve-tap.mjs` / `layer-watch.mjs` + `layer-watch-loader.cjs`）跑一次最小 rspack
编译，`afterCompile` 里读 `compilation.contextDependencies`，两份层目录都在；同一跑里
`@theme-prev/Logo` 也被改写成了内层那份文件。注意这一格只能读 Compilation 上那两把访问器：
rspack 的 JS 模块对象上没有 `contextDependencies`（`module.contextDependencies` 恒空），
别把「读不到」当成「没登记」。

## 「没钉住的那一条」现在钉住了

`layers.mts` 的层存在性探测走 `node:fs`、绕开 enhanced-resolve 的缓存文件系统，webpack 的 watch 在
「外层新建一个组件文件」这个边界上原本大概有同一个洞。让步 2 把同一条规则也注册进了 webpack 支，
所以那个洞的**成因**已经不在（层目录进了官方 watch 的依赖表）。当时缺的是复验：实测项 3 只跑了
rspack dev watch + 持久缓存，webpack 那一支没有单独跑过 —— 这一条从「未实测的洞」只剩「未复验的修复」。

审计里的补正三把这一格做成了门禁：`pnpm verify:context-deps` 对**两个** bundler 各跑「层目录有没有进
`compilation.contextDependencies`」与「往内层真写一个新组件，watcher 会不会重解析」两趟，
所以两支的 watch 链路现在都有可复跑的那一条，不再依赖某次手工探针。两趟的口径记在
[包 internals](./packages/plugin-prev-layer-resolver/docs/internals.md)「层目录的上下文依赖」。

## 实施之后的审计：三处补正

方案 A 落地之后按「发掘设计缺陷、测试疏漏」重跑了一轮真实编译，翻出两条与
「两支共用一份判据」这句话直接冲突的事实，加上一条「文档写着有真实构建钉着、门禁里其实没有」的
判据空缺，三处都补完了。

**补正一：rspack 那一格交回的 request 是解析前的整串。** 同一份夹具（导入者在外层），三种写法各跑
一次真实编译，下表只记**修复前**的形状（修复后与它的实测在下面那条指针里）：

| 层里的写法                                                   | 修复前 webpack 支             | 修复前 rspack 支                     |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------------ |
| `import X from '@theme-prev/Logo'`                           | 绿灯，落内层                  | 绿灯，落内层                         |
| `import X from '!!<loader>!@theme-prev/Logo'`（行内 loader） | 绿灯，`passthru.cjs!<内层>/…` | **`Module not found`，且本包零告警** |
| 同上再带 `?raw`                                              | 绿灯                          | 同一处红                             |

原因：enhanced-resolve 在把 request 交给 resolver **之前**就把行内 loader 前缀切掉了，rspack 的
`beforeResolve` 没有这一步，于是 `matchSpecifier` 那个 `startsWith('@theme-prev/')` 连「这条请求归我管」
都没认出来 —— 不改写也不响，只剩一条看起来像「整个机制坏了」的 Module not found。上面「结论」那节写
「差异只在把 request 交给谁」时低估了这一格：判据确实只有一份，**交给判据的字符串**却有两套。
补法、为什么不能整串替换（会把用户点名的那份 loader 弄丢）、以及修复后两支各自的实测，见
[包 internals](./packages/plugin-prev-layer-resolver/docs/internals.md)「两支交回的 request 不是同一个字符串」；
钉它的是 `test/resolve-tap.test.mts` 末尾「两支同一把尺子」——此前两支各自的用例只喂裸串，
所以两支都绿着、却对同一行源码给出不同结果，这条对照判据本来就是缺的。

**补正二：分支判据只护了 rspack 那一支。** 让步 1 的能力自检管的是「我们 tap 的 hook 在不在」，
管不到「名字是不是我们认的那两个」。`index.mts` 原来是 `=== 'rspack'` 一条判据、其余全落
`resolve.plugins`：官方哪天加第三种 bundler（或改了那一格的名字），本包就原样退回这次的故障形状 ——
不消费 `resolve.plugins` 的那个 bundler 会静默不生效。现在第三种名字 ⇒ 告警点名 + 整体禁用
（包 README「告警」4c）。这一条不需要实测：它就是把一条 else 补在只有 if 的地方，
判据是 `test/plugin.test.mts`「未知 bundler 名：告警并整体禁用，不交任何一支持线」。

**补正三：上面那些「实测」当时没有可复跑的判据。** 包 internals 与 `test/layer-watch.test.mts` 的头
都写着这一格「由真实构建那一轮钉」，但 `verify:chain` 只读产物里那条渲染链 —— 它既不看 watch，
也不看 `compilation.contextDependencies`。那次实测只活在一个手工探针里，而探针按规矩跑完就删了，
于是「文档承诺有真实构建钉着」与「门禁里真有那么一条」之间是空的。
现在这一格有自己的判据：`tools/scripts/verify-context-deps.mts`（`pnpm verify:context-deps`，已并进
`pnpm verify`）—— 两个 bundler 各跑上面那两趟，并带反向对照：把那条规则摘掉，这两趟都必须**不**成立。
半 A / 半 B 的口径、以及为什么不能用 `watching.invalidate()` 当触发器，记在
[包 internals](./packages/plugin-prev-layer-resolver/docs/internals.md)「层目录的上下文依赖」与脚本自己的文件头，
这里不抄第三份。

**审计里另外三条没在这批动**（都落在「少一次失效」那一档，不是错层，下次真跑构建时再收）：

- `dirs` 交出的是**全部层**，含导入者自己那一层与它上面所有层。落点只可能来自下面那层，所以这些
  目录只会把模块判旧、不参与答案 —— dev 下的过度失效来自这里，代价没量过。
- `SOURCE_FILE` 只收 `[cm]?[jt]sx?`：层目录里的 `.mdx` 导入 `@theme-prev/X` 时不登记上下文依赖
  （与 bundler 无关，两支同犯）。本仓库现在没有 theme 下的 `.mdx`，所以踩不到。
- 升级本包不会让持久缓存失效：`getCacheBuildDependencies()` 只有 core 的三个文件，`cacheVersion`
  是 docusaurus 版本 + themeAliases 的哈希（`@docusaurus/core/lib/webpack/base.js`）。这是官方对所有
  插件的口径，本包要收只能把自身版本并进 cacheVersion，目前没做。

## 探针工件（已删，不进提交）

`docusaurus.config.probe.mjs`、`tools/tmp-probe-plugin.mjs`、`tools/tmp-layer-watch-loader.cjs`、
`tools/tmp-layer-watch-loader.mjs`、`tools/tmp-probe15.mjs`、`tools/tmp-probe16.mjs`、
`tools/tmp-verify-deps.mjs` —— 三张表量完即删。它们只为把上面的数字跑出来，不复刻真实包的防递归与
告警，别当契约读；真实包的那两条契约由 `test/resolve-tap.test.mts` / `test/layer-watch.test.mts` 钉。

审计那一轮的探针同样跑完即删（`tools/tmp-audit-probe.mjs`、`tools/tmp-audit-probe2.mjs`、
`tools/tmp-inline-check.mjs`）：它们换出来的是 `test/resolve-tap.test.mts`「两支同一把尺子」那几条
与 `tools/scripts/verify-context-deps.mts` —— 这次的重点正是「探针删了以后，判据得留在门禁里」。

## 参考

- Rspack `ResolveOptions` 无 `plugins` 这一格：`node_modules/@rspack/core/dist/config/types.d.ts`（本机装的是 `1.7.12`）。
- 官方算当前 bundler 的那一格：`node_modules/@docusaurus/bundler/lib/currentBundler.js`（`getCurrentBundler()` 读 `siteConfig.future.faster.rspackBundler`）。
- 本仓另一条已经两支都接好的先例：[packages/plugin-lazy-compilation/src/index.mts](./packages/plugin-lazy-compilation/src/index.mts)。
