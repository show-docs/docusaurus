import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LoggerLike } from '@show-docs/docusaurus-plugin-prev-layer-resolver';
import { assertPrevLayerResolverInstalled } from '@show-docs/docusaurus-plugin-prev-layer-resolver/plugin-slots';

import type { LoadContext, Plugin } from '@docusaurus/types';

import type {
  ComponentPageRuleDeclaration,
  ComponentRegistration,
} from '../types/component-page.ts';

import { normalizeSiteColumn } from './config.mts';
import { buildRuleTable, collectContributions } from './contribute.mts';
import { componentFrameRoutePath } from './frame-route.ts';
import {
  renderFrameRegistryModule,
  renderRegistryModule,
} from './registry-module.mts';

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本层的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-component-page';

/**
生成文件相对 `generatedFilesDir` 的位置。浏览器侧那两句 `@generated/<这一串>` 与它们必须
一字不差，判据与那份 `import` 各写在哪一格见本包 `docs/internals.md`。
*/
const REGISTRY_FILE = join('theme-component-page', 'registry.ts');

/** 框内那一份（登记名 → 组件）在同一目录里的位置。 */
const FRAME_REGISTRY_FILE = join('theme-component-page', 'frame-registry.ts');

/** 站点那一列里的一条规则：完整规则，或一把键 + `enabled: false` 把它关掉。 */
export type ComponentPageRuleOption =
  ComponentPageRuleDeclaration | { key: string; enabled: false };

/** 本层的插件选项。 */
export type ComponentPageThemeOptions = {
  /**
  站点自己登记的组件：`id` 给规则引用，`component` 是那个组件的模块说明符。判据是 webpack 的
  别名表认不认它，推荐写 `@theme/X`：那条别名跟着层栈走，站点在 `src/theme/X` 放一份就覆写掉它。
  */
  components?: readonly ComponentRegistration[];
  /**
  站点自己写的那一列：**顺序就是优先级**，一把键只能出现一次。一条写法的三种臂见
  `./config.mts`（引用某包的默认规则 / 完整覆写 / `enabled: false` 关掉）。
  没被这一列提过的默认规则按**键名的固定字符串顺序**接在后面。
  */
  rules?: readonly (string | ComponentPageRuleOption)[];
  /**
  注入 logger（测试用）；缺省用 `console`。官方 `LoadContext` 里没有 logger 这一格，
  解析器插件也是同一口径（`PrevLayerResolverOptions.logger`）。
  */
  logger?: LoggerLike;
};

/**
上一版那一列（`pages: [{ key, component: 说明符 | false, match, props }]`）只用来红一次。

`rules` 与它差的不只是键名：`component` 那一格从「模块说明符」变成「登记名」，`false` 那种
「这把键不生效」的写法换成了 `{ key, enabled: false }`。让它安静地不生效是最坏的那种升级 ——
站点照常构建，被接管的每一页退回普通文档页，看不出跟这次升级有关系。
*/
function assertNoLegacyPages(options: ComponentPageThemeOptions): void {
  if (!('pages' in options)) {
    return;
  }

  throw new Error(
    'theme-component-page 的插件选项里还有旧的 `pages` 那一列。这一版改成两格：\n' +
      "  components: [{ id: 'site/report', component: '@theme/ReportPage' }],\n" +
      "  rules: [{ key: 'report', component: 'site/report', match: 'options' }]\n" +
      "旧的 `component: false`（这把键谁交来都不生效）现在写 `{ key: '…', enabled: false }`。",
  );
}

