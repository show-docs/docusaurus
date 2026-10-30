# theme-erd 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、`@dbml/core` 实测到的形状、导出模板插拔在
实现上的三个约束，以及这一层最容易踩的两处。使用者要看的（怎么触发、页面上有什么、有哪些局限）
在 [`README.md`](../README.md)，这里不重复。

## 组成

| 文件                         | 编译吗              | 职责                                                                                                                                                       |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.mts`              | ✅ `src/` → `dist/` | 入口：校验插件选项、算出这一页要装载哪些生成器、给出层目录、把 loader 挂到 `.dbml` 上，并用 `loadContent()` 把 `dbml_json` 那一页交给 theme-component-page |
| `src/component-pages.mts`    | ✅                  | 交给 theme-component-page 的那一条：`{ key: 'dbml_json', match: 'any', component: '@theme/ErdPage' }`                                                      |
| `src/options.mts`            | ✅                  | 配置期判据（纯函数）：清单的形状检查、`module` 三种写法的解析                                                                                              |
| `src/loader/dbml-loader.mts` | ✅                  | `.dbml` 原文 → MDX：摘掉头部 frontmatter、解析成模型、装载每一条生成器、拼出页签与两张表格，并写出 `export const dbml_json`                                |
| `src/types.mts`              | ✅（只出类型）      | 把 `@dbml/core` 归一化模型补齐成能用的类型（见下），以及生成器契约那三型                                                                                   |
| `erdiagram.d.ts`             | ❌（随包发的声明）  | `erdiagram` 那份包缺的类型声明                                                                                                                             |
| `theme/ErdPage/index.tsx`    | ❌ 站点编译         | 本层那一页：theme-component-page 判中 `dbml_json` 后整页换成它，它把关系图摆在官方 `DocItem` 前面                                                          |
| `components/erd-chart.tsx`   | ❌ 站点编译         | 浏览器侧：把模型交给 `erdiagram` 画关系图，初始化后缩放到能看见全部表节点                                                                                  |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

## `@dbml/core` 实测到的几件事

- **语法错与引用错抛的不是 `Error`**，而是 `{ diags: [{ message, filepath, location, code }] }`。
  七种坏输入（少一个 `}`、引用不存在的表、重名表、`[note:]` 之外的自定义设置、表没有名字、
  索引里重复列、一条线两端同一个字段……）在 `json`、`mysql`、`postgres` 三种格式上都是这一份
  形状；而 webpack 的 loader 回调只认 `Error`，要收成一句能定位的话得本包自己拼。
  这条现状由 `test/theme-erd.test.mts` 钉着。
- 字段类型是**整串**带参数的：`varchar(32)` 的 `type_name` 就是 `varchar(32)`，
  `args` 另有 `32`。写模板时把参数当成一个独立类型（`varchar(32)` ≠ `varchar`）是最常见的错，
  要长度就取 `args`。
- 归一化模型的声明漏了 `type.args`（导出的 JSON 里一直带着），那几张表又都是纯数字索引签名，
  `Object.values()` 认不出形状。这两格都补在 `src/types.mts` 里，取集合时按那几个别名断言一次。
- 只有枚举、没有表的文件也能导出：`mysql` 那一份是空串，页签里就是一段空代码。

## 导出模板是可插拔的：三处要知道的 mechanics

本包不随带任何模板：清单从哪来、生成器要默认导出一个函数这些写法在
[`README.md` 的「配置」](../README.md#配置)，这里只记实现这一层的三个约束。

- **生成器契约只有一个默认导出**。loader 拿 `import(pathToFileURL(module).href)` 的结果，
  只认 `.default`；不是函数就报一句「没有默认导出一个函数」，并点名是哪一条页签。站点配的每一条
  都走这同一条路径，没有旁路。
- **写进 webpack 配置的 loader options 只能是纯数据**。webpack 会把 options 序列化进配置，
  函数过不去，所以清单里传的是**模块路径字符串**，装载动作留在构建期的 loader 里做。路径在
  配置期就算成绝对路径（`src/options.mts` 的 `resolveExportModule`：绝对路径原样用、
  `./` 与 `../` 相对**站点根**、其余按包名走 Node 的解析，站点装什么包就能引什么）。
  解析不出来的包名在配置期就红，不等构建期。
- **缓存键要自己补**。`this.cacheable()` 认的是 `.dbml` 文件本身，不认动态 `import()` 进来的
  模块；所以 loader 对每一条清单项都调一次 `this.addDependency(spec.module)`，改生成器才会让
  那一页失效重算。这条由 `test/theme-erd.test.mts` 里「每一项生成器都登记成缓存依赖」钉着。

## 代码块页签为什么写成组件

`createTabs()` 直接吐 `<Tabs>` / `<TabItem>`：代码块上的 `tab="X"` 那类元数据在 Docusaurus 3
不再生成页签。这一层不往产物里写 frontmatter：站点那份（标题、说明、侧栏名）留在文件头上给
Docusaurus 读，DBML 解析器只收 `---` 块之后的部分 —— 所以那一页的 `<h1>` 与别的文档页同一个来源。

## 用例与红线

- 构建期判据：`test/theme-erd.test.mts` —— 夹具是真 DBML 原文（含站点那份 `packages/theme-erd/docs/erd-demo.dbml`），
  交给 `@dbml/core` 解析成模型再喂给被测函数；外接生成器的夹具在 `test/fixtures/erd-generators/`，
  走的是站点真会用的那一条装载路径；站点自己那一份示例模板 `erd/table-names.mjs` 也在测试里真跑一遍。
  `src/` 全份（`options.mts` 与 `loader/` 那几份）挂在覆盖率红线上（`vitest.config.mts` 的
  `coverage.include` 盖住每个包的 `src/`）。
- 页面上那张图与那一串页签：`test/e2e/features/erd.feature`。
- 交给 component-page 的那一把键：`src/component-pages.mts` 里那把键**就是** loader 写出的导出名，
  `test/theme-erd.test.mts` 拿清单里的 `key` 去核 `export const <key> = ` 那一句，改名漏了一头就红。
- 共用外壳：四条视图层（本包、`theme-markmap`、`theme-diff`，加上机制层那条同源框的框内页面）的兜底、
  视图那一格、宽度补丁与页面组件的全部内容都只有一份实现，住在
  `packages/theme-component-page/lib/view-layer-shell.tsx`，每个包只留「交哪把键、交哪个组件、
  交哪段说法」（四边承接它的分别是 `ErdPage` / `MarkmapPage` / `DiffPage` / `ComponentFramePage`，
  都由 component-page 的清单挂上）。
  `test/view-layer-copies.test.mts` 钉的是这三页「引的是同一份、外壳一字不抄」，
  `test/view-layer-shell.test.mts` 量共享实现自己的分支。
