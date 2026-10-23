# @show-docs/docusaurus-plugin-frontmatter-injector

按配置给 md 注入 frontmatter。注入的是**元数据**，走的是官方那条解析路径，所以侧边栏、
`description`、`slug` 与 MDX 组件上的 `props.content.frontMatter` 会一起变 —— 不是只在某一处
打了个补丁。

## 安装

```bash
pnpm add @show-docs/docusaurus-plugin-frontmatter-injector
```

需要 Docusaurus `^3.9.2` 与 Node `^24`。

## 使用

```js
// docusaurus.config.mjs
export default {
  plugins: [
    [
      '@show-docs/docusaurus-plugin-frontmatter-injector',
      {
        rules: [
          { name: 'testing', match: '.md', frontMatter: { testing: true } }
        ]
      }
    ]
  ]
};
```

本包的缺省规则**只有一条**：给每一页 `.md` 补上 `testing: true`（页面自己写了 `testing`
就按页面写的算）。不给任何主题层补默认值：`markmap` / `diff` / `iframe` / `oas3` 那几把键
各自在自己的层里兜，理由见下面「规则表」的第二条口径。

`rules` 传 `[]` 等于本插件什么都不做（连 `parseFrontMatter` 都不替换）。

## 规则表

一条规则 = 「管哪些文件」+「管到的文件补哪几格」。

| 字段          | 说明                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| `name`        | 只用于排查，不参与判定                                                     |
| `match`       | 字符串按**后缀**比（`'.md'` 命中 `a/b.md`，不命中 `a/b.md.bak`）；正则原样 |
| `frontMatter` | 要并进去的那几格；值可以写死，也可以写成「按文件算」的函数                 |

三条口径定了这套东西的行为：

- **只补不覆盖。** 某个键已经在了，规则就不碰它，算值那一步也不会跑。页面自己写下的
  `testing: false` 永远赢。
- **只管自己的键。** 规则表补的是**配置里的**那几格，不去猜别的包怎么读它自己的命名空间
  （同一把键不同层可能各有各的写法，替它补值等于替它改判定口径）。
- **函数不拿原值。** 键不存在才会算，所以函数拿到的是「文件在哪、此刻的 frontmatter 长什么样」，
  返回 `undefined` 表示「这份文件我不表态」，那一格不写、也不计入改动。

## 使用约束

- **只对「元数据」负责。** 正文一个字都不动。要改 yaml 文本本身（让 markdown 之外的工具也看见），
  那是 `markdown.preprocessor` 的活，不是插件的活。
- **注入是站点级单例。** 本插件改的是 `siteConfig.markdown.parseFrontMatter`，那是**一份**
  函数。所以它会**包装**当前那一份（站点自己接 CMS 的那份照旧生效），而不是替换。
- **注入的值要过得了消费方的 schema。** `DocFrontMatterSchema` 带 `.unknown()`，所以自定义键
  （`testing` 这类）能活下来；但 `title` 写非字符串、`sidebar_position` 写字符串会被打回 ——
  那是消费方的规矩，不是本插件的。

## 告警

本包不告警：规则表写错了是**你的**规则表写错，构建期没有「猜错了」这件事。
唯一会让注入静默失效的路径是「别人在本插件之后再直接替换 `parseFrontMatter`」，
那条路上没有任何钩子可以拦（见 [`docs/internals.md`](./docs/internals.md) 的「已知限制」）。

## 已知限制

- **依赖内部实现。** `markdown.parseFrontMatter` 是官方配置项，但「mdx-loader 会读它、
  docs 插件在哪一刻把它读走」这两件事是**时序**结论，不是承诺。因此接线落在
  `loadContent()` 而不是更晚的 `contentLoaded()`（理由见 internals 第 1 条），
  升级 core 后按 [`docs/internals.md`](./docs/internals.md) 的「升级检查单」跑一遍。
- **只管 md/mdx。** 其它文件（`.dbml`）在各自 loader 里处理，与本包无关。
- **不写磁盘。** 磁盘上的 md 一个字都不改，所以 `git status` 永远是干净的、
  dev 模式不会因为注入反复重编译。
