import { createRequire } from 'node:module';

import { createApiFrameTheme } from '@show-docs/docusaurus-theme-iframe/lib/api-frame-theme.mts';

import type { LoadContext, Plugin } from '@docusaurus/types';

const require = createRequire(import.meta.url);

/** `configureWebpack` 第一个参数的类型：从官方那份签名推出来，本包不直接引 `webpack`。 */
type WebpackConfig = Parameters<NonNullable<Plugin['configureWebpack']>>[0];

// 本层的包名，同时是注册表与三条 postMessage 的命名空间。
const STOPLIGHT_NAMESPACE = '@show-docs/docusaurus-theme-stoplight';

/**
## Elements 那份静态样式表怎么不进站点那一份 css

站点只有一份全站 css：Docusaurus 把每一个 css 导入都并进同一个 `styles` chunk
（`splitChunks.styles` 那条 `type: 'css/mini-extract'` 加 `enforce: true`，为的就是不让多份 css
的加载顺序变成不确定的）。所以 `import '@stoplight/elements/styles.min.css'` 一定落进全站那一份，
每个页面都带上它 —— iframe 拦得住 DOM、脚本、localStorage 和路由，拦不住这种静态样式：
框内那份文档 `<link>` 的也是同一个文件，它的地址在构建期就写进了 html。

本层的做法是**别让这份文件进打包**：webpack 的 `asset/resource` 把它当一个资源原样发出去，
产物里是一个独立的 css 文件，`import` 拿到的就是它的地址（一个字符串），由框内那份文档自己挂
一条 `<link>`（见 `components/stoplight-ui.tsx`）。站点那一份 css 里一条 `.sl-` 规则都没有，
Elements 的样式只在框内那份文档里生效，边界是浏览器给的文档边界，不需要构建期圈定。

两条规则同时命中同一份文件会把 loaders 和资源类型叠在一起，所以除了加规则，还得把这份文件从
**带 loader 的规则**里摘出去。判据不是抄官方那条 `.css` 规则的正则（版本一变就对不上），而是拿
一个假的 Elements 路径去试每一条带 `use` 的规则 —— 官方哪天改了规则的形状，这一条会失配，
表现是产物里少了那个独立 css 文件、样式漏回全站那一份，e2e 会红（口径见包 README 的「样式」一节）。

`?url` 那种行内查询是 Vite / Rspack 的写法，webpack 5 没有这一条（实测：请求连规则匹配都没走到，
先在包的 `exports` 那一步就报 `./styles.min.css?url is not exported`）；这里靠规则匹配，不靠查询串。
*/
const ELEMENTS_CSS = /[\\/]@stoplight[\\/]elements[\\/][^\\/]+\.css$/i;

/** 探测用的假路径：pnpm 把包装在 `.pnpm/@stoplight+elements@…\/node_modules/` 下，真路径同样命中这一条。 */
const ELEMENTS_CSS_PROBE = '/a/node_modules/@stoplight/elements/styles.min.css';

/** 把 Elements 的 css 从「交给 css-loader 处理」改成「当一个资源发出去」。 */
function isolateElementsCss(config: WebpackConfig): void {
  const rules = config.module?.rules;
  if (!rules) {
    return;
  }

  rules.unshift({
    test: ELEMENTS_CSS,
    type: 'asset/resource',
    generator: { filename: 'assets/css/[name].[contenthash:8][ext]' },
  });

  for (const rule of rules) {
    // 只看**带 loader** 的规则：上面那条资源规则没有 `use`，不该被摘出去。
    if (
      typeof rule !== 'object' ||
      rule === null ||
      !('use' in rule) ||
      rule.use === undefined ||
      !('test' in rule) ||
      !(rule.test instanceof RegExp)
    ) {
      continue;
    }

    // 新建一个正则再试：带 `g` 标志的正则 `test` 会推进 `lastIndex`，同一条规则试两次结果就变了。
    const matches = new RegExp(rule.test.source, rule.test.flags).test(
      ELEMENTS_CSS_PROBE,
    );
    if (!matches) {
      continue;
    }

    rule.exclude = rule.exclude ? [rule.exclude, ELEMENTS_CSS] : ELEMENTS_CSS;
  }
}

/**
Stoplight 这一层的入口：外层套壳（`DocItem` 判 `oas3:`、那个 `<iframe>`、两条消息循环）
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
      isolateElementsCss(config);

      // `@stoplight/elements` 的依赖树里还在 `require` Node 的 `url` / `buffer`，而
      // webpack 5 起不再自动补核心模块。服务端那份构建本来就有真的 Node 模块，
      // 只有浏览器 bundle 需要补 —— 而且补的是包里的 polyfill，不是空模块：
      // 这两个都走在「按 URL 取 schema」那条路上，置 false 会在运行时抛。
      //
      // 这一格现在服务的是**框内那份文档**：Elements 整个搬进 `/stoplight-view` 那份文档里跑，
      // 站点自己的文档页只嵌一个 iframe，不再加载它。补的还是同一批东西。
      //
      // `process` 补的是**另一种形状**：`@stoplight/json-schema-ref-parser` 里写的不是
      // `require('process')`，而是裸的全局 `process.browser` / `process.cwd()` /
      // `process.nextTick`。`resolve.fallback` 只管前者（按模块 id 筛），裸标识符要由
      // `ProvidePlugin` 在模块作用域里补一个 `require`，否则浏览器里求值就
      // `ReferenceError: process is not defined`。
      //
      // 和 `plugin-prev-layer-resolver` 一样**只返回自己新增的那一格**：官方
      // `applyConfigureWebpack` 用 webpack-merge 拼接，改完整个 config 再返回去，
      // 数组会被 concat 一遍（`rules` 翻倍 → 每个 css 文件被 css-loader 处理两次）。
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
