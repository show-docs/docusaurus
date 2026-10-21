# theme-erd 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、`@dbml/core` 实测到的形状、两种导出模板里
写死的那套约定，以及这一层最容易踩的两处。使用者要看的（怎么触发、页面上有什么、有哪些局限）
在 [`README.md`](../README.md)，这里不重复。

## 组成

| 文件                            | 编译吗              | 职责                                                                                        |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `src/index.mts`                 | ✅ `src/` → `dist/` | 入口：给出层目录、把这条 loader 挂到 `.dbml` 上、交出本包的 babel 规则                      |
| `src/loader/dbml-loader.mts`    | ✅                  | `.dbml` 原文 → MDX：摘掉头部 frontmatter、解析成模型、拼出六个页签与两张说明表格            |
| `src/loader/dbml2schema.mts`    | ✅                  | 其中一页：JSON Schema（每张表一份，字段名转驼峰，`format` 按类型与常见字段名给）            |
| `src/loader/dbml2jpa.mts`       | ✅                  | 其中一页：Spring Data JPA（实体 / repository / service / 定时任务四份，一套写死的映射约定） |
| `src/types.mts`                 | ✅（只出类型）      | 把 `@dbml/core` 归一化模型补齐成能用的类型（见下）                                          |
| `erdiagram.d.ts`                | ❌（随包发的声明）  | `erdiagram` 那份包缺的类型声明                                                              |
| `theme/DocItem/index.tsx`       | ❌ 站点编译         | 本层那一格：`content.dbml_json` 命中就把关系图摆在 `DocItem` 前面                           |
| `components/erd-chart.tsx`      | ❌ 站点编译         | 浏览器侧：把模型交给 `erdiagram` 画关系图，初始化后缩放到能看见全部表节点                   |
| `components/error-boundary.tsx` | ❌ 站点编译         | 初始化失败时那一条提示（三条视图层各有一份，见「跨包副本」）                                |
| `components/hack-style.tsx`     | ❌ 站点编译         | 那一格正文容器需要的样式补丁（同上，三份逐字相同）                                          |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

## `@dbml/core` 实测到的几件事

- **语法错与引用错抛的不是 `Error`**，而是 `{ diags: [{ message, filepath, location, code }] }`。
  七种坏输入（少一个 `}`、引用不存在的表、重名表、`[note:]` 之外的自定义设置、表没有名字、
  索引里重复列、一条线两端同一个字段……）在 `json`、`mysql`、`postgres` 三种格式上都是这一份
  形状；而 webpack 的 loader 回调只认 `Error`，要收成一句能定位的话得本包自己拼。
  这条现状由 `test/theme-erd.test.mts` 钉着。
- 字段类型是**整串**带参数的：`varchar(32)` 的 `type_name` 就是 `varchar(32)`，
  `args` 另有 `32`。`dbml2jpa` 用 `args` 生成 `length = 32`，别处按 `type_name` 判类型时
  不要把参数当成了一个独立类型。
- 归一化模型的声明漏了 `type.args`（导出的 JSON 里一直带着），那几张表又都是纯数字索引签名，
  `Object.values()` 认不出形状。这两格都补在 `src/types.mts` 里，取集合时按那几个别名断言一次。
- 只有枚举、没有表的文件也能导出：`mysql` 那一份是空串，页签里就是一段空代码。

## 两页模板里写死的约定

`dbml2schema` 与 `dbml2jpa` 生成的是**项目模板级**的产物，不是通用映射，判据都在这两份文件里：

- `id` 与 `create_time` 当成所有表共有的基类字段，两处都跳过（`BaseEntity` 已有）。
  跳过判据认的是**字段名**，改名（`createdAt`）就不跳了。
- Java 类型只认 `integer` / `date` / `time` / `timestamp` / `bool` / `organization_type`
  这几种写法，其余一律 `String`。
- JSON Schema 的 `format`：类型那一半认 `date` / `timestamp` / `bool`；字段名那一半认
  `batch_id` / `serial_number` / `user_id` / `org_id` / `area_id` / `duration`，
  剩下的是「`_id` 结尾算 `objectId`、`_url` 结尾算 `file-url`」两条兜底。
  字段名那一半在前，所以一张表里真有一个表示时长的 `duration` 字段时，它拿到的
  `format` 是 `duration` 而不是别的。
- `record_date` / `record_time` 这两颗名字决定 repository、service、定时任务各生成哪一套方法。
- 实体继承 `BaseEntity` / `BaseJpaService`，包名写死成 `com.example.demo.*`
  （模板级起点，不追求覆盖所有 DBML 类型；换项目要跟着改的就是这几行）。
- JSON Schema 里那个 `$schema` 指向的是一个外部站点上的表格式定义，站点自己的 schema 没有这一格。

## 代码块页签为什么写成组件

`createTabs()` 直接吐 `<Tabs>` / `<TabItem>`：代码块上的 `tab="X"` 那类元数据在 Docusaurus 3
不再生成页签。`hide_title: true` 那一段是本包自己写的 frontmatter，站点那份（标题、说明、
侧栏名）留在文件头上给 Docusaurus 读，DBML 解析器只收 `---` 块之后的部分。

## 用例与红线

- 构建期判据：`test/theme-erd.test.mts` —— 夹具是真 DBML 原文（含站点那份 `docs/erd-demo.dbml`），
  交给 `@dbml/core` 解析成模型再喂给被测函数；`src/loader/` 三份挂在覆盖率红线上
  （`vitest.config.mts` 的 `coverage.include`）。
- 页面上那张图与六个页签：`test/e2e/features/erd.feature`。
- 跨包副本：`test/view-layer-copies.test.mts` 钉住 `hack-style.tsx` 三份逐字相同、
  `error-boundary.tsx` 与 `theme/DocItem/index.tsx` 只允许差在本层自己的名字与说法上。
