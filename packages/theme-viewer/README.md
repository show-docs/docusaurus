# @show-docs/docusaurus-theme-viewer

把文档正文里的图片交给查看器：点开任意一张，图片在顶层放大，工具条给出放大、缩小、原尺寸、
重置与前后切换。判据是**正文里有没有图片**，不看 frontmatter：没有图片的页面这一层等于透明。

## 安装

`theme/` 与 `components/` 是随包发布的未编译 TS 源码，编译它们的 babel 规则由解析器插件一处
认领；theme-iframe 只在构建期提供一条共享函数，装上即可，不必注册成插件。三个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-iframe @show-docs/docusaurus-theme-viewer
```

站点的 CSS 压缩器必须是 lightningcss：`viewerjs` 那份样式表写的是 CSS 原生嵌套，Docusaurus
默认的 cssnano + clean-css 会把它压坏（子规则并进父选择器、括号失衡）。在配置里打开：

```js
// docusaurus.config.mjs
export default {
  future: {
    faster: {
      lightningCssMinimizer: true
    }
  }
};
```

本层在 `loadContent()` 里检查这一格，没开时构建直接报错，不会等到产物里样式坏掉。

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@show-docs/docusaurus-theme-viewer'
  ]
};
```

### 正文里放图片

```md
![主题层栈示意](/img/viewer-demo.svg)
```

注册之后，每篇文档正文里的图片都归查看器管。同一页的多张图进同一个图集，查看器里的
「上一张 / 下一张」按它们在页面里出现的顺序走。

## 层栈

本层提供 `theme/DocItem/Content/index.tsx`：它拿官方那一份 `DocItem/Content`
（`@theme-init/DocItem/Content`；仓库里只有本层提供这一格，没有要串的链），正文原样交下去，
只在它外面套一层查看器。这一层不摆自己的 DOM、也不读 frontmatter，命不中（正文没有图片）时
等于透明。

层栈怎么推导、谁能盖住谁，是核心解析器那一格的事，见
[`plugin-prev-layer-resolver` 的 README](../plugin-prev-layer-resolver/README.md)；
这一层自己只负责「挂在哪一格」。

## 配置

没有插件选项。工具条上摆哪几颗按钮写死在 `components/viewer.tsx` 的 `options` 里
（放大、缩小、原尺寸、重置、前后切换；旋转、翻转与自动播放不摆）。

## 工作方式

- 这一层覆盖 `DocItem/Content`，拿官方那一份（`@theme-init/DocItem/Content`）原样渲染；
  它自己不放任何 DOM，只在正文落位之后把里面的图片接上查看器。
- `viewerjs` 在浏览器里按需加载：正文没有图片的页面不会请求它。
- 第三方那份样式表要过站点的样式表管线：嵌套由宿主的 lightningcss 处理，本包只把展开态的
  先后顺序改写成特异性（否则查看器打开是透明的）；实测口径见[维护者文档](./docs/internals.md)。
- 换页时先销毁上一个查看器再接新的一页，图片清单跟着页面走。
- 初始化失败只在控制台留一条 warning，正文照常渲染。

## 已知限制

- 只接管文档正文（`.theme-doc-markdown`）里的图片，navbar 与页脚里的图片不受影响。
- 查看器是浏览器里的行为，静态 HTML 里没有它。
- 放大取的是 `<img>` 自己那个地址，本层不支持「缩略图 + 另一份大图」那套写法。
- 查看器界面的配色由 `viewerjs` 那份样式表决定，不跟站点的亮暗模式；本层只另改了标题颜色
  与缩略图宽度两处（`styles/viewer.css`）。

## 相关文档

- [维护者文档](./docs/internals.md)：组成、挂与不挂的两处判据、第三方样式表要补的那两处。
- [图片查看器示例](./docs/viewer-demo.md)。
- [viewerjs 文档](https://fengyuanchen.github.io/viewerjs/)。
