import { expect } from '@playwright/test';
import type { FrameLocator, Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { frameModeSignal, siteStyles, watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

/**
## 这一层的判据分两份文档量，口径与 `theme-redoc`、`theme-stoplight` 一对一

命中页（`/scalar-demo`）里只有一个 iframe，Scalar 整个跑在框内那份文档（本包那条插件路由
`/scalar-view`）上。所以每条判据都得指名站在哪一份文档里量：

- 外层：`page.locator(...)` —— 这一份里**不该**有 Scalar 的 DOM（`.scalar-app` 是框内那一份
  的形状，边界由浏览器给，本层不再做样式圈定，口径见包 README 的「样式」一节）；
- 框内：`frameDoc(page)` —— 它是那一份文档的**框**（`Locator#contentFrame()` 交回 `FrameLocator`，
  只给 `locator()` 不给你 `evaluate()`），后面的选择器都从它往下找；要跑脚本就先取它下面的
  `html` 那一颗，回调里再拿 `el.ownerDocument`。

同源，所以两边都能直接读 DOM 与 CSSOM，不需要往测试里塞第二层通道。

Scalar 的路由也走 hash，但它按**标签 + 方法 + 路径**拼那一段（`新建订单` 是
`#tag/orders/POST/orders`，不是 operationId —— Redoc 那边是小写的 `operationId`，Elements 那边
是原样的 `#operations/…`），下面的 href 按浏览器里真的那串写（实测清单：`#description/introduction`、
`#tag/orders`、三条接口、`#models`）。href 不带路径前缀，是因为框内那份文档的地址里没有前缀可剥
（口径记在 `theme/theme-scalar/README.md`）。

与另两层的一处形状差：orders 这一组**默认就是展开的**（实测三条接口链接都在 DOM 里、都可见），
所以这里没有 redoc / stoplight 那条「先点开分组」，三条链接直接在「三个接口都在左栏」那一句里钉。
*/
const frameElement = (page: Page): Locator =>
  page.locator('iframe.scalar-frame');

const frameDoc = (page: Page): FrameLocator =>
  frameElement(page).contentFrame();

/**
框里那份文档的 Scalar 根格。

认的是厂商自己那两格类名（实测：`aside`、左栏的接口链接、代码块都在它下面）。裸的 `.scalar-app`
不够 —— 框内那份文档里它有 3 格（直接打开 `/scalar-view` 是 5 格，Scalar 给弹窗与提示各造一格），
只带 `scalar-api-reference` 的那一颗才是布局根（实测 1 格）。本层包着它的那格 `<div>` 是挂载
宿主，不带类名。
*/
const root = (page: Page): Locator =>
  frameDoc(page).locator('.scalar-app.scalar-api-reference');

const menu = (page: Page): Locator => root(page).locator('aside');

/** 「取不到那份文档」那句报信的认法：Scalar 拿到坏地址不抛异常，而是在正文区打这一句（实测）。 */
const loadErrorText = 'could not be loaded';

const operationHref = (method: string, path: string): string =>
  `#tag/orders/${method}/${path}`;

const operationHrefs = [
  operationHref('GET', 'orders'),
  operationHref('POST', 'orders'),
  operationHref('GET', 'orders/{orderId}'),
];

Given('我打开 scalar 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/scalar-demo');
});

/**
整页加载一条**别人转发过来的接口地址**：`#tag/orders/POST/orders` 这段是框里点了接口之后
由 postMessage 送进外层地址栏的。这一条钉的是它在静态产物里也打得开，而且是 **HTTP 200**
—— 页面本身是 `build/scalar-demo/index.html` 那一份，hash 段不参与取文件，托管侧不用认识它。
（换成按路径的路由就是 404，取舍与理由见包 README 的「深链」一节。）

那一段写的是 `#tag/…` 而不是 `#/tag/…`：Scalar 自己拼的就是前者，`#` 后面紧跟 `tag`，
**没有**前导斜杠（Redoc 那边是 `#/orders/…`，有）。实测多写一个斜段就静默失灵 —— 外层把
`#/tag/orders/POST/orders` 送进框内、框内地址也确实成了那串，可 Scalar 认不出这个 id，
就停在文档概览上（实测稳定停在两颗标题、`scrollY` 一直是 0），既不报错也不换正文。
所以这里的地址按 Scalar 真的那一串写。
*/
Given('我直达 scalar 那条接口的地址', async ({ page }) => {
  watchPageErrors(page);
  const response = await page.goto('/scalar-demo#tag/orders/POST/orders');
  expect(response?.status(), '这条地址没被当成真页面来回').toBe(200);
});

