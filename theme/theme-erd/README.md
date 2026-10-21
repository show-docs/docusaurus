# @show-docs/docusaurus-theme-erd

把 DBML 文件变成文档页：正文上方渲染数据库关系图，下方附上同一份模型的各格式导出。
判据是**文件扩展名**：`.dbml` 命中，其余文件这一层等于透明。

## 安装

```bash
pnpm add @show-docs/docusaurus-theme-erd
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: ['@show-docs/docusaurus-theme-erd']
};
```

### 让 docs 插件收 `.dbml`

docs 插件默认只收 `.md` / `.mdx`，`.dbml` 文件要自己写进 `include`：

```js
// docusaurus.config.mjs 的 preset 选项
export default {
  presets: [['classic', { docs: { include: ['**/*.{md,mdx,dbml}'] } }]]
};
```

### 写一份 `.dbml`

```dbml
---
title: 数据库关系图示例
description: 一份 DBML 文件：上方渲染关系图，正文附上各格式导出。
---

Table users {
  id integer [pk, increment]
  name varchar(64) [not null, note: '用户名']
}
```

文件头的 YAML frontmatter 交给 Docusaurus（标题、说明、侧栏名都照常生效），
loader 会先摘掉它再把剩下的部分交给 DBML 解析器。

页面内容是：

- 关系图：表、字段、枚举与连线，画在正文上方。
- 六个代码页：`DBML`、`MySQL`、`PostgreSQL`、`JSON`、`JSON Schema`、`Spring Data JPA`。
- 枚举与表字段的说明表格（字段、含义、类型、非空、唯一、自增、默认值）。

## 配置

没有插件选项。JSON Schema 与 Spring Data JPA 两页是固定模板（字段命名与 Java 类型映射
按旧主题的约定），适合当起点，不追求覆盖所有 DBML 类型。

## 工作方式

- 构建时由 webpack loader 把 `.dbml` 原文转成 MDX，再交给官方 `mdx-loader`；关系图数据
  以 `export const dbml_json` 的形式随文档模块走到浏览器。
- 关系图在 `DocItem` 前渲染，正文仍由官方 `DocItem` 正常渲染。
- 关系图在浏览器端初始化，再缩放到能看见全部表节点。
- 关系图初始化失败时显示一条提示，正文继续渲染。

## 已知限制

- 只有 `.dbml` 触发；把同样的内容写进 `.md` 不会渲染。
- 关系图画在浏览器里，静态 HTML 里没有图，对搜索引擎不可见。
- 画布与节点配色由 `erdiagram` 固定，深色模式下不跟随站点主题。
- 表格说明取自 DBML 的 note；note 里若写 `<` 这类 MDX 语法字符，正文可能被当成 JSX 解析。
- Java 代码按项目模板生成（继承 `BaseEntity` / `BaseJpaService` 等），换项目要跟着改模板。

## 相关文档

- [数据库关系图示例](../../docs/erd-demo.dbml)。
- [DBML 语法](https://dbml.dbdiagram.io/docs/)。
