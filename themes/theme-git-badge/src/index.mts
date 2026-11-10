import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoadContext, Plugin } from '@docusaurus/types';

import { wrapParseFrontMatter } from './frontmatter.mts';
import type { Repo } from './git-info.mts';
import { openRepoFrom } from './git-info.mts';

const PLUGIN_NAME = '@show-docs/docusaurus-theme-git-badge';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/**
侧边栏徽标：给「新建」与「更新过」的页面挂一枚颜色标记（叶子行一个点，分类行给折叠箭头
染色）。

这一层做两件事，缺一不可：

 - **判**：读 git 判出这一页是新建还是更新过（页面自己写了 `git_badge` 就以页面为准），
   写进 frontmatter 的 `sidebar_custom_props` —— 官方唯一一条 frontmatter → 侧边栏的路；
 - **画**：覆盖 `DocSidebarItem/Link` 与 `DocSidebarItem/Category` 两格，把种类摊成
   `data-git-badge` 属性，形状由包里的样式表画。

站点只管把它装上。**不再有 `docs` 选项，也不分内容根**：注入包住站点全局那份
`markdown.parseFrontMatter`，任何被解析的 markdown 都判 —— 读那一格的只有文档插件的侧边栏，
所以站点有几份 docs 实例、各自扫哪一棵根，本层都不必知道。

取舍与证据在 `./docs/internals.md`。
*/
export default function gitBadgeTheme(context: LoadContext): Plugin {
  const { markdown } = context.siteConfig;

  // 插件实例级：`reloadSite()` 重跑的是插件各阶段，那次整仓读不必跟着重来
  let cached: { repo: Repo | undefined } | undefined;

  /**
   把注入包上去，只包一次。

   时机必须是 `loadContent()`，不能晚到 `contentLoaded()`：docs 插件在它**自己的**
   `loadContent()` 里就把 `parseFrontMatter` 读走了，之后再换属性只是换了一份没人用的。
  */
  const install = () => {
    markdown.parseFrontMatter = wrapParseFrontMatter(
      markdown.parseFrontMatter,
      () => {
        // 只读一次：第一次问历史时才走 git，之后（含 `reloadSite()` 重跑）
        // 都拿同一份结果。找仓库从**站点根**起步，不从 `process.cwd()`：`pnpm --dir`
        // 或从仓库里别的子目录起构建时，工作目录不一定是被构建的那个站点。
        cached ??= { repo: openRepoFrom(context.siteDir) };

        return cached.repo;
      },
    );
  };

  return {
    name: PLUGIN_NAME,
    loadContent() {
      // 这一层只改 frontmatter 与侧边栏那两格，不交规则给机制层，也没有「装没装」那一条要查：
      // 层里那句 `@theme-init/...` 用的是官方别名，编译本包未编译 TS 源码那条 babel 规则归
      // `@show-docs/docusaurus-plugin-compile-source`（本包只在 `peerDependencies` 里点名它，
      // 配置期不查）。
      install();
    },
    // 插件被单独 reload（`reloadSite()`）时会重跑这一阶段
    contentLoaded: install,
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 那一份入口。
    //
    // 「谁来编」归 `@show-docs/docusaurus-plugin-compile-source`，本包不自己补 babel 规则。
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 样式表不是模块，`tsc` 不会把它搬进 `dist/`：作为 client module 交给站点的样式表管线
    getClientModules() {
      return [resolve(thisDir, '../styles/git-badge.css')];
    },
  };
}
