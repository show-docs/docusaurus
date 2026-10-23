# @show-docs/docusaurus-plugin-frontmatter-injector

按规则给 md 注入 frontmatter。注入的是**元数据**，走的是官方那条解析路径，所以侧边栏、
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
  plugins: ['@show-docs/docusaurus-plugin-frontmatter-injector'],
};
```

不传选项时用包内那份 `defaultRules`。要自己的规则就传一份：

```js
export default {
  plugins: [
    [
      '@show-docs/docusaurus-plugin-frontmatter-injector',
      {
        rules: [
          {
            name: 'api 页面',
            match: /\/docs\/api\//,
            frontMatter: { draft: false, sidebar_position: 99 },
          },
          {
            name: '给每一页补一份默认 description',
            match: '.md',
            frontMatter: {
              description: ({ filePath }) => `这份文档来自 ${filePath}`,
            },
          },
        ],
      },
    ],
  ],
};
```

## 规则表

一条规则 = 「管哪些文件」+「管到的文件补哪几格」。

| 字段          | 说明                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `name`        | 只用于排查，不参与判定                                                      |
| `match`       | 字符串按**后缀**比（`'.md'` 命中 `a/b.md`，不命中 `a/b.md.bak`）；正则原样 |
| `frontMatter` | 要并进去的那几格；值可以写死，也可以写成「按文件算」的函数                  |

两条口径定了这套东西的行为：

- **只补不覆盖。** 某个键已经在了，规则就不碰它，算值那一步也不会跑。想按原本的写法改写，
  没有这条路 —— 站点写下的东西永远赢。
- **函数不拿原值。** 键不存在才会算，所以函数拿到的是「文件在哪、此刻的 frontmatter 长什么样」，
  不必为「原值是 `true`、字符串、还是对象」写三种分支。返回 `undefined` 表示「这份文件我不表态」。

补默认值不等于改开关：一页写了 `markmap: true`，规则补上的是**别的**格子，`true` 原样留着。

### 自带那份规则表

`defaultRules` 管本仓那几把键的前置判据，只对 `.md` 生效：

| 键        | 补什么                                | 为什么                                                       |
| --------- | ------------------------------------- | ------------------------------------------------------------ |
| `markmap` | `{ enabled: false }`                  | 下游只看 `enabled`，补上它「能不能画图」就只有一个判据       |
| `diff`    | `false`                               | 三种写法（`true` / 路径 / `{old,new}`）都算开了，没写才没开 |
| `iframe`  | （不补）                              | 补个空壳等于塞进去一个没有地址的框，那一层只会渲染出白屏     |

`iframe` 那条留着不表态，是想让「规则表」这个词名副其实：能不能补，规则作者说了算。

## 使用约束

- **只对「元数据」负责。** 正文一个字都不动。要改 yaml 文本本身（让 markdown 之外的工具也看见），
  那是 `markdown.preprocessor` 的活，不是插件的活。
- **注入是站点级单例。** 本插件改的是 `siteConfig.markdown.parseFrontMatter`，那是**一份**
  函数。所以它会**包装**当前那一份（站点自己接 CMS 的那份照旧生效），而不是替换。
- **注入的值要过得了消费方的 schema。** `DocFrontMatterSchema` 带 `.unknown()`，所以自定义键
  （`markmap` / `iframe` / `diff`）能活下来；但 `title` 写非字符串、`sidebar_position` 写字符串
  会被打回 —— 那是消费方的规矩，不是本插件的。

## 告警

本包几乎不告警：规则表写错了是**你的**规则表写错，构建期没有「猜错了」这件事。
唯一会让注入静默失效的路径是「别人在本插件之后再直接替换 `parseFrontMatter`」，
那条路上没有任何钩子可以拦（见 [`docs/internals.md`](./docs/internals.md) 的「已知限制」）。

## 已知限制

- **依赖内部实现。** `markdown.parseFrontMatter` 是官方配置项，但「mdx-loader 会读它、
  docs 插件 `contentLoaded` 之前它就定下来了」这两件事是**时序**结论，不是承诺。
  升级 core 后按 [`docs/internals.md`](./docs/internals.md) 的「升级检查单」跑一遍。
- **只管 md/mdx。** 其它文件（`.dbml`）在各自 loader 里处理，与本包无关。
- **不写磁盘。** 磁盘上的 md 一个字都不改，所以 `git status` 永远是干净的、
  dev 模式不会因为注入反复重编译。
