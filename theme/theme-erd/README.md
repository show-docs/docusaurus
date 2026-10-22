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
  // 不带选项 = 只有 `@dbml/core` 那四个固定格式；导出模板要自己配，见下面的「配置」
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
- 四个固定格式的页签：`DBML`、`MySQL`、`PostgreSQL`、`JSON`（`@dbml/core` 自己的导出）。
- 一串导出模板页签：由插件的 `exports` 选项决定，本包不随带模板 —— 不配就只有上面那四个。
- 枚举与表字段的说明表格（字段、含义、类型、非空、唯一、自增、默认值）。

## 层栈

本层提供 `theme/DocItem/index.tsx`：它先向下面那一层要 `DocItem` 的实现
（`@theme-prev/DocItem`），把关系图摆在它前面，正文那一格照常交下去。命不中（这一页不是
`.dbml`，产物里没有 `dbml_json` 那条导出）时原样交回，这一页看不出这一层存在过。

层栈怎么推导、谁能盖住谁，是核心解析器那一格的事，见
[`plugin-prev-layer-resolver` 的 README](../../plugins/plugin-prev-layer-resolver/README.md)；
这一层自己只负责「摆在哪一格」。

## 配置

插件只有一个选项：`exports` —— 正文下方那一串**导出模板页签**，每一条指向一个外接模块。
本包不随带任何模板：不写这一项，页面就只有 `@dbml/core` 自己那四个格式；写了，清单里有几条
就出几格。

```js
// docusaurus.config.mjs
export default {
  plugins: [
    [
      '@show-docs/docusaurus-theme-erd',
      {
        exports: [
          // 站点自己写的一份：相对路径按站点根解析
          {
            id: 'table-names',
            label: '表清单',
            lang: 'text',
            module: './erd/table-names.mjs'
          },
          // 也可以是站点装的任何一个包（子路径要那个包自己在 exports 里放行）
          {
            id: 'dto',
            label: 'Java DTO',
            lang: 'java',
            module: 'my-erd-generators/dto.mjs'
          }
        ]
      }
    ]
  ]
};
```

每一项四件都必填：`id`（页签的标识，一份清单里不能重复）、`label`（页签上显示的名字）、
`lang`（代码块语言，决定高亮）、`module`（生成器模块）。清单里的顺序就是页签的顺序，
整串接在那四个固定格式之后。

`module` 认三种写法：绝对路径原样用；`./` 或 `../` 开头相对**站点根**（不是相对本包）；
其余按包名解析，走的是站点自己的依赖视野，所以外接生成器可以是站点装的任何一个包。

### 生成器模块要导出什么

默认导出一个函数，拿到 `{ model, dbml }`，返回一个字符串 —— 那个字符串就是这一格页签里的
代码正文：

```js
// erd/table-names.mjs —— 仓库里那份示例页用的就是这一条
export default function generate({ model }) {
  return Object.values(model.tables)
    .map((table) => `${table.name}：${table.fieldIds.length} 列`)
    .join('\n');
}
```

`model` 是 `@dbml/core` 归一化后的模型（页面上那条 `dbml_json` 就是它），`dbml` 是摘掉文件头
frontmatter 之后的原文。这两件在构建期就有了：生成器只在构建期跑，产物是文本，不会进浏览器包。

出错时构建会停下来，那句消息点名到具体页签：模块装不上、默认导出不是个函数、函数自己抛错，
三种各一句，都带上这一条的 `label` 与 `id`。

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
- 导出模板全靠站点提供：生成器只在构建期跑、只返回一段文本，需要浏览器交互的那种导出格式
  这一层给不了。

## 相关文档

- [维护者文档](./docs/internals.md)：组成、`@dbml/core` 实测到的形状、导出模板插拔在实现上的
  三个约束。
- [数据库关系图示例](../../docs/erd-demo.dbml) 与站点那份示例模板
  [`erd/table-names.mjs`](../../erd/table-names.mjs)。
- [DBML 语法](https://dbml.dbdiagram.io/docs/)。
