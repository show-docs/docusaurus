# theme-viewer 维护者文档

这份写的是**改这个包之前要知道的事**：内部组成、查看器在什么条件下才挂、第三方那份样式表过
站点管线时替它补的两处。使用者要看的（怎么触发、工具条上有哪几颗按钮、有哪些局限）在
[`README.md`](../README.md)，这里不重复。

## 组成

| 文件                              | 编译吗                 | 职责                                                                              |
| --------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `src/index.mts`                   | ✅ `src/` → `dist/`    | 入口：给出层目录、把两份样式表作为 client module 交给站点、检查宿主的压缩器       |
| `theme/DocItem/Content/index.tsx` | ❌ 站点编译            | 本层那一格：拿官方那一份（`@theme-init/DocItem/Content`），只在它外面套一层查看器 |
| `components/viewer.tsx`           | ❌ 站点编译            | 浏览器侧：判断「正文里有没有图片」、按需加载 `viewerjs`、换页时销毁               |
| `styles/viewer.css`               | ❌（样式表，不是模块） | 收第三方那份的三处：展开态、标题、缩略图宽度                                      |
| `tsconfig.build.json`             | ——                     | 构建项目：只有 `src/`，所以产物出口是 `dist/index.mjs`                            |

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

## 第三方那份样式表：一处改写 + 一条宿主前提

`viewerjs/dist/viewer.css` 与本包的 `styles/viewer.css` 都从 `getClientModules()` 交给站点，
于是都过站点的样式表管线。两件事都是这一家管线咬合不上造成的，实测口径：

1. **宿主要求 lightningcss 压缩器**。第三方那份写的是 CSS 原生嵌套（`.viewer-navbar.viewer-small > .viewer-list` 里套
   `> li { … }`）。站点那份 `postcss-preset-env` 按 browserslist 决定要不要摊平，而现代浏览器
   原生支持嵌套，这一步整个跳过，嵌套原样交给压缩器。Docusaurus 默认的 cssnano + clean-css
   里，clean-css 不认嵌套：同一份 CSS 过完 cssnano 括号仍平衡，再过 clean-css 括号总账变成
   **-7**，`> li` 子规则被并进父选择器、边界多吐一个 `}`。lightningcss 则按 browserslist
   处理：现代目标原样保留合法的 `&>li`，老目标自动摊平成后代选择器。所以本包不再替站点
   全站摊平（原来那句 `configurePostCss()` + `postcss-nesting` 已删），改为在
   `loadContent()` 里要求 `future.faster.lightningCssMinimizer: true`，没开就当场报错。
2. **先后顺序被合并改掉**。第三方靠 `.viewer-fade`（`opacity: 0`）与 `.viewer-in`（`opacity: 1`）
   的**先后**分出展开态，而压缩器会把声明相同的选择器并到一处 —— 并完 `.viewer-in` 就跑到了
   `.viewer-fade` 前面，容器上两个类同时在场时读回 0：查看器打开了但整层是透明的。
   `styles/viewer.css` 把这一格改写成 `.viewer-container.viewer-in`，比的是特异性而不是先后顺序。

这一处改写不在厂商代码里；宿主前提则是站点的配置。换 `viewerjs` 版本时两者都要重新走一遍。

## 用例

页面上那一格只有开浏览器才看得见，所以**浏览器侧**不在覆盖率红线里（口径见
`test/README.md` 的「覆盖率」一节）。构建期那几格是量得到的：层目录与客户端模块在
`test/package-entries.test.mts` 里，两条宿主前提住在本包的 `src/prerequisites.mts`、由
`test/prerequisites.test.mts` 钉：

- `test/e2e/features/viewer.feature`：点开第一张图、工具条那颗「下一张」、Esc 收起、
  换页时上一份查看器随换页销毁。
- `test/prerequisites.test.mts`：本包那两条前提 —— 缺解析器、宿主没开 lightningcss 各当场点名，
  老写法 `future.experimental_faster` 也认；连同本包入口有没有把它们接进 `loadContent()` 一起钉。
  机制层那份 `./prerequisites` 只剩「要交规则得装上本层」一条，本包不引它。
- `test/package-entries.test.mts`：本包入口交出的那几格 —— 层目录指哪一份、客户端模块那两个
  文件真的在磁盘上。
- `test/plugin.test.mts` 的分包三件套：层目录、样式表与本包清单。
- `test/infrastructure-rules.test.mts`：`themes/` 那一族既不声明也不 import `theme-component-page`
  （本包引不到它才成立；那句「宿主必须用 lightningcss」从前挂在它上面，只有一个消费者，按
  仓库规则 6 收回本包）。
- `test/view-layer-copies.test.mts`：那条编译未编译 TS 源码的 babel 规则只在解析器插件里有一份
  （本包不再自己补）。
