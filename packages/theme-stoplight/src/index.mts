import { createRequire } from 'node:module';

import { createApiFrameTheme } from '@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts';
import { isolateRendererCss } from '@show-docs/docusaurus-theme-iframe/lib/isolate-renderer-css.ts';

import type { LoadContext, Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

// 本层的包名，同时是注册表与三条 postMessage 的命名空间。
const STOPLIGHT_NAMESPACE = '@show-docs/docusaurus-theme-stoplight';

/**
## Elements 那份静态样式表怎么不进站点那一份 css

站点只有一份全站 css：Docusaurus 把每一个 css 导入都并进同一个 `styles` chunk，
所以 `import '@stoplight/elements/styles.min.css'` 一定落进那一份，每个页面都带上它 —— iframe 隔得住
DOM、脚本、localStorage 与路由，隔不住这种构建期就写进 html 的静态样式。

做法与另两条 API 层**同一份**：`@show-docs/docusaurus-theme-iframe/lib/isolate-renderer-css.ts`
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
Stoplight 这一层的入口：外层套壳（`DocItem` 判 `stoplight:`、那个 `<iframe>`、两条消息循环）
都在 `@show-docs/docusaurus-theme-iframe`（注册表里那条 `internal` 条目），本包只交出三样 ——
这条入口、框内那条 `theme/StoplightPage` 页面、`components/` 里 Elements 自己的渲染接线。

路由名、参数名、类名、消息命名空间都取自 theme-iframe 的注册表（配置期与浏览器期同一份
源码），不再有「编译边界两侧各写一份常量」这件事。
*/
export default function theme(context: LoadContext): Plugin {
  return createApiFrameTheme(context, {
    namespace: STOPLIGHT_NAMESPACE,
    // 入口产物（dist/）的位置：工厂按它算层目录，并在当场校验那格存在。
    selfEntryUrl: import.meta.url,
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
  });
}
