// 这一条默认导入拿到的不是「把这文件打进 bundle」，而是**它单独那个产物的地址**（一个字符串）：
// `src/index.mts` 给这一条路径配了 webpack 的 `asset/resource` 规则，并把它从 Docusaurus 的 css
// 规则里摘了出去 —— 否则它会并进全站那一份 `styles.<hash>.css`（实测那是 348 KB 里的 220 KB），
// 每个页面都 `<link>` Scalar 那套 Tailwind 工具类与配色变量。口径与另两条 API 层同一份，记在
// `@show-docs/docusaurus-theme-iframe/lib/isolate-renderer-css.ts` 的文件头。

import scalarStylesUrl from '@scalar/api-reference/style.css';

import './scalar-ui.css';

import { createApiReference } from '@scalar/api-reference';
// 渲染要用的那份文档地址，加上「选中了哪条接口」报给框外那一份文档 ——
// 这一格的形状由 theme-iframe 那份框内工厂给出（`ApiFrameViewProps`），三份渲染接线共用一份。
import type { ApiFrameViewProps as Props } from '@show-docs/docusaurus-theme-iframe/lib/index.ts';

import { useEffect, useRef } from 'react';

import { isDarkColorModeAtLoad } from './scalar-color-mode.ts';

// 为什么是**默认**导入：`asset/resource` 那份规则交出的 `module.exports` 就是产物地址那一格字符串
// （`css-loader` 的 `esModule: false` 也在这里，那块「模块」没有真正的 default 命名导出）。
// 命名空间导入（`import * as`）在站点构建里会被优化成 `__webpack_require__.t(...)` —— 那是个
// null 原型的 Module 对象，`String()` 它直接抛 `TypeError: Cannot convert object to primitive value`，
// 于是整个渲染器挂不上（实测：`/scalar-view` 控制台报这一句，框里 `.scalar-app` 数为 0）。
// theme-stoplight 那份第三方样式表走的也是默认导入，两条 API 层同一形状。