/**
命中页放的就那一个 iframe，`src` 指向本包那条插件路由。

地址里带的是 frontmatter 那个 spec 地址（编码成 `src` 参数），**不带** hash：iframe 的 `src`
只由配置决定，服务端与客户端算出的完全一样，深链那一段靠框里那句 ready 换进框内（见包 README
的「深链」）。这里比的是属性原文，不是解析后的绝对地址。
*/
Then('这一页放的是一个 iframe，指向 scalar 那条独立页面', async ({ page }) => {
  await expect(frameElement(page), '命中页没有那一个 iframe').toHaveCount(1);
  await expect(frameElement(page)).toHaveAttribute(
    'src',
    '/scalar-view?src=%2Fopenapi.yaml',
  );
});

// 取的是 `static/openapi.yaml`（产物里的 `/openapi.yaml`）：文档标题先证明框里真取到了。
// 认的是左栏那颗 `h1`（实测整页只有它一颗「主题覆盖演示 API」，两种入口下都在）。
Then('Scalar 在框里接管了这一屏，读的是本站那份 yaml', async ({ page }) => {
  await expect(
    root(page),
    '框里没有 Scalar 的根格：`scalar:` 那一步没命中，或框内那份文档没渲染',
  ).toBeVisible();
  await expect(
    root(page).locator('h1'),
    '框里左栏没有 API 标题：spec 没取到',
  ).toContainText('主题覆盖演示 API');
});

/**
Scalar 取不到那份文档时**不抛异常**，只在正文区打一句「Document 'api-1' could not be loaded」
（实测坏 `src` 就是这一句）。这一条钉这一页读到的是本站那份 yaml，不是那句报信。

界面换成简体之后这一句也还是英文：那句不在这份 locale 表里（`zh-cn.js` 253 条 key 与 `en.js`
一一对应，里面没有任何一条对得上这句话），它是厂商硬编码的（实测在这份安装的
`dist/browser/standalone.js` 里数到 1 处）。
*/
Then('Scalar 没有报那份文档取不到', async ({ page }) => {
  await expect(
    root(page),
    `框里出现「${loadErrorText}」：那份 yaml 没取到`,
  ).not.toContainText(loadErrorText);
});

Then('三个接口都在 Scalar 的左栏里', async ({ page }) => {
  for (const href of operationHrefs) {
    await expect(
      menu(page).locator(`a[href="${href}"]`),
      `API 导航里少了「${href}」`,
    ).toBeVisible();
  }
});

When('我点开 Scalar 左栏里的新建订单', async ({ page }) => {
  await menu(page)
    .locator(`a[href="${operationHref('POST', 'orders')}"]`)
    .click();
});

