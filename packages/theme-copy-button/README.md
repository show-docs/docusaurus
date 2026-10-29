# @show-docs/docusaurus-theme-copy-button

在页脚那一格加一颗复制按钮：点一下把此刻地址栏里的页面地址写进剪贴板，成败都给一条提示。
页脚原本的文案一个字都不改。

## 安装

`theme/` 与 `components/` 是随包发布的未编译 TS 源码，编译它们的 babel 规则由解析器插件一处
认领；theme-iframe 只在构建期提供一条共享函数，装上即可，不必注册成插件。三个包一起安装：

```bash
pnpm add @show-docs/docusaurus-plugin-prev-layer-resolver @show-docs/docusaurus-theme-iframe @show-docs/docusaurus-theme-copy-button
```

## 使用

### 注册插件

```js
// docusaurus.config.mjs
export default {
  plugins: [
    '@show-docs/docusaurus-plugin-prev-layer-resolver',
    '@show-docs/docusaurus-theme-copy-button'
  ]
};
```

### 页脚要有内容

这一层覆盖的是页脚里的 `Footer/Copyright` 那一格，所以站点得给它东西渲染：
`themeConfig.footer.copyright` 写过才看得见这一格，没写的站点里这一层等于不存在。

## 层栈

本层提供 `theme/Footer/Copyright/index.tsx`：它拿官方那一份 `Footer/Copyright`
（`@theme-init/Footer/Copyright`；仓库里只有本层提供这一格，没有要串的链），把文案原样交下去，
只在它前面多摆一颗按钮。这一层不读 frontmatter，也没有插件选项。

层栈怎么推导、谁能盖住谁，是核心解析器那一格的事，见
[`plugin-prev-layer-resolver` 的 README](../plugin-prev-layer-resolver/README.md)；
这一层自己只负责「挂在哪一格」。

## 工作方式

- 按钮是 `<button type="button">`，图标是 `styles/copy-button.css` 里纯 CSS 画的一份形状，
  不请求图标字体也不带图片；按钮上没有文字，读屏拿到的名字是 `aria-label` 那一句。
- 复制走 `navigator.clipboard.writeText()`，提示条由 [`sonner`](https://sonner.emilkowal.ski/)
  给（`<Toaster position="bottom-right" richColors />`，跟按钮一起挂在这一格里）。
- 写进剪贴板的是 `window.location.href` 解码之后那一份，所以地址里带 `?path=` 这类编码参数时，
  复制出来的是看得懂的那一份。
- `styles/copy-button.css` 由入口的 `getClientModules()` 交给站点的样式表管线；
  提示条自己的样式由 `sonner` 在浏览器里注入，不经过这一格。
- 主题层与 `components/` 是未编译的 `.tsx`，随包发布、由用它们的站点编译；
  本包只编译 `src/index.mts` 那一份入口（`pnpm build` → `dist/`）。

## 已知限制

- 只在页脚有 `Footer/Copyright` 那一格时出现；页脚整块关掉（`themeConfig.footer: null`）的站点看不到它。
- `navigator.clipboard` 只在安全上下文（https 或 localhost）里存在。用 http 打开的站点上，
  点击只会给一条「复制失败」的提示，按钮本身照常可点。
- 静态渲染出来的 HTML 里没有提示条：这一层是浏览器里的行为。
- 提示文案（成功与失败各一句）写死在 `components/copy-button.tsx`，不跟站点语言切换。

## 相关文档

- [`plugin-prev-layer-resolver` 的 README](../plugin-prev-layer-resolver/README.md)：`@theme-prev/*` 的语义与层栈。
- [`sonner` 文档](https://sonner.emilkowal.ski/)：提示条的选项与样式。
