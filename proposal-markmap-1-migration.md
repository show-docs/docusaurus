# 设计方案：theme-markmap 迁移到 markmap 1.x

> 日期：2026-11-13。状态：**已实施**（同日落地，门禁全绿；实施记录见文末）。范围：
> `packages/theme-markmap` 及其示例页、单测、e2e 与文档；不涉及其他主题层。
>
> 仓库级取舍放这一份；包内机制、「谁来编 `.tsx`」、component-page 的判表与外壳仍以包 README、
> 包 internals 与 [component-page 的文档](./packages/theme-component-page/docs/internals.md) 为主，
> 这里只指过去，不抄第二份。

## 结论

**一次性迁到 `@markmap/*` 1.1.x**：`markmap-lib` → `@markmap/parse`，`markmap-view` →
`@markmap/view`，`markmap-toolbar` → `@markmap/toolbar`，`markmap-common` 直接删除。
插件结构不动：frontmatter 判定、post loader 追加 `export const markmap`、component-page 的
`markmap` 规则、`ViewLayerDocItem` 外壳、渲染接线按需加载全部保留；变的只有**数据形状**与
**渲染层那四处 API**。

包版本按 0.x 的 breaking 约定走 minor：`0.2.6` → `0.3.0`。README 必须带一张迁移表，
因为 frontmatter 选项名与 markdown 里几类内容的呈现都变了。

## 为什么现在做

- npm 上 `markmap-common` / `lib` / `toolbar` / `view` 四个 0.18 包都标了
  **deprecated**：“Replaced by `@markmap/*` in 1.0.0”。0.18.13 是这条线的最后一版，
  不会再有修复。
- 1.x 的收益：节点持有结构化内容（不再是 HTML 串）、可选 canvas 渲染超大图、内置 PNG/SVG
  导出、三种布局与三套主题、无 CDN 资源、MathJax。本层当前只用得到渲染与工具条，但
  “结构化内容”这一条直接换掉了现在的 markdown-it 链接改写。
- 本仓只有一个消费者（本站示例页），迁移成本可控；等到要加第二处导图时再迁，成本只会更高。

## 现状与目标

| 维度       | 现在（0.18.13）                                                        | 目标（1.1.x）                                                             |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 依赖       | `markmap-common` / `lib` / `toolbar` / `view`                          | `@markmap/parse` / `view` / `toolbar`，类型用 `@markmap/core`             |
| 解析       | `Transformer` + 只留 frontmatter 的内置插件                            | `parse(source)`，内置 gfm / frontmatter / highlight / references          |
| 数据形状   | `{ root: IPureNode(HTML 串), features, styles, scripts, frontmatter }` | `{ root: MarkmapNode(结构化), frontmatter, gfm }`                         |
| 额外资源   | `getUsedAssets()` → `loadCSS` / `loadJS`                               | 无。1.x 的资源随包，不再有 CDN 资产                                       |
| 链接新标签 | 改 markdown-it 的 `renderAttrs` 与 `html_inline` / `html_block` 两格   | renderer 序列化链接时自带 `target="_blank"`，本层一行不用写               |
| 选项       | `deriveOptions(frontmatter.markmap)`                                   | `resolveViewOptions({}, frontmatter.markmap)`，非法值返回 `warnings`      |
| 创建       | `Markmap.create(svg, options, root)`                                   | `Markmap.create(svg, root, options)`；更新用 `setTree` / `setOptions`     |
| 暗色       | 祖先挂 `markmap-dark` 类 + 一整套暗色 CSS 变量                         | `colorScheme: 'light' \| 'dark'` 选项；`--mm-*` 令牌                      |
| 工具条     | `Toolbar.create(mm)` + `setItems` 过滤 `dark` + 外部 `dist/style.css`  | `createToolbar(mm, { items })`；样式由包自己注入，类名 `.markmap-toolbar` |
| CSS        | `.mm-toolbar`、`.mm-toolbar-brand` 两条要自己收                        | 只留高度、定位与草稿条；品牌与暗色按钮在新工具条里根本不存在              |

## 1.1.0 实测（Node 探针 + 包类型）

### 解析产物

对 `packages/theme-markmap/docs/markmap-demo.md` 跑 `parse()`：

- 返回 `{ root, frontmatter, gfm }` 三个键；`gfm` 在 Node 下为 `true`。
- `root.content` 是 **mdast inline 节点数组**（`[{ type: 'text', value: '…' }]`），
  不是现在的 HTML 串；单测里那几条 `&#x6807;&#x9898;` 断言全部失效。
