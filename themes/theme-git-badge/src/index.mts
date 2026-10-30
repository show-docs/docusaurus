import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-component-page/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

import type { DocsScopes } from './docs-scope.mts';
import { scopeOf } from './docs-scope.mts';
import { wrapParseFrontMatter } from './frontmatter.mts';
import type { Repo } from './git-info.mts';
import { openRepoFrom } from './git-info.mts';

export type { DocsScope, DocsScopes } from './docs-scope.mts';

const PLUGIN_NAME = '@show-docs/docusaurus-theme-git-badge';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

export interface GitBadgeOptions {
  /**
  文档插件扫哪些文件（每份实例的 `docs.path` / `docs.include` / `docs.exclude`）。

  站点把那份选项写在预设或独立实例里时插件拿不到，只能由站点转述过来；一份实例转述一份，
  站点里有几份文档插件实例就写几份（数组）。不传 = 只管 `<siteDir>/docs` 整棵。

  地盘之外的文件一个标记都不给 —— 「页面」这个概念由文档插件定义，徽标跟着它走。
  注入走的是站点全局那一个 `markdown.parseFrontMatter`，第二份本插件实例会被「只包一次」
  的护栏吞掉，所以**多棵内容根只能在这一份实例里用数组表达**。
  */
  docs?: DocsScopes;
}

/**
侧边栏徽标：给「新建」与「更新过」的页面挂一枚颜色标记（叶子行一个点，分类行给折叠箭头
染色）。

这一层做两件事，缺一不可：

 - **判**：读 git 判出这一页是新建还是更新过（页面自己写了 `git_badge` 就以页面为准），
   写进 frontmatter 的 `sidebar_custom_props` —— 官方唯一一条 frontmatter → 侧边栏的路；
 - **画**：覆盖 `DocSidebarItem/Link` 与 `DocSidebarItem/Category` 两格，把种类摊成
   `data-git-badge` 属性，形状由包里的样式表画。

两件事都在包里：站点只管把它装上，以及转述 `docs` 那三格。

取舍与证据在 `./docs/internals.md`。
*/
export default function gitBadgeTheme(
  context: LoadContext,
  { docs }: GitBadgeOptions = {},
): Plugin {
  const { markdown } = context.siteConfig;

  // 地盘在构造函数里定下来就够：`docs.path` / `include` / `exclude` 是站点配置的一部分，
  // 改它们等于重启（dev 下 `reloadSite()` 会带着新配置重新实例化本插件）
  const scope = scopeOf(context.siteDir, docs);

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
      scope,
    );
  };

  return {
    name: PLUGIN_NAME,
    loadContent() {
      // 本层的 `theme/` 是未编译 TS 源码，编译它的 babel 规则由解析器插件一处认领，
      // 缺了它症状是构建期才炸的 `Module parse failed` —— 当场点名更省事
      assertThemePrerequisites(context, { namespace: PLUGIN_NAME });
      install();
    },
    // 插件被单独 reload（`reloadSite()`）时会重跑这一阶段
    contentLoaded: install,
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus
    // 项目会用自己的 babel 编译它们。这里只编译 `src/` 那一份入口。
    //
    // 「谁来编」归 `@show-docs/docusaurus-plugin-prev-layer-resolver`（它按 `@show-docs`
    // 这个 scope 认领 `node_modules` 里的 TS 源码），本包不自己补 babel 规则。
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
