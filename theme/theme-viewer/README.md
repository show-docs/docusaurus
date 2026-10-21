# @show-docs/docusaurus-theme-viewer

把文档正文里的图片交给查看器：点开任意一张，图片在顶层放大，工具条给出放大、缩小、原尺寸、
重置与前后切换。判据是**正文里有没有图片**，不看 frontmatter：没有图片的页面这一层等于透明。

## 安装

```bash
pnpm add @show-docs/docusaurus-theme-viewer
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: ['@show-docs/docusaurus-theme-viewer']
};
```

### 正文里放图片

```md
![主题层栈示意](/img/viewer-demo.svg)
```

注册之后，每篇文档正文里的图片都归查看器管。同一页的多张图进同一个图集，查看器里的
「上一张 / 下一张」按它们在页面里出现的顺序走。

## 配置

没有插件选项。工具条上摆哪几颗按钮写死在 `components/viewer.tsx` 的 `options` 里
（放大、缩小、原尺寸、重置、前后切换；旋转、翻转与自动播放不摆）。

## 工作方式

- 这一层覆盖 `DocItem/Content`，正文原样交给下面的实现；它自己不放任何 DOM，
  只在正文落位之后把里面的图片接上查看器。
- `viewerjs` 在浏览器里按需加载：正文没有图片的页面不会请求它。
- 第三方那份样式表要过站点的样式表管线，本包替它补了两处：它写的是 CSS 原生嵌套，而压缩器
  不认嵌套（会把子层的声明并进父选择器、再多吐一个 `}`），所以入口的 `configurePostCss()`
  先按本包自带的 `postcss-nesting` 摊平一次；压缩器还会把声明相同的选择器并到一处、
  顺带改变先后顺序，而查看器的「展开」靠的就是 `.viewer-in` 排在 `.viewer-fade` 后面，
  于是展开态读回 `opacity: 0`，`styles/viewer.css` 把这一格写成 `.viewer-container.viewer-in`
  —— 比的是特异性，不是先后顺序。
- 换页时先销毁上一个查看器再接新的一页，图片清单跟着页面走。
- 初始化失败只在控制台留一条 warning，正文照常渲染。

## 已知限制

- 只接管文档正文（`.theme-doc-markdown`）里的图片，navbar 与页脚里的图片不受影响。
- 查看器是浏览器里的行为，静态 HTML 里没有它。
- 放大取的是 `<img>` 自己那个地址，本层不支持「缩略图 + 另一份大图」那套写法。
- 查看器界面的配色由 `viewerjs` 那份样式表决定，不跟站点的亮暗模式；本层只另改了标题颜色
  与缩略图宽度两处（`styles/viewer.css`）。

## 相关文档

- [图片查看器示例](../../docs/viewer-demo.md)。
- [viewerjs 文档](https://fengyuanchen.github.io/viewerjs/)。