/**
本层交出的只有三样东西：一份主题层（`theme/DocItem` 那个套壳、`theme/ComponentFramePage`
那条框内页面，与 `components/component-frame` 那一格框）、一份组件登记表与一张规则表。

两张表在配置期校验（`./config.mts`）再合成一张（`./contribute.mts`），然后按 `render` 铺成
浏览器读得到的两份模块（`./registry-module.mts`，写进 Docusaurus 的生成目录）：文档页那份只
`import` `page` 那一侧引用到的组件，框内那份只 `import` `iframe` 那一侧的。`DocItem` 判表、
命中就把整个 `DocItem` 换成那个组件，`render: 'iframe'` 时换成一个指向 `./frame-route.ts`
那条通用框内路由的框（`theme-iframe` 那一份不参与，卸载它也照常可用）。

那张表有两个来源，站点自己那一列排前面（表的顺序就是命中优先级）：站点配置里的 `components`
与 `rules`，和装着的插件各自在自己的 `loadContent()` 里交回的 `{ componentPage }`
（官方 `allContent` 把各插件的 content 汇到一起，本层在 `allContentLoaded` 里读；约定、
边界与合成算法都在 `./contribute.mts`）。

本层唯一的安装前提就是解析器插件那一个包，`loadContent()` 里当场查它（「在不在那两份清单里」
那条判据住在解析器包自己的 `plugin-slots`）：缺了它，本包随包发出的那几份 `.tsx` / `.ts` 源码
（`theme/DocItem`、`components/`、`lib/`）没人认领，症状要到打包那一步才出现
（`Module parse failed`），报错点离真正的原因隔着一整个构建。

别的层用不用得到这一句判据，归 `./prerequisites.mts`（包出口 `./prerequisites`）：「要交规则」
与「要用 lightningcss」那两条检查在那一份里，本层自己的前提只有上面那一个，所以不引自己那份。

主题层、`lib/` 与 `types/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus 项目会用自己的
babel 编译它们。「谁来编」归 `@show-docs/docusaurus-plugin-prev-layer-resolver`（它按
`@show-docs` 这个 scope 认领 `node_modules` 里的 TS 源码），本包不自己补 babel 规则。
*/
export default function theme(
  context: LoadContext,
  options: ComponentPageThemeOptions = {},
): Plugin {
  assertNoLegacyPages(options);

  // 校验放在入口调用这一步：配置写歪时红在「加载配置」那一句，报错里带着
  // `rules[下标].哪一格`，而不是等构建到某个页面才炸。
  const site = normalizeSiteColumn(options.components, options.rules);
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
    allContentLoaded({ allContent, actions }) {
      // 站点配置里那两列与各包交来的那些，到这里才变成浏览器读得到的东西。写在这一步而不是
      // 入口调用或 `loadContent`：`generatedFilesDir` 要到插件装载完才存在，而客户端打包在
      // `allContentLoaded` 之后；工厂还会被解析器的 `PluginDiscovery` 再跑一次，写盘会
      // 删掉自己的产物。包交出的那些组件与规则同样只在这里看到 —— `allContent` 是唯一
      // 「所有插件的 content 都已到齐」的点（约定与算法见 `./contribute.mts`），
      // 站点自己那一列则已经在上面校验过。
      const { entries, notices } = buildRuleTable(
        site,
        collectContributions(allContent),
      );

      // 站点覆写掉或关掉某个包交出的那一条，是「生效情况和某个包写的不一样」，不是错误：
      // 报一次，不红 —— 红的话站点就没法用站点配置压住某个包了。
      for (const notice of notices) {
        logger.warn?.(notice);
      }

      // 每轮都从完整的 `allContent` 全量重算并整份覆写：没有「这一轮只看到一部分包就先把表
      // 铺出去」的中间状态，删掉最后一条规则也照样出两份合法的空表。
      const registryTarget = join(context.generatedFilesDir, REGISTRY_FILE);

      mkdirSync(dirname(registryTarget), { recursive: true });
      writeFileSync(registryTarget, renderRegistryModule(entries));
      writeFileSync(
        join(context.generatedFilesDir, FRAME_REGISTRY_FILE),
        renderFrameRegistryModule(entries),
      );

      // 框内那条独立页面（`./frame-route.ts`）：不是文档页、没有 frontmatter 可判，走官方插件
      // 路由 API。`component` 写 `@theme/` 别名 —— 打包器按别名找得到本层挂进层栈的那份页面，
      // 站点那边的 swizzle 也还能覆写它。一条表都不到也注册：那条地址是这一族共用的，
      // 少一条规则不该让它变成 404。
      actions.addRoute({
        path: componentFrameRoutePath(context.siteConfig.baseUrl),
        component: '@theme/ComponentFramePage',
        exact: true,
      });
    },
  };
}