/**
接口详情换到那条接口，**外层**地址栏里那一段也跟着换。

后半句量的就是框内 → 外层那一条消息：Scalar 换一条接口走的是 `history.pushState`，它不触发
`hashchange`，外层只能听配置里那个 `onSidebarClick` 报（`scalar-ui.tsx`）。这一句红了通常就是
那条通道断了，而不是 Scalar 没渲染。

这份清单只适用于「先打开这一页再点下去」，整页直达那条用例另有判据（见下）。
*/
Then('详情面板换成 Scalar 里那条接口，外层地址也跟着换', async ({ page }) => {
  await expect(
    root(page).locator('h1, h2, h3'),
    '接口详情没渲染出来',
  ).toContainText([
    '主题覆盖演示 API',
    'orders',
    '列出订单',
    '新建订单',
    '取单个订单',
  ]);
  // Scalar 报出来的就是它自己那条完整 hash（`#tag/orders/POST/orders`，`#` 后面**不带**斜杠；
  // Redoc 那边是小写 operationId、Elements 那边是 `#/operations/…`，三串各按各的写）。
  await expect(page).toHaveURL(/\/scalar-demo#tag\/orders\/POST\/orders$/);
});

/**
地址里那一段指哪条接口，框里的正文区就摆哪条接口。

这一句**不复用**上一条：那一条是「先打开这一页再点下去」的判据。整页直达时 Scalar 从地址那一段
往下铺，实测标题是「主题覆盖演示 API」「orders」「列出订单」「新建订单」—— 与点击那一份同形。

清单只钉到「新建订单」为止，不含最后那条「取单个订单」：Scalar 的正文区是**按需挂载**的，
视口（e2e 用 1440×720）之下还没滚到的那一节不在 DOM 里 —— 实测这一页整页直达时可见的标题就是
「主题覆盖演示 API」「orders」「列出订单」「新建订单」四颗，把窗口加高到 900 也还是这四颗。
判据按这一层真正要证的那一格钉 —— 地址里那条接口摆出来了没有。
*/
Then('Scalar 框里摆的是地址里那条接口', async ({ page }) => {
  await expect(
    root(page).locator('h1, h2, h3'),
    '框里的正文区没摆出地址里那条接口：那一段没送进框里',
  ).toContainText(['列出订单', '新建订单']);
});

/**
那条接口的 operationId 也摆在正文里（`showOperationId: true`，厂商默认是 `false`）。

认的是**整段文案正好等于** `createOrder` 的那一颗：实测它是接口标题旁 `div.flex.flex-wrap.gap-1`
里的一颗 `div`（那份 `static/openapi.yaml` 三条都有 id：`listOrders` / `createOrder` / `getOrder`）。
代码示例里也出现这几个字，但都在更长的句子里，`exact` 那一格把它们排除掉了。
*/
Then('那条接口的 operationId 也摆在正文里', async ({ page }) => {
  await expect(
    root(page).getByText('createOrder', { exact: true }).first(),
    '正文里没有那条 operationId 徽标（`showOperationId` 没生效）',
  ).toBeVisible();
});

/**
与 redoc / stoplight 同一条取舍的另一头：代码块里那些复制按钮**不该**被一起收掉，所以这里钉
它们还在（实测点开接口之后框里 17 颗）。Scalar 不给那几颗 `data-testid`，认的是按钮自己的文案。

界面文案按配置里的 `localization.locale` 走（本层设成 `zh-cn`），所以这一句两种文案都收：
简体那份把「Copy link」翻成「复制链接」、「Copy as Markdown」翻成「复制为 Markdown」，而代码块
那一行的文案不翻（实测框里那几颗按钮的文本是 `cURLCopycURLCopy` 这样的样子）。两种各数一次是
6 颗（只认 `Copy`）加 11 颗（只认「复制」），并起来才是那 17 颗 —— 所以只认英文会静默少 11 颗、
只认中文会静默少 6 颗，两句都得留着。
*/
Then('框里代码块的复制按钮还在', async ({ page }) => {
  const copyButtons = root(page)
    .locator('button')
    .filter({ hasText: /copy|复制/i });

  expect(
    await copyButtons.count(),
    '代码块里那几颗复制按钮不见了（按文案认，实测 17 颗）',
  ).toBeGreaterThan(0);
  await expect(copyButtons.first()).toBeVisible();
});

/**
Scalar 左栏底部那颗它自己的亮暗开关，实测露出来时是一份 `aria-label="Set dark mode"` 的元素
（没有 `data-testid`；把 `hideDarkModeToggle` 设成 `false` 重新构建后量到的就是这一串 —— 那一次
界面还是英文）。本层用配置收掉它 —— 配色由站点的开关驱动（`scalar-color-mode.ts`），留着它就是
一颗跟 navbar 那颗重复、还会把选择写进 `localStorage` 的按钮，按了只会改框内那份文档的类名、
站点没有任何反应。收法是不渲染（不是 `display: none`），所以这一句按数量判；先钉「这个标识在
本层确实认得出来」再钉「框里一个都没有」的写法没法两全，这里靠上面那条注释里那次实测当前提。
换成 `zh-cn` 之后这一句不受影响：那一颗本来就不进 DOM，判的是数量，不是文案。
*/
Then('Scalar 自己那颗亮暗开关不出现', async ({ page }) => {
  await expect(
    root(page).locator('[aria-label*="Set "]'),
    '框里出现了 Scalar 自己那颗亮暗开关',
  ).toHaveCount(0);
});

/**
Scalar 那颗「Ask AI」的按钮不出现。

同一类问题的另一头：厂商那一路判据按顺序是「配置里 `agent.disabled` → 本机地址就开 → 配了
`agent.key` 才开」（`ApiReference.vue.script.js`），本层没有 key，于是这颗按钮**只在本地服务上**
露出来 —— 与下面那条开发者工具栏一样，是「同一份产物在本地和线上长得不一样」的那一格。

这句按文案认（厂商那颗按钮没有 `data-testid`，也没带稳定的类名）。收之前实测：`/scalar-demo`
框里那份文档 1 颗「Ask AI」，直接打开 `/scalar-view` 也 1 颗；按 `agent.disabled` 钉死之后两处
都 0 颗。从**整份框内文档**往下数，不从布局根往下 —— 那颗按钮在左栏搜索那一行里，判据不押它
在不在布局根里面。界面换成 `zh-cn` 之后它的文案是「询问 AI」（厂商 locale 表里的 `agent.askAi`），
所以这一句两种都收：只认英文的话，那颗按钮哪天回来了也用中文出现，这一句照样 0 颗、什么也说不了。
*/
Then('Scalar 那颗「问 AI」的按钮不出现', async ({ page }) => {
  await expect(
    frameDoc(page)
      .locator('button')
      .filter({ hasText: /ask ai|询问 ai/i }),
    '框里出现了 Scalar 那颗「Ask AI」的按钮（`agent.disabled` 不是 true）',
  ).toHaveCount(0);
});

/**
每条接口右上角那颗「Test Request」不出现。

收它的理由不是「本地和线上长得不一样」，是**它真的会把请求发出去**：那一格读的是这份文档自己的
`servers`，任何人点一下就从站点的页面上朝那个地址发一条请求。这一层摆的是给别人看的接口文档，
凭据与 CORS 都不在本层的承诺里，所以按配置收掉；代码示例与那份文档的下载不受影响（见上面那句
「框里代码块的复制按钮还在」与包 README 的「收掉的几处」）。

按文案认。厂商那一格 `hideTestRequestButton` 的默认值是 `false`（`@scalar/types@0.24.0`，类型注释
写的是 `Whether to show the "Test Request" button`），那颗按钮没有 `data-testid`，文案取自本地化表
里的 `operation.testRequest`（`features/localization/locales/`：英文 "Test Request"、简体「测试请求」），
所以两种都收。从整份框内文档往下数：那颗按钮长在每条接口的标题行里，判据不押它嵌在布局根的哪一层。
*/
Then('Scalar 那颗「试调用」的按钮不出现', async ({ page }) => {
  await expect(
    frameDoc(page)
      .locator('button')
      .filter({ hasText: /test request|测试请求/i }),
    '框里出现了 Scalar 那颗「Test Request」的按钮（`hideTestRequestButton` 不是 true）',
  ).toHaveCount(0);
});

/**
左栏底部那颗「Generate MCP」/「Connect MCP」（简体那份是「生成 MCP」/「连接 MCP」）的安装入口
不出现，摆出来的是 API client 那一颗。

厂商那一格的判据是「配置里 `mcp.disabled` 优先 —— 给了它就直接退回 API client 那颗；不给时按
「本机地址摆 explore、线上摆 client」走」（`ApiReference.vue.script.js` 的 `sidebarCta`），于是
不设这一格时本地与线上又是两个形状。那两颗的文案取自本地化表（`mcp.generate` / `mcp.connect`），
没有 `data-testid`；两种语言里那一段「MCP」都是拉丁字母，所以 `/\bmcp\b/i` 一条就够。

两句一起写，都在 **DOM 那一层**判：先钉 MCP 那两颗一颗都没有（按钮与链接都算），再钉换出来的
那颗确实是 API client 入口 —— 判据认的是厂商给它挂的类名 `open-api-client-button`（实测它是左栏
底部一颗 `<a>`，`href` 指向 `client.scalar.com`），不押文案，因为那颗的文案跟着 locale 走
（实测英文 `Open API Client`、简体「打开 API 客户端」）。这里也不能按可见性判：左栏底部这一整格
本来就归下面那条「powered by Scalar」收掉了（`scalar-ui.css` 那条 `display: none` 落的是这一格，
署名那行和 CTA 那一行同住），可见性判据只会量到我们自己那条 CSS。只钉前一句也不行 —— 整格没了
的时候计数同样是 0。这一句钉的是配置换出来的是哪一颗，与它可见不可见无关。
*/
Then('左栏底部那一颗换成了 API client，不是 MCP 安装入口', async ({ page }) => {
  await expect(
    frameDoc(page)
      .locator('button, a')
      .filter({ hasText: /\bmcp\b/i }),
    '框里出现了 Scalar 那颗 MCP 安装入口（`mcp.disabled` 不是 true）',
  ).toHaveCount(0);

  await expect(
    frameDoc(page).locator('a.open-api-client-button'),
    '左栏底部那一颗不是 API client 入口（`mcp.disabled` 换出来的是别的东西）',
  ).toHaveCount(1);
});

/**
正文顶上那条开发者工具栏（本层真的摆出来的是标题与「改配置」那颗；分享、部署、生成 SDK 要
有 `workspace` 才渲染）不出现。

为什么要在这层按死它：Scalar 那一格默认值是 `localhost`（`@scalar/types@0.24.0` 的
`showDeveloperTools`：`z.enum(['always','localhost','never']).default('localhost')`），判据是
`isLocalUrl(window.location.href)` —— 站点跑在 `pnpm start` 与 e2e 的本地服务上**正好命中**，
于是同一份产物在本地和线上长得不一样。实测这一格从默认换成 `never`：框内那份文档里
`.scalar-app` 从 7 颗掉到 3 颗（直接打开 `/scalar-view` 从 9 颗到 5 颗），那条
`header.api-reference-toolbar` 连同它带出来的几格一起没了。

按数量判（与上面那颗开关同一个理由：它本来就不渲染，`display: none` 用不上），且从**整份框内
文档**往下找而不是从布局根往下 —— 那条栏长在正文那一侧，判据不该押它在不在布局根里面。
*/
Then('Scalar 那条开发者工具栏不出现', async ({ page }) => {
  await expect(
    frameDoc(page).locator('.api-reference-toolbar'),
    '框里出现了 Scalar 那条开发者工具栏（`showDeveloperTools` 不是 `never`）',
  ).toHaveCount(0);
});

/**
左栏底部那条「powered by Scalar」的署名与 Scalar 那张推广位，`scalar-ui.css` 收的是装着它的
那一整格（认的是它**是什么**：`aside` 的直接子格里有一条指向 scalar.com 的 powered-by 外链，
不是 Tailwind 那串 `flex flex-col …` —— 换个版本类名就重排）。
它是 `display: none` 收的，元素仍在 DOM 里，所以判据走可见性而不是数量（与 redoc 那三处同口径）。
*/
Then(
  '「powered by Scalar」那条署名不出现，左栏那一格还在',
  async ({ page }) => {
    const poweredCell = menu(page).locator(
      'div:has(> a[href^="https://scalar.com/?utm_source=powered-by"])',
    );
    expect(
      await poweredCell.count(),
      '框里找不到那一格署名，选择器先失效了',
    ).toBeGreaterThan(0);
    await expect(
      poweredCell.first(),
      '「powered by Scalar」那一格还看得见',
    ).toBeHidden();

    await expect(menu(page), '收署名时把左栏整格一起收掉了').toBeVisible();
  },
);

/**
那颗「生成 SDK」（简体那份是「生成 SDK」，英文 "Generate SDK"）不出现。

为什么要在这层收：厂商那一格没有配置（`@scalar/types@0.24.0` 那份 schema 里 `sdk` 相关的一条
都没有），判据是「本机地址」—— `use-generate-sdk.js` 的 `isLocalUrl(window.location.href)`。
站点跑在 `pnpm start` 与 e2e 的本地服务上**正好命中**，实测本地 3 颗、线上 0 颗，与已经按死的
开发者工具栏、Ask AI、MCP 入口是同一族「本地比线上多出东西」。这一颗点下去还会把这份文档
上传到 scalar.com。

两句一起写，理由与上面那条 MCP 的一样：只看「看不见」不够 —— 厂商哪天换了类名，那条 CSS
就打成空的，计数同样是 0，所以先钉 DOM 里那两种形状确实还在（`generate-sdk-button` 是接口卡
代码示例页脚那一颗，`selected-client-action` 是客户端选择器右上角那一颗），再各取一颗判可见性
（`display: none` 收的，元素仍在 DOM 里）。最后那句按文案数一遍**可见**的按钮，两种语言都收，
钉的是「读者眼前没有这一颗」。
*/
Then('Scalar 那颗「生成 SDK」的按钮不出现', async ({ page }) => {
  for (const selector of ['.generate-sdk-button', '.selected-client-action']) {
    const buttons = frameDoc(page).locator(selector);
    expect(
      await buttons.count(),
      `框内找不到 ${selector}：那颗按钮的形状变了，${selector} 那条 CSS 规则现在是打成空的`,
    ).toBeGreaterThan(0);
    await expect(
      buttons.first(),
      `框里那颗 ${selector} 还看得见（scalar-ui.css 那条 display: none 没落上）`,
    ).toBeHidden();
  }

  await expect(
    frameDoc(page)
      .locator('button:visible')
      .filter({ hasText: /generate sdk|生成 sdk/i }),
    '框里看得见一颗「生成 SDK」的按钮',
  ).toHaveCount(0);
});

/**
这一条量的是「隔离」这件事本身：外层那份文档里**没有任何** Scalar 的痕迹 —— 它自己那几格
（`.scalar-app`）都不存在，正文文字更不在外层文档里。

框内那一份文档里它的样式往哪儿打，本层不再钉：Scalar 那份表是发布好的静态产物，随框内那份
文档加载，「不打到站点上」由浏览器给的文档边界负责（口径见包 README 的「样式」一节）。
*/
Then('外层文档里没有 Scalar 的运行时痕迹', async ({ page }) => {
  const state = await page.locator('html').evaluate((el) => {
    const doc = el.ownerDocument;
    return {
      appCount: doc.querySelectorAll('.scalar-app').length,
      hasSpecText: (doc.body.textContent ?? '').includes('主题覆盖演示 API'),
    };
  });

  expect(state.appCount, '外层文档里出现了 `.scalar-app` 那一格').toBe(0);
  expect(state.hasSpecText, '外层文档里有 Scalar 渲染出来的文字').toBe(false);
});

/**
这一条量的是**外层**那一份文档：站点自己的壳（navbar 那颗按钮、`<html>` 本身）在命中页与
主页上必须一模一样。量法与它为什么要等过渡落定，记在 `../helpers.mts` 的 `siteStyles`；
主页是**整页重新加载**去的。
*/
Then('站点自己的那几处样式不被 Scalar 改写', async ({ page }) => {
  const onScalarPage = await siteStyles(page);

  await page.goto('/');
  const onHome = await siteStyles(page);

  expect(
    onScalarPage,
    `scalar 页上的站点样式与主页不一样：${JSON.stringify(onScalarPage)}`,
  ).toEqual(onHome);
});

/**
## 亮暗模式跟站点走，不跟操作系统走

Scalar 自带一套亮暗模式：判据是 `<body>` 上互斥的两个类名（`dark-mode` / `light-mode`），
自己还会把选择写进 localStorage；那套 Tailwind 调色板里的 `--scalar-background-1` 随类名从
`#fff` 翻到 `#0f0f0f`（实测）。站点自己另有一个开关（`<html data-theme>`），两处各切各的就会
打架。本层用配置 `hideDarkModeToggle` 收掉它自己那颗按钮，配色改由站点这一头驱动：那个值写在
**外层**文档的 `<html>` 上，而类名要落在**框内**那份文档的 `<body>` 上 —— 这一格由共享那条
postMessage 通道接（`theme/theme-iframe/lib/`：外层 `api-frame.tsx` 送、框内那份工厂
`api-frame-view.tsx` 收，收下来经 `applyScalarColorMode` 换那两个类名）。框内那份文档不挂站点的
`ColorModeProvider`，
站点那条 `data-theme` 在这里只是加载时内联脚本写死的一份、没人维护，本层不读它。

「切成暗色」「做个记号」「配色跟着翻、文档没重新加载」这三步三层共用，句子与实现在
`common.steps.mts`；这里只留 Scalar 这一头特有的三句：系统深色时站点仍是亮色、框内那份文档
**没有**暗色类名（这一层的类名由本层写，Redoc 那两层还留着它自己那份类名、靠改挂属性夺走
驱动，这里是干脆不写 —— 「自己那份类名不写暗色」就是这一层的当前态）、以及消息落点那两个类名
本身。量的那一格是框内那份文档 `<body>` 上的配色读数，为什么分支到 `<body>`，见
`../helpers.mts` 的 `frameModeSignal`。
*/
Given('我按操作系统的深色偏好打开 scalar 示例页', async ({ page }) => {
  watchPageErrors(page);
  // 要在加载前定下来：Scalar 那套配色里读系统偏好的是挂载那一次判定，加载完再改就只是改个媒体查询。
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/scalar-demo');
});

Then(
  'Scalar 那一格收的是站点这一头的亮色，它自己那份类名不写暗色',
  async ({ page }) => {
    // 框内那一格的亮暗由外层送进来（不是它自己读的），所以这一句钉的是那条消息确实到了、
    // 落点是站点这一头的亮色：`<body>` 上是 `light-mode` 那颗类名。
    await expect(frameDoc(page).locator('body')).toHaveClass(/\blight-mode\b/);
    await expect(frameDoc(page).locator('body')).not.toHaveClass(
      /\bdark-mode\b/,
    );
  },
);

Then('Scalar 的配色不跟操作系统走', async ({ page }) => {
  const onDarkSystem = await frameModeSignal(page);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  const onLightSystem = await frameModeSignal(page);

  expect(
    onLightSystem,
    `操作系统的偏好换了，框里那一页的配色跟着换了（${onDarkSystem} → ${onLightSystem}）：` +
      '这一页的亮暗不是站点这一头给的',
  ).toBe(onDarkSystem);
});

Then('Scalar 那一格也收到站点送进来的暗色', async ({ page }) => {
  // 开关跨过 iframe 的边界：外层那条消息送到了，框内那份文档的 `<body>` 上换成了 `dark-mode`。
  await expect(frameDoc(page).locator('body')).toHaveClass(/\bdark-mode\b/);
});

/**
「站点这一侧不受影响」那一条是在亮色下量的，而改类名之后多出一格亮色碰不到的：站点一进暗色，
Scalar 那套暗色变量就一起落在**框内那份文档**的 `<body>` 上（外层那份根本没有这些规则）。
这里量的还是外层：外层在暗色下的那几处站点属性必须与暗色下的主页一样。
*/
Then('站点自己的那几处样式在暗色下也不被 Scalar 改写', async ({ page }) => {
  const onScalarPage = await siteStyles(page);

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(
    await siteStyles(page),
    `暗色下这一页的站点壳与主页不一样：${JSON.stringify(onScalarPage)}`,
  ).toEqual(onScalarPage);
});

/**
框内那条地址本身也是站点的一条页面：带着 `src` 就能独立打开（调试用，也证明这一层没有把
渲染绑死在 iframe 上）。`src` 按 frontmatter 那个值写，与 iframe 属性里那条一字不差。
*/
Given('我直接打开 scalar 框内那条地址', async ({ page }) => {
  watchPageErrors(page);
  const response = await page.goto('/scalar-view?src=%2Fopenapi.yaml');
  expect(response?.status(), '框内那条地址在产物里不存在').toBe(200);
});

Then('这一页直接渲染 Scalar', async ({ page }) => {
  const app = page.locator('.scalar-app.scalar-api-reference');
  await expect(app).toBeVisible();
  await expect(app).toContainText('主题覆盖演示 API');
});

When('我把 scalar 框内那条地址里的 spec 去掉', async ({ page }) => {
  await page.goto('/scalar-view');
});

/**
地址里缺 `src`（或写成解析不成 http(s) 的东西）时这一格什么都不摆。

钉这一句是因为 Scalar 拿到空地址**不报错**，而是把它自己那句「could not be loaded」摆在正文区
—— 看着像渲染器坏了。这一页是条公开地址，任何人都能直接打开它，所以这一格要按「什么都不摆」钉死。
*/
Then('Scalar 那一格不出现，那句「取不到」也不出现', async ({ page }) => {
  await expect(page.locator('.scalar-app')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(loadErrorText);
});

/**
框内那一格：Scalar 的左栏（`<aside>`）占满**框内那份文档**的整屏（那份文档没有 navbar，上沿
就是 0；实测 `top: 0 / bottom = innerHeight`）。这一层不给容器定高，那份文档自己是滚动的那一份
（长内容滚在框内文档上，滚在 iframe 里面看不见 —— 与 redoc 那两层「文档自己滚」同形）。
*/
Then('框里左栏贴满那一份文档的一屏', async ({ page }) => {
  const box = await menu(page).evaluate((el) => {
    const view = el.ownerDocument.defaultView;
    const rect = el.getBoundingClientRect();
    return {
      gapToTop: Math.round(rect.top),
      gapToViewport: Math.round((view?.innerHeight ?? 0) - rect.bottom),
    };
  });

  expect(
    Math.abs(box.gapToTop),
    `框里左栏的上沿没贴住那份文档的顶：差 ${box.gapToTop}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(box.gapToViewport),
    `框里左栏的下沿没贴住那份文档的底：差 ${box.gapToViewport}px`,
  ).toBeLessThanOrEqual(1);
});