- 链接是 `{ type: 'link', url, children }` 节点，**不带** `target`；新标签页在 renderer 里补。
- 裸 HTML 被丢掉：`# <b>x</b>` 解析出来只剩文本 `x`。
- 旧选项名原样留在 `frontmatter.markmap` 里（`colorFreezeLevel`、`initialExpandLevel`），
  `resolveViewOptions` 会给出 `Unknown option …` 警告。

### 根标签的可见变化

0.18 的口径是“没有根节点时才用文档标题”；1.x **frontmatter 有 `title` 就赢过单个 H1**。
同一个示例页：0.18 的根是 H1「主题覆盖验证」，1.x 的根是 frontmatter 的「思维导图示例」，
H1 变成根的第一个子节点。这是一处**外观变化**，不是数据格式问题；迁移时要么接受（与 1.x
文档一致），要么在 loader 里把 `title` 拿掉以保住旧根 —— 见「待定」第 1 条。

### 选项解析

- `resolveViewOptions({}, input)` 在 Node 下可导入可运行；旧键名得到
  `Unknown option …` 警告，合法键返回解析后的 `ViewOptions`。
- `theme` / `layout` 会被解析成**对象**（`options.theme`、`options.layout`），不是名字串。
  所以**不能**在构建期解析完再把 `options` 序列化进 md 模块：那对象里将来一旦带函数，
  `JSON.stringify` 会静默丢字段。构建期只拿 `warnings`，运行时用原文再解析一遍。

### 渲染层可用的钩子

- 包内没有 `.css` 文件：view / toolbar 在运行时注入 `<style>`，入口里
  `require.resolve('markmap-toolbar/dist/style.css')` 那条必须删，否则构建直接失败。
- `Markmap` 构造时给元素加 `markmap` 与一个唯一 scope 类（`element.classList.add("markmap", scopeClass)`），
  所以 e2e 的 `svg.markmap` 还能用。
- 节点是 `<g data-node-id="…">`，**没有** `markmap-node` 类；e2e 的 `g.markmap-node` 要换成
  `g[data-node-id]`。
- 链接在 SVG 序列化时写成 `<a href=… target="_blank">`，e2e 可以直接钉这个属性。
- 工具条元素类名 `.markmap-toolbar`；颜色读 `--mm-*`。`mm.themeClass` 是那条 scope 类，
  文档明确说“加在导图旁边的控件上，它们就能用同一套令牌”——工具条因此要挂它。
- `@markmap/toolbar` 的 peer 是 `@markmap/view ^1.1.0`，三个包必须同一条版本线。

## 方案取舍

### A 直接用 `@markmap/view` + `@markmap/toolbar`（选它）

与现在的接线最接近：一个 `<svg>`、一个工具条 `div`、一把 `Markmap` 实例。错误外壳、
`ViewLayerDocItem`、按需加载、高度 CSS 都不动。

### B 换成 `<markmap-view>` Web Component

少写实例管理，但样式进了 Shadow Root：本层现在的 CSS（高度、工具条定位）与 e2e 的选择器都要
改从 `::part()` 走；组件内部自带工具条与 `color-scheme`，站点 `useColorMode` 的驱动要换一条路；
错误边界也得重新找落点。收益与改动量不匹配，不选。

### 数据侧：运行时解析选项（选它）

构建期只做两件事：判定 `markmap:` 开没开（现状不动）、`parse()` 出树与 frontmatter。
选项在浏览器里 `resolveViewOptions({}, fm?.markmap)`，避免把带函数的 theme/layout 对象
塞进 JSON。构建期可以额外跑一次只为收集 `warnings`（见待定第 2 条），但**不序列化解析结果**。

### 旧选项名：clean break（选它）

`initialExpandLevel` → `foldLevel`、`maxWidth` → `wrapWidth`、`colorFreezeLevel` → `colorDepth`、
`spacingHorizontal` → `levelGap`、`spacingVertical` → `siblingGap`。1.x 自己会对旧键名给
warning；本层不再维护一份兼容映射（映射表会随厂商选项面继续漂，且旧名语义并不总是一一对应）。
README 给对照表即可。

## 实施落点

1. [`package.json`](./packages/theme-markmap/package.json)（36–39 行）：删四个 `markmap-*`，
   加 `@markmap/parse`、`@markmap/view`、`@markmap/toolbar`、`@markmap/core`（类型），
   统一 `^1.1.0`。
