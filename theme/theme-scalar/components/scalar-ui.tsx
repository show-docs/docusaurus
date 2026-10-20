import '@scalar/api-reference/style.css';
import './scalar-ui.css';

import { createApiReference } from '@scalar/api-reference';

import { useEffect, useRef } from 'react';

import { isDarkColorModeAtLoad } from './scalar-color-mode.ts';

type Props = {
  /** 要渲染的那份 OpenAPI 文档的地址。 */
  url: string;
  /** 选中了哪条接口，报给框外那一份文档（用它的就是 `scalar-view.tsx`）。 */
  onRouteChange: (hash: string) => void;
};

/**
把 Scalar 挂到这一格 `<div>` 上，并把两头的地址对接起来。

挂载走 `@scalar/api-reference` 自己那份面向非 Vue 宿主的 `createApiReference(元素, 配置)`：
它在里面 `createApp(…)` 再 `mount(元素)`，本层因此不需要直接引 `vue`。返回的那只句柄里有
`destroy()`，卸载时把整棵 Vue 树收掉。

**框内 → 外层**用配置里的 `onSidebarClick`：它拿到的正是 Scalar 刚往历史里写的那条完整地址，
本层只取 `#` 那一段报出去。为什么不是监听 `hashchange`：Scalar 换接口走
`history.pushState`，那个方法**不触发** `hashchange`（theme-redoc 与 theme-stoplight 栽过同一格）。

**外层 → 框内**反过来：共享层收到外层送来的那一段就写本份文档的 `location.hash`，那一步**会**
触发 `hashchange`，而 Scalar 认的是 `popstate`（它只在挂载那一次读地址，另外只监听前进/后退）。
所以这里把前者转成后者： Scalar 自己在 `popstate` 里按地址取那一条接口、展开左栏、滚过去。
这一转不会成环 —— Scalar 写历史用的是 `pushState` / `replaceState`，两条都不触发 `hashchange`。
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
      // `agent.disabled`：那颗「Ask AI」按钮与它带出来的对话框（AgentScalar）。厂商那一路判据
      // 是「配置里 disabled 优先 → 本机地址就开 → 配了 `agent.key` 才开」，而这一层没有 key，
      // 于是它只在本地服务上冒出来（实测：`/scalar-demo` 框里那份文档有 1 颗文案为「Ask AI」的
      // 按钮，线上没有）。按 `disabled: true` 钉死，本地与线上同一个形状 —— 与下面那条
      // `showDeveloperTools` 是同一件事的另一头。
      agent: { disabled: true },
      // `darkMode`：挂载那一刻交给它一个明确的布尔，不给 `undefined`（那条就退到操作系统偏好）。
      // 运行时那一格由外层送，见 `scalar-color-mode.ts` 与 `scalar-view.tsx`。
      darkMode: isDarkColorModeAtLoad(),
      // `forceDarkModeState`：把上面那一格从「初始值」升成「就这一格，别的不看」。
      // 厂商那条优先级链是 `overrideColorMode` → `localStorage` 里的 `colorMode` → `initialColorMode`
      // （`@scalar/use-hooks` 的 `useColorMode`，`ApiReference.vue.script.js` 把
      // `forceDarkModeState` 原样递成 `overrideColorMode`）—— 只给 `darkMode` 的话，同源那份
      // `localStorage` 里只要有一条 `colorMode`（老版本留下的、或同域别处写的），就把我们这一格盖掉，
      // 而框内这一页与站点同源，那个 key 谁都读得到。钉成挂载那一刻从本份文档 `<html data-theme>`
      // 读到的那一格：本地、线上、任何一台机器起来都是同一个形状，站点仍然是唯一的驱动。
      //
      // 留下的那一格窄缝：厂商那个 watcher 也听操作系统的 `prefers-color-scheme`，页面开着的时候
      // 换系统主题，它会把**挂载时钉住的这一格**重新落一遍类名，盖掉外层后来送进来的那次；下一次
      // 站点开关动一下就正回来了。不钉这一格时同样会重落，落的却是操作系统那一格 —— 两种都是
      // 「不跟站点走」，钉过的至少是站点自己当时的值。
      // 顺带：左栏底部那颗它自己的亮暗开关，厂商的渲染条件是 `!hideDarkModeToggle && !forceDarkModeState`，
      // 这两格任何一条都会收掉它，上面那条 `hideDarkModeToggle` 是明说意图的那一条。
      forceDarkModeState: isDarkColorModeAtLoad() ? 'dark' : 'light',
      // `hideDarkModeToggle`：Scalar 左栏底部那颗它自己的亮暗开关（实测：露出来时是一份
      // `aria-label="Set dark mode"` 的元素，没有 `data-testid`；e2e 那条判据认这个标识）。
      // 配色现在由站点的开关驱动（`scalar-color-mode.ts`），留着它就是一颗跟 navbar 那颗
      // 重复、还会把选择写进 `localStorage` 的按钮 —— 与 theme-redoc 收掉它那颗是同一取舍，
      // 只是这一层不用写 CSS，配置里就有这一格。
      hideDarkModeToggle: true,
      // 每条接口右上角那颗「Test Request」：它真的把请求发出去，读的是文档里那条 server 地址。
      // 这是一份**文档**站点，凭据与 CORS 都不在这一层的承诺里，所以收掉（厂商那一路判据：这颗
      // 按钮与正文里那个鉴权选择器同源，`Content.vue` 的注释写的是 "tied to
      // `hideTestRequestButton`"）。看的那一路不收：实测代码示例选择器、SDK 生成与下载都还在。
      hideTestRequestButton: true,
      // `localization.locale`：界面文案走厂商自带的简体中文那一份。合法取值是它内置的九份
      // （`dist/features/localization/locales/`：ar / de / en / es / fr / pt / ru / zh-cn / zh-tw），
      // 认的是这种小写带连字符的 id，不是 BCP 47（写 `zh-CN` 认不出来，`resolveLocalization` 只按
      // 这张表取，取不到就退回默认 `en`）。`zh-cn` 与 `zh-tw` 两格都齐（实测两份各 253 条 key，
      // 与 `en` 一模一样多，不会露半句英文），这一层选简体是因为站点与示例文档都是简体。
      // 界面跟着换：搜索、代码示例那一行的复制、下载、客户端库那几颗都成了中文；e2e 那几句按
      // 文案认的判据因此两条都收（见 `test/e2e/steps/scalar.steps.mts`）。
      // 不动的那一格：Scalar 报「文档取不到」那句是厂商硬编码的英文（`could not be loaded`，
      // 在这份安装的 `dist/browser/standalone.js` 里数到 1 处，locale 表里根本没有对应条目），
      // 换语言也还是英文，e2e 那句继续按它认。
      localization: { locale: 'zh-cn' },
      // 左栏底部那两颗「Generate MCP」/「Connect MCP」（文案取自它自己的本地化表）。厂商那一格
      // （`sidebarCta`）按 `mcp.disabled` 优先 —— 钉成 disabled 就直接退回 API client 那颗入口；
      // 不给时按「本机地址摆 explore、线上摆 client」走，于是本地与线上又是两个形状。
      // 这一格与署名同住，本来就被 `scalar-ui.css` 收成 `display: none`，钉的是 DOM 里那一颗是谁。
      mcp: { disabled: true },
      onSidebarClick: (href: string): void => {
        // 只要 `#` 那一段：外层地址栏里别的什么都不该被框里改掉（见共享层 `useOuterFrameSync`）。
        onRouteChange(new URL(href, window.location.href).hash);
      },
      // Scalar 默认值是 `localhost`： hostname 是本机时正文顶上多出一条开发者工具栏（本层没有
      // `workspace`，那条栏上真的摆出来的是标题与「改配置」那颗；分享、部署、生成 SDK 那三颗要
      // 有 workspace 才渲染）。这一层跑在 `pnpm start` 与 e2e 的本地服务上，正好命中那个判断 ——
      // 同一份产物在本地与线上会长得不一样，所以按 `never` 钉死。
      showDeveloperTools: 'never',
      // 每条接口标题旁那颗 operationId 徽标（实测这份 `static/openapi.yaml` 三条都有：
      // `listOrders` / `createOrder` / `getOrder`）。抄 curl、生成客户端的人认的是这个，
      // 默认是 `false`，这一层摆出来。
      showOperationId: true,
      // 厂商的默认值是 `true`。实测这份安装的 1.75.0 里 `dist/plugins/posthog/index.js` 没有被
      // 任何地方 import（不载插件就什么都不发），所以这一格现在不改任何行为；写下来是按本层的
      // 口径表态，也是给厂商哪天默认载上时留的防线。
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
  return <div ref={hostRef} />;
}
