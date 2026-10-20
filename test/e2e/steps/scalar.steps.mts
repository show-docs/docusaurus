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
不够 —— 框内那份文档里它有 7 格（直接打开 `/scalar-view` 是 9 格，Scalar 给弹窗与提示各造一格），
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
视口（e2e 用 1280×720）之下还没滚到的那一节不在 DOM 里（实测同一时刻 720 高是 4 颗标题、
900 高才是 5 颗）。判据按这一层真正要证的那一格钉 —— 地址里那条接口摆出来了没有。
*/
Then('Scalar 框里摆的是地址里那条接口', async ({ page }) => {
  await expect(
    root(page).locator('h1, h2, h3'),
    '框里的正文区没摆出地址里那条接口：那一段没送进框里',
  ).toContainText(['列出订单', '新建订单']);
});

/**
与 redoc / stoplight 同一条取舍的另一头：代码块里那些复制按钮**不该**被一起收掉，所以这里钉
它们还在（实测点开接口之后框里 18 颗含「Copy」的按钮）。Scalar 不给那几颗 `data-testid`，
认的是按钮自己的文案。
*/
Then('框里代码块的复制按钮还在', async ({ page }) => {
  const copyButtons = root(page).locator('button').filter({ hasText: /copy/i });

  expect(
    await copyButtons.count(),
    '代码块里那几颗复制按钮不见了（按文案认，实测 18 颗）',
  ).toBeGreaterThan(0);
  await expect(copyButtons.first()).toBeVisible();
});

/**
Scalar 左栏底部那颗它自己的亮暗开关，实测露出来时是一份 `aria-label="Set dark mode"` 的元素
（没有 `data-testid`；把 `hideDarkModeToggle` 设成 `false` 重新构建后量到的就是这一串）。
本层用配置收掉它 —— 配色由站点的开关驱动（`scalar-color-mode.ts`），留着它就是一颗跟 navbar
那颗重复、还会把选择写进 `localStorage` 的按钮，按了只会改框内那份文档的类名、站点没有任何反应。
收法是不渲染（不是 `display: none`），所以这一句按数量判；先钉「这个标识在本层确实认得出来」
再钉「框里一个都没有」的写法没法两全，这里靠上面那条注释里那次实测当前提。
*/
Then('Scalar 自己那颗亮暗开关不出现', async ({ page }) => {
  await expect(
    root(page).locator('[aria-label*="Set "]'),
    '框里出现了 Scalar 自己那颗亮暗开关',
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
postMessage 通道接（`theme/frame-kit`：外层 `scalar-frame.tsx` 送、框内 `scalar-view.tsx` 收，
收下来经 `applyScalarColorMode` 换那两个类名）。框内那份文档不挂站点的 `ColorModeProvider`，
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
