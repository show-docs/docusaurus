# theme-viewer 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、查看器在什么条件下才挂、第三方那份样式表过
站点管线时替它补的两处。使用者要看的（怎么触发、工具条上有哪几颗按钮、有哪些局限）在
[`README.md`](../README.md)，这里不重复。

## 组成

| 文件                              | 编译吗                 | 职责                                                                           |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `src/index.mts`                   | ✅ `src/` → `dist/`    | 入口：给出层目录、把两份样式表作为 client module 交给站点、补 postcss 与 babel |
| `theme/DocItem/Content/index.tsx` | ❌ 站点编译            | 本层那一格：正文原样交给下面的实现，只在它外面套一层查看器                     |
| `components/viewer.tsx`           | ❌ 站点编译            | 浏览器侧：判断「正文里有没有图片」、按需加载 `viewerjs`、换页时销毁            |
| `styles/viewer.css`               | ❌（样式表，不是模块） | 收第三方那份的三处：展开态、标题、缩略图宽度                                   |
| `tsconfig.build.json`             | ——                     | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                         |

「编译吗」那一列的判据是谁编译 —— 站点的 Docusaurus 会编译 `theme/` 与 `components/`，
本包就不编译第二遍；口径的产地在仓库根 README 的「构建包的编译口径」。

这一层覆盖的是 `DocItem/Content`，不是 `DocItem`：它不摆任何东西、也不读 frontmatter，
判据是正文里真的有 `<img>`。命不中时这一层等于透明。

## 挂与不挂，只在两处判

- 判据落在 `document.querySelector('.container .theme-doc-markdown.markdown')` 上，
  再数这一格里 `<img>` 的个数：为 0 就直接返回，`viewerjs` 那份**不会**被下载。
  换页走客户端路由，所以 `useEffect` 的依赖是 `useLocation().pathname`。
- 清理那一趟可能跑在动态 `import()` 回来之前 —— 那时正文已经换成新的一页了。
  所以除了 `viewer?.destroy()`，还留一个 `stopped` 标志：已经清理过就不再 new。
  这一格是 `test/e2e/features/viewer.feature` 里「换页不留容器」那条用例的来源。

## 第三方那份样式表要补的两处

`viewerjs/dist/viewer.css` 与本包的 `styles/viewer.css` 都从 `getClientModules()` 交给站点，
于是都过站点的样式表管线。两处都是这一家管线咬合不上造成的，实测口径：

1. **CSS 原生嵌套**。第三方那份写的是嵌套（`.viewer-navbar.viewer-small > .viewer-list` 里套
   `> li { … }`）。站点那份 `postcss-preset-env` 按 browserslist 决定要不要摊平，而现代浏览器
   原生支持嵌套，这一步整个跳过，嵌套原样交给压缩器；压缩器不认嵌套，会把子层的声明并进父选择器、
   再多吐一个 `}`，从第一条嵌套规则往后就是坏的样式表。所以入口的 `configurePostCss()` 按本包
   自带的 `postcss-nesting` 补一次摊平，不依赖站点把 browserslist 配成什么。
2. **先后顺序被合并改掉**。第三方靠 `.viewer-fade`（`opacity: 0`）与 `.viewer-in`（`opacity: 1`）
   的**先后**分出展开态，而压缩器会把声明相同的选择器并到一处 —— 并完 `.viewer-in` 就跑到了
   `.viewer-fade` 前面，容器上两个类同时在场时读回 0：查看器打开了但整层是透明的。
   `styles/viewer.css` 把这一格改写成 `.viewer-container.viewer-in`，比的是特异性而不是先后顺序。

这两处都不在厂商代码里，也不在站点的配置里，换 `viewerjs` 版本时要重新走一遍。

## 用例

页面上那一格只有开浏览器才看得见，本包没有构建期判据，所以不进覆盖率红线
（口径见 `test/README.md` 的「覆盖率」一节）：

- `test/e2e/features/viewer.feature`：点开第一张图、工具条那颗「下一张」、Esc 收起、
  换页时上一份查看器随换页销毁。
- `test/plugin.test.mts` 的分包三件套：层目录、样式表与本包清单。
- `test/view-layer-copies.test.mts`：六个主题包入口里那条只覆盖本包的 babel 规则形状一致。
