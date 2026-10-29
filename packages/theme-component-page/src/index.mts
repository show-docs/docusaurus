import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoggerLike } from '@show-docs/docusaurus-plugin-prev-layer-resolver';
import { assertPrevLayerResolverInstalled } from '@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots';

import type { LoadContext, Plugin } from '@docusaurus/types';

import type { ComponentPageMatch } from '../types/component-page.ts';

import { normalizePages } from './config.mts';
import { discoverContributedPages, mergePages } from './contribute.mts';
import { renderRegistryModule } from './registry-module.mts';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本层的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-component-page';

/**
生成文件相对 `generatedFilesDir` 的位置。浏览器侧那句 `@generated/<这一串>` 与它必须一字不差，
判据与那份 `import` 各写在哪一格见本包 `docs/internals.md`。
*/
const REGISTRY_FILE = join('theme-component-page', 'registry.ts');

/** 配置里的一条：一把键 + 命中后要挂进去的那个组件 + 给它的静态入参。 */
export type ComponentPageConfigEntry = {
  /** md frontmatter 里那把键。 */
  key: string;
  /**
  那个组件的模块说明符，判据是 webpack 的别名表认不认它。推荐写 `@theme/X`：那条别名跟着
  层栈走，站点在 `src/theme/X` 放一份就覆写掉它，不必回来改本层的配置。

  写 `false` 是另一件事：这一把键**谁交来都不生效**（包括装了的主题包交出的那一条），
  见 `./contribute.mts` 的合成规则。只有站点这一列认这一格。
  */
  component: string | false;
  /** 这把键怎么算命中；缺它按 `boolean`（只认真布尔 `true`）。 */
  match?: ComponentPageMatch;
  /** 并交进组件的静态入参；纯数据（函数留不进生成模块）。 */
  props?: Record<string, unknown>;
};

/** 本层的插件选项。 */
export type ComponentPageThemeOptions = {
  /**
  站点自己写的那一列：**顺序就是优先级**，一把键只能出现一次。装了的主题包各自交出的那些条
  排在它后面，同一把键以这一列为准（见 `./contribute.mts`）。
  */
  pages?: readonly ComponentPageConfigEntry[];
  /**
  注入 logger（测试用）；缺省用 `console`。官方 `LoadContext` 里没有 logger 这一格，
  解析器插件也是同一口径（`PrevLayerResolverOptions.logger`）。
  */
  logger?: LoggerLike;
};

/**
本层交出的只有两件东西：一份主题层（`theme/DocItem` 那个套壳）与一列清单。

清单在配置期校验成条目（`./config.mts`），再铺成一份浏览器读得到的注册表模块
（`./registry-module.mts`，写进 Docusaurus 的生成目录）；那一层判 frontmatter、命中就把
整个 `DocItem` 换成清单里那个组件。为什么非要生成一份文件，记在那份文件的头上。

那一列有两个来源，站点自己写的那一列排前面（清单顺序就是命中优先级）：站点配置里的
`pages`，和装了的那些主题包各自交出的条目（约定只有一条 `getComponentPages()`，合成规则、
代价与「什么样的包认得进来」都在 `./contribute.mts`）。

本层唯一的安装前提就是解析器插件那一个包，`loadContent()` 里当场查它（「在不在那两份清单里」
那条判据住在解析器包自己的 `plugin-slots`）：缺了它，本层那份 `theme/DocItem` 要到打包那一步
才撞 `@theme-prev/DocItem` 的 `Module not found`，报错点离真正的原因隔着一整个构建。
本层**不**引另一族层那份 `assertThemePrerequisites()` —— 通用机制不该把 `theme-iframe`
变成自己的前提。

主题层与 `types/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus 项目会用自己的
babel 编译它们。「谁来编」归 `@show-docs/docusaurus-plugin-prev-layer-resolver`（它按
`@show-docs` 这个 scope 认领 `node_modules` 里的 TS 源码），本包不自己补 babel 规则。
*/
export default function theme(
  context: LoadContext,
  options: ComponentPageThemeOptions = {},
): Plugin {
  // 校验放在入口调用这一步：配置写歪时红在「加载配置」那一句，报错里带着
  // `pages[下标].哪一格`，而不是等构建到某个页面才炸。
  const sitePages = normalizePages(options.pages, { siteColumn: true });
  const logger = options.logger ?? console;

  return {
    name: NAMESPACE,
    loadContent() {
      assertPrevLayerResolverInstalled(NAMESPACE, {
        plugins: context.siteConfig.plugins,
        themes: context.siteConfig.themes,
      });
    },
    getThemePath() {
      return resolve(thisDir, '../theme');
    },
    // 层里放的是 `.tsx`，这条给 `docusaurus swizzle` 用
    getTypeScriptThemePath() {
      return resolve(thisDir, '../theme');
    },
    async contentLoaded() {
      // 站点配置里那列清单到这里才变成浏览器读得到的东西。写在 `contentLoaded` 而不是
      // 入口调用那一步：`generatedFilesDir` 要到插件装载完才存在，而客户端打包在那之后。
      // 包交出的那些条目同样要在这里问 —— 问「装了哪些插件」是配置期之后的事，站点自己
      // 那一列则已经在上面校验过（约定与合成规则见 `./contribute.mts`）。
      const contributed = await discoverContributedPages(
        context.siteDir,
        logger,
      );
      const { pages, notices } = mergePages(sitePages, contributed);

      // 站点覆写掉包交出的那一条，是「生效情况和某个包写的不一样」，不是错误：报一次，
      // 不红 —— 红的话站点就没法用站点配置压住某个包了。
      for (const notice of notices) {
        logger.warn?.(notice);
      }

      const target = join(context.generatedFilesDir, REGISTRY_FILE);

      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, renderRegistryModule(pages));
    },
  };
}