2. [`src/index.mts:52-58`](./packages/theme-markmap/src/index.mts)：`getClientModules()` 只留
   `styles/markmap.css`；删 `require.resolve('markmap-toolbar/dist/style.css')`。
3. [`src/types.mts`](./packages/theme-markmap/src/types.mts)：`MarkmapData` 改成
   `{ root: MarkmapNode; frontmatter: Record<string, unknown> }`，删 `CSSItem` / `JSItem` /
   `IFeatures` / `IMarkmapJSONOptions` 那几型。
4. [`src/loader/markmap-data.mts:31-76`](./packages/theme-markmap/src/loader/markmap-data.mts)：
   整段 `Transformer` + `wrapFunction` + markdown-it 链接改写换成 `parse(source)`；返回值
   只留 `root` 与 `frontmatter`。**`md-markmap-loader.mts` 的判定与追加导出的形状不动**
   （`export const markmap` 这个名字是 component-page 那一页的契约）。
5. [`components/markmap.tsx`](./packages/theme-markmap/components/markmap.tsx)：
   - `resolveViewOptions({}, fm?.markmap)` 拿 `options` 与 `warnings`；
   - `Markmap.create(container.current!, root, options)`；
   - `createToolbar(mm, { items: defaultToolbarItems })`，`bar.element` 追加到 wrapper，
     并 `classList.add(mm.themeClass)`；
   - 暗色：创建时 `colorScheme: colorMode`，`colorMode` 变化时
     `mm.setOptions({ ...mm.options, colorScheme: colorMode })`（不重建实例，避免丢折叠状态）；
   - 删 `loadCSS` / `loadJS` / `Toolbar` / `markmap-dark` 外壳；清理改成 `bar.destroy()` +
     `mm.destroy()`。
6. [`styles/markmap.css`](./packages/theme-markmap/styles/markmap.css)：`.mm-toolbar` →
   `.markmap-toolbar`；删 `.mm-toolbar-brand` 与暗色相关注释；高度、草稿条、工具条定位保留。
7. [`theme/MarkmapPage/index.tsx:13`](./packages/theme-markmap/theme/MarkmapPage/index.tsx)：
   `type MarkmapData = never` 这条“类型不引包”的口径保留（仍然只有 `components/markmap.tsx`
   那条动态 import 会把渲染器带进包里）。
8. 单测 [`test/theme-markmap.test.mts`](./test/theme-markmap.test.mts)：
   - 数据五格 → 三格（`root` / `frontmatter` / 可选的 `gfm`）；
   - `root.content` 断言改成 mdast 数组；`markmap: { color: red }` 不再由解析器归一，断言原文；
   - “链接补 `target`”与“原生 HTML 链接”两条从单测删除（renderer 的职责），改由 e2e 钉
     `svg.markmap a[target="_blank"]`；
   - loader 四条分支（写了 / 没写 / 假值 / 解析抛错）原样保留。
9. e2e [`test/e2e/steps/markmap.steps.mts`](./test/e2e/steps/markmap.steps.mts)：
   `g.markmap-node` → `g[data-key^="node:"]`（`data-node-id` 边上那条连线组也有，不能拿它当节点），
   `.mm-toolbar` → `.markmap-toolbar`，`svg.markmap` 保留；
   新增三句：工具条按钮集合（zoom/fit/expand/fold-level，**没有**暗色按钮）、导图里的链接带
   `target="_blank"`、站点切暗色后 `--mm-bg` / `--mm-text` 翻过去。
10. 示例页 [`docs/markmap-demo.md`](./packages/theme-markmap/docs/markmap-demo.md)：正文加一条
    带链接的列表项（给第 9 步那条判据用），并把 frontmatter 改成一个对象选项（例如
    `markmap: { theme: classic, foldLevel: 2 }`），顺带钉“对象选项能落进视图”。
11. 文档：包 README 的选项表与旧名对照、markdown 呈现变化（裸 HTML 丢弃、段落/代码/表格变
    note、MathJax）、根标签规则、已知限制；根 README 与 `test/README.md` 的相关行同步；
    [`knip.jsonc`](./knip.jsonc) 里本包的依赖表若列了旧包，一起换。
12. 版本：`0.2.6` → `0.3.0`，README 顶部写一句“0.3 起依赖 markmap 1.x，frontmatter 选项名与
    markdown 呈现有 breaking”。

