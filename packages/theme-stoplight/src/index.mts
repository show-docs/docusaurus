import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentPageContent } from '@show-docs/docusaurus-theme-component-page/lib/component-page.ts';
import { isolateRendererCss } from '@show-docs/docusaurus-theme-component-page/lib/isolate-renderer-css.ts';
import { assertThemePrerequisites } from '@show-docs/docusaurus-theme-component-page/prerequisites';

import type { LoadContext, Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 包出口是 `dist/`，所以这里的路径都相对**产物**目录算，不是相对 `src/`。
const thisDir = dirname(fileURLToPath(import.meta.url));

/** 本层的包名。 */
const NAMESPACE = '@show-docs/docusaurus-theme-stoplight';

/**
## Elements 那份静态样式表怎么不进站点那一份 css

站点只有一份全站 css：Docusaurus 把每一个 css 导入都并进同一个 `styles` chunk，
所以 `import '@stoplight/elements/styles.min.css'` 一定落进那一份，每个页面都带上它 —— iframe 隔得住
DOM、脚本、localStorage 与路由，隔不住这种构建期就写进 html 的静态样式。

做法与另两条 API 层**同一份**：
`@show-docs/docusaurus-theme-component-page/lib/isolate-renderer-css.ts`
把它改成一个 `asset/resource` 资源（`import` 拿到的是那份产物地址），由框内那份文档自己挂一条
`<link>`（见 `components/stoplight-ui.tsx`）。为什么非在构建期动手、两条规则同时命中要怎么躲、
`?url` 为什么用不了，都记在那份文件头，这里不抄第二遍。

本包只交两格：哪一份文件（下面那条正则），以及拿哪个假路径去试官方那条 `.css` 规则。
*/
const ELEMENTS_CSS = {
  file: /[\\/]@stoplight[\\/]elements[\\/][^\\/]+\.css$/i,
  probe: '/a/node_modules/@stoplight/elements/styles.min.css',
};

/**
Stoplight 这一层的入口：本包交出**一份组件与一条规则**（`stoplight:` 那一把键、框内渲染
`@theme/StoplightView`），外层那一格框、那条握手循环与框内那份文档都在
`@show-docs/docusaurus-theme-component-page` 里 —— 本包因此不依赖 `theme-iframe`，
卸载它这一层照常可用。

命中的页由 component-page 那份 `DocItem` 判表后换成一个同源框，框里按登记名 `stoplight` 取
`@theme/StoplightView`；`oas3:` / `aas3:` 那两把键怎么挑、亮暗怎么落到 `<html data-theme>` 上，
都归 `theme/StoplightView` 与 `components/` 里那两份，机制层不认识这些业务键。

本包的 webpack 差异有两格：把 Elements 那份静态样式表摘出全站 css（见上面那一节），以及给它的
依赖补上浏览器 bundle 里缺的那几样 Node 侧模块。
*/
export default function theme(context: LoadContext): Plugin {
  return {
    name: NAMESPACE,
    loadContent() {
      // 交出的那一页要由 component-page 判表才挂得上来；解析器插件缺了则是本包那几份
      // 未编译的 `.tsx` / `.ts` 没人认领。两样都在这里点名，而不是让 webpack 在某个页面文件
      // 上抛、或让那一页安静地不出现。
      assertThemePrerequisites(context, {
        namespace: NAMESPACE,
        componentPage: true,
      });

      return {
        componentPage: {
          components: [{ id: 'stoplight', component: '@theme/StoplightView' }],
          rules: [
            {
              key: 'stoplight',
              match: 'boolean',
              component: 'stoplight',
              render: 'iframe',
            },
          ],
        },
      } satisfies ComponentPageContent;
    },
    // 主题层与 `components/` 是**源码**，站在包根上，不经 `tsc`：用本包的 Docusaurus 项目
    // 会用自己的 babel 编译它们。这里只编译 `src/` 那一份（入口）。
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
    configureWebpack(config, isServer, utils) {
      // 这份样式表的边界客户端与服务端都要改（上面那一节的理由）；补 Node 核心模块那几样
      // 只有浏览器 bundle 需要。
      isolateRendererCss(config, {
        file: ELEMENTS_CSS.file,
        probe: ELEMENTS_CSS.probe,
      });

      // 补的是包里真 polyfill 不是空模块：`url` / `buffer` 都走在「按 URL 取 schema」那条路上，
      // 置 false 会在运行时抛；裸的全局 `process` 那一种形状（`resolve.fallback` 只管按模块 id
      // 筛的 require，裸标识符要由 `ProvidePlugin` 补）与三种形状的完整理由，记在 `docs/internals.md` 的
      // 「浏览器 bundle 要补的那几格 Node 侧依赖」一节。
      //
      // 和 `plugin-prev-layer-resolver` 一样**只返回自己新增的那一格**：官方 `applyConfigureWebpack`
      // 用 webpack-merge 拼接，数组会被 concat（`rules` 翻倍 → 每个 css 文件被 css-loader 处理两次）。
      // 上面那一格改的是传进来的 config 本身，不走返回值的数组。
      if (isServer) {
        return {};
      }

      const processShim = require.resolve('process/browser');

      return {
        plugins: [
          new utils.currentBundler.instance.ProvidePlugin({
            process: processShim,
            // Buffer: ['buffer', 'Buffer'],
          }),
        ],
        resolve: {
          fallback: {
            buffer: require.resolve('buffer/'),
            url: require.resolve('url/'),
            process: processShim,
          },
        },
      };
    },
  };
}