/**
把 Scalar 挂到这一格 `<div>` 上，并把两头的地址对接起来。

挂载走 `@scalar/api-reference` 那份面向非 Vue 宿主的 `createApiReference(元素, 配置)`：它在里面
`createApp(…)` 再 `mount(元素)`，本层因此不需要直接引 `vue`；句柄里的 `destroy()` 收掉整棵 Vue 树。

两头的地址各转一次（协议见 theme-iframe 的 `docs/iframe-protocol.md`）。**框内 → 外层**用配置里的
`onSidebarClick`，它拿到的正是 Scalar 刚往历史里写的那条完整地址，本层只取 `#` 那一段报出去；不能
监听 `hashchange` —— Scalar 换接口走 `history.pushState`，那一步**不触发**它（theme-redoc 与
theme-stoplight 栽过同一格）。**外层 → 框内**反过来：共享层收到那一段就写本份文档的 `location.hash`，
这一步**会**触发 `hashchange`，而 Scalar 只在挂载那一次读地址、之后只听前进/后退的 `popstate`，
所以这里把前者转成后者，由它自己取那条接口、展开左栏、滚过去。这一转不成环：Scalar 写历史用的
`pushState` / `replaceState` 两条都不触发 `hashchange`。
*/
export function ScalarUI(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { onRouteChange, url } = props;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }

    const instance = createApiReference(host, {
      // 那颗「Ask AI」按钮与它带出来的对话框。厂商判据「配置里 `disabled` 优先 → 本机地址就开 →
      // 配了 `agent.key` 才开」，这一层没有 key，于是它只在本地服务上冒出来（实测 `/scalar-demo`
      // 框里有 1 颗文案为「Ask AI」的按钮，线上没有）。钉死＝本地与线上同一个形状。
      agent: { disabled: true },
      // 挂载那一刻给一个明确的布尔，不给 `undefined`（那条退到操作系统偏好）。
      // 运行时那一格由外层送，见 `scalar-color-mode.ts` 与 theme-iframe 那份框内工厂。
      darkMode: isDarkColorModeAtLoad(),
      // 正文顶上那一格「下载 OpenAPI 文档」的两颗按钮（JSON 与 YAML 各一颗，厂商那份
      // `DownloadLink` 按这个取值决定摆不摆：`yaml` / `json` / `both` 才渲染，`direct` 要有 spec 地址，
      // 其余整格不生成）。这是一份文档站点，别人要拿原始文件有的是办法（地址就在框内那条 `src` 上），
      // 不必由本层递到手上。厂商那条同名的旧写法 `hideDownloadButton: true` 现在只算兼容：它会把这一格
      // 改成 `none`，同时往控制台补一句 `[DEPRECATED]`。
      documentDownloadType: 'none',
      // 把 `darkMode` 从「初始值」升成「就这一格，别的不看」：只给 `darkMode` 时，厂商那条优先级链
      // 让同源 `localStorage` 里的 `colorMode` 压得过它（框内这一页与站点同源，那个 key 谁都读得到）。
      // 钉成挂载那一刻从本份文档 `<html data-theme>` 读到的值，站点仍是唯一驱动。链的完整形状、
      // 以及「页面开着时换操作系统主题会把钉住的那格重落一遍」那一格窄缝，记在包 `docs/internals.md` 的
      // 「亮暗模式」一节。
      forceDarkModeState: isDarkColorModeAtLoad() ? 'dark' : 'light',
      // 左栏底部 Scalar 自己那颗亮暗开关（实测露出来时是一份 `aria-label="Set dark mode"` 的元素，
      // 没有 `data-testid`；e2e 那条判据认这个标识）。配色已由站点开关驱动，留着它就是一颗跟 navbar
      // 那颗重复、还会把选择写进 `localStorage` 的按钮。厂商的渲染条件是
      // `!hideDarkModeToggle && !forceDarkModeState`，两格任何一条都会收掉它，这一条是明说意图的那一条。
      hideDarkModeToggle: true,
      // 每条接口右上角那颗「Test Request」：它真的把请求发出去，读的是文档里那条 server 地址。这是一份
      // **文档**站点，凭据与 CORS 都不在这一层的承诺里，所以收掉（厂商那一路：这颗与正文的鉴权选择器同源，
      // `Content.vue` 的注释写的是 "tied to `hideTestRequestButton`"）。看的那一路不收：实测代码示例选择器
      // 还在（那颗「生成 SDK」是另一件事，厂商没有配置、只在本地地址渲染，归 `scalar-ui.css` 收）。
      hideTestRequestButton: true,
      // 界面文案走厂商自带的简体中文那份。取值认的是它内置九份那种小写带连字符的 id（不是 BCP 47，
      // 写 `zh-CN` 会退回 `en`）；`zh-cn` 实测与 `en` 一样齐，不会露半句英文。换语言牵到 e2e：
      // 按文案认的那几句判据因此两种都收（见 `test/e2e/steps/scalar.steps.mts`）。九份清单、
      // 那句换不动的硬编码英文，记在包 `docs/internals.md` 的「界面文案」一节。
      localization: { locale: 'zh-cn' },
      // 左栏底部那两颗「Generate MCP」/「Connect MCP」。厂商那一格（`sidebarCta`）按 `mcp.disabled`
      // 优先，钉成 disabled 就直接退回 API client 那颗入口；不给时按「本机摆 explore、线上摆 client」走，
      // 于是本地与线上又是两个形状。这一格与署名同住，本来就被 `scalar-ui.css` 收成 `display: none`，
      // 钉的是 DOM 里那一颗是谁。
      mcp: { disabled: true },
      onSidebarClick: (href: string): void => {
        // 只要 `#` 那一段：外层地址栏里别的什么都不该被框里改掉（见共享层 `useOuterFrameSync`）。
        onRouteChange(new URL(href, window.location.href).hash);
      },
      // 厂商默认值是 `localhost`：hostname 是本机时正文顶上多出一条开发者工具栏（本层没有 `workspace`，
      // 那条栏上真的摆出来的是标题与「改配置」那颗）。这一层跑在 `pnpm start` 与 e2e 的本地服务上，
      // 正好命中那个判断 —— 同一份产物在本地与线上会长得不一样，所以按 `never` 钉死。
      showDeveloperTools: 'never',
      // 每条接口标题旁那颗 operationId 徽标（实测这份 `static/openapi-scalar.yaml` 三条都有：listOrders /
      // createOrder / getOrder）。默认是 `false`，抄 curl、生成客户端的人认的是这个，本层摆出来。
      showOperationId: true,
      // 厂商默认值是 `true`。实测这份安装的 1.75.0 里 `dist/plugins/posthog/index.js` 没有被任何地方
      // import（不载插件就什么都不发），所以这一格现在不改任何行为；写下来是按本层的口径表态，
      // 也是给厂商哪天默认载上时留的防线。
      telemetry: false,
      url,
    });

    const onHashChange = (): void => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    };

    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      instance.destroy();
    };
  }, [onRouteChange, url]);

  // 这一格只是 `createApiReference` 要的挂载宿主，不带类名：`scalar-ui.css` 里那条与 e2e
  // 那几句认的都是 Scalar 自己挂在它下面的 `.scalar-app.scalar-api-reference`。
  //
  // 上面那条 `import` 是 `<link>` 的地址、不是样式本身，所以要在这份文档里挂出来 ——
  // Scalar 自己那条 `style.css` 只在框内那一页生效，理由见那条 import 上方的注释。
  return (
    <>
      <link href={scalarStylesUrl} rel="stylesheet" />
      <div ref={hostRef} />
    </>
  );
}