## 验收

- `pnpm lint:type`、`pnpm typecheck`、`pnpm lint:eslint:check`、`pnpm lint:version`。
- `pnpm test`（含改写后的 `theme-markmap.test.mts`）。
- `pnpm build` + `pnpm verify:chain`。
- `pnpm test:e2e` 的 markmap 场景全绿，含新增的工具条、链接、暗色三句。
- 量两处并记录：本页导图 chunk 的体积（1.x 换了整条渲染链）、`export const markmap` 序列化后的
  字节数（结构化树 + note 的 mdast 可能比旧 HTML 串大）。超过原来 1.5 倍要在 README 的已知限制
  里记一笔。
- `npm pack` 产物里不再有 `markmap-toolbar/dist/style.css` 的引用；`@markmap/*` 三包版本一致。

## 实施时定下的

1. **根标签用谁**：接受 1.x 的规则 —— frontmatter 有 `title` 时它就是根，H1 作子节点；
   单测与 README 都按这个记。
2. **选项警告往哪报**：构建期。loader 里对 `markmap` 对象跑一次 `resolveViewOptions`，把
   `warnings` 用 `this.emitWarning` 带上页面路径；`@markmap/view` 在 Node 下可导入（实测）。
3. **暗色更新的写法**：`setOptions({ ...mm.options, colorScheme })`；e2e 的「切暗色后
   `--mm-*` 跟着翻」通过。折叠状态没有单独钉（`setOptions` 不重建树，风险低）。
4. **MathJax**：不装；README 的已知限制里写明“要用公式得自己挂插件”。
5. **旧消费者的兼容**：clean break。`0.3.0` + README 的「从 0.2 升到 0.3」一节传达。

## 不做的

- 不接 `@markmap/canvas`（超大图才需要，本站示例用不上）。
- 不接 PNG/SVG 导出按钮（现在也没有）。
- 不接 `@markmap/autoloader` / `<markmap-view>` Web Component。
- 不动 frontmatter 判定、component-page 判表、`ViewLayerDocItem` 外壳与按需加载。

## 实施记录（2026-11-13）

- 依赖：`0.2.9` → `0.3.0`；四个 `markmap-*` 换成 `@markmap/core` / `parse` / `view` / `toolbar`
  1.1.x（安装时 `+15 -52` 个包）。loader 的 `getClientModules()` 只留本仓那份 CSS。
- 代码：`markmap-data.mts` 收成 `parse()` 薄包装；`markmap.tsx` 换 `resolveViewOptions` +
  `Markmap.create(svg, root, options)` + `createToolbar`，暗色走 `colorScheme` / `setOptions`；
  loader 对对象选项跑一次 `resolveViewOptions` 并用 `emitWarning` 带页面路径报警。
- 判据：单测改成结构化树（772 通过 / 3 跳过）；e2e 的节点选择器最终用
  `g[data-key^="node:"]`（`data-node-id` 连线组也有），工具条 `.markmap-toolbar`，新增
  「没有暗色按钮」「链接 `target="_blank"`」「切暗色后 `--mm-*` 翻」三句；全量 47 条通过。
- 体积：本页导图 chunk **107,376 B**（未压缩）；`export const markmap` 序列化 **2,288 字符**。
  升级前的基线没有采（旧包已移出 node_modules），因此「1.5 倍」那条比较这次没法做，只能记现状。
- 门禁：`lint:type`、`typecheck`、`lint:eslint:check`、`lint:version`、`test:coverage`、
  `build`、`verify:chain`、`verify:context-deps` 全绿。`lint:knip` 的失败落在
  `theme-word-count` 那份未提交的进行中改动上（`../types/word-count.ts` 解析不到），与本次无关。

## 参考

- 迁移指南：<https://github.com/markmap/markmap/blob/v1.1.0/docs/migration.md>。
- 选项与主题：`docs/guide/options.md`、`docs/guide/themes-and-layouts.md`（同一 tag）。
- 视图/工具条 API：`@markmap/view` 的 `markmap.d.ts`、`@markmap/toolbar` 的 `toolbar.d.ts`
  （1.1.0 tarball 内）。
- 本仓现状：[`markmap-data.mts`](./packages/theme-markmap/src/loader/markmap-data.mts)、
  [`markmap.tsx`](./packages/theme-markmap/components/markmap.tsx)、
  [`markmap.steps.mts`](./test/e2e/steps/markmap.steps.mts)。
