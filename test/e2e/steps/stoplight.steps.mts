import { expect } from '@playwright/test';
import type { FrameLocator, Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import {
  frameModeSignal,
  layerDemoUrl,
  layerFrameDoc,
  siteStyles,
  watchPageErrors,
} from '../helpers.mts';

const { Given, When, Then } = createBdd();

/**
## 这一层的判据分两份文档量，口径与 `theme-redoc` 一对一

命中页（`/stoplight-demo`）里只有一个 iframe，Elements 整个跑在框内那份文档（本包那条插件路由
`/stoplight-view`）上。每条判据都得指名站在哪一份文档里量：

- 外层：`page.locator(...)` —— 这一份里**不该**有 Elements 的 DOM，也不该有它那份样式表；
- 框内：`frameDoc(page)` —— 它是那一份文档的**框**（`Locator#contentFrame()` 交回 `FrameLocator`，
  只给 `locator()` 不给你 `evaluate()`），后面的选择器都从它往下找；要跑脚本就先取它下面的
  `html` 那一颗，回调里再拿 `el.ownerDocument`。

同源，两边都能直接读 DOM 与 CSSOM，不需要往测试里塞第二层通道。
「切成暗色」「做个记号」「配色跟着翻」那三步，加上「打开哪一页」「框的 `src` 指向哪儿」那五句，
三层只差一个层名，共用一份实现，在 `common.steps.mts`。

Elements 的路由也走 hash，但它认 `operationId` **原样**（`createOrder` 就是 `createOrder`，
Redoc 那边是小写的），下面的 href 按浏览器里真的那串写。href 不带路径前缀，是因为框内那份文档
的地址里没有前缀可剥（口径记在 `theme/theme-stoplight/docs/internals.md`）。
*/
const frameDoc = (page: Page): FrameLocator => layerFrameDoc(page, 'stoplight');

/** 包着 Elements 的那层壳，也是本层那份版式的作用范围。 */
const root = (page: Page): Locator => frameDoc(page).locator('.stoplight-root');

const operationHref = (operationId: string): string =>
  `#/operations/${operationId}`;

const operationIds = ['listOrders', 'createOrder', 'getOrder'];

/**
整页加载一条**别人转发过来的接口地址**：`#/operations/createOrder` 这段是框里点了接口之后
送进外层地址栏的。这一条钉的是它在静态产物里也打得开，而且是 **HTTP 200** —— 页面本身是
`build/stoplight-demo/index.html` 那一份，hash 段不参与取文件，托管侧不用认识它。
*/
Given('我直达 stoplight 那条接口的地址', async ({ page }) => {
  watchPageErrors(page);
  const response = await page.goto(
    `${layerDemoUrl('stoplight')}#/operations/createOrder`,
  );
  expect(response?.status(), '这条地址没被当成真页面来回').toBe(200);
});

/**
取的是 `static/openapi.yaml`（产物里的 `/openapi.yaml`）：文档标题先证明框里真取到了。

量的**不是 `h1`** 而是左栏那条 `h4`：两种入口下 `h1` 的落点不一样 —— 先打开这一页时正文区摆的是
文档概览（`h1` 就是「主题覆盖演示 API」），整页直达一条接口时 Elements 从地址那一格往下铺，
`h1` 变成那条接口的 summary（实测「新建订单」）。左栏那条 API 标题两种入口都在，而且只有一颗
（实测），拿它当「spec 取到了」的证据才不会跟着入口形状变。
*/
Then('Elements 在框里接管了这一屏，读的是本站那份 yaml', async ({ page }) => {
  await expect(
    root(page),
    '框里没有 `.stoplight-root`：`oas3:` 那一步没命中，或框内那份文档没渲染',
  ).toBeVisible();
  await expect(
    root(page).locator('h4'),
    '框里左栏没有 API 标题：spec 没取到',
  ).toContainText('主题覆盖演示 API');
});

// 三个接口挂在 `orders` 分组下面，而这一组**默认折叠**（折叠时链接根本不在 DOM 里），先点开。
When('我点开 Elements 左栏里的 orders 分组', async ({ page }) => {
  await root(page)
    .locator('div.sl-cursor-pointer')
    .filter({ hasText: /^orders$/ })
    .click();
});

Then('三个接口都在 Elements 的左栏里', async ({ page }) => {
  for (const operationId of operationIds) {
    await expect(
      root(page).locator(`a[href="${operationHref(operationId)}"]`),
      `API 导航里少了「${operationId}」`,
    ).toBeVisible();
  }
});

When('我点开 Elements 左栏里的新建订单那条接口', async ({ page }) => {
  await root(page)
    .locator(`a[href="${operationHref('createOrder')}"]`)
    .click();
});

/**
接口详情换到那条接口，**外层**地址栏里那一段也跟着换。

后半句量的就是框内 → 外层那一条消息：Elements 换一条接口走的是 `history.pushState`，它不触发
`hashchange`，外层只能听它自己的路由报（`stoplight-ui.tsx` 里那个 `LocationMirror`）。
这一句红了通常就是那条通道断了 —— 最可能是 `react-router-dom` 与 Elements 内部用的不是同一个
模块实例，那时它自己另建一个路由，本层这一格收不到。

这份清单只适用于「先打开这一页再点下去」，整页直达那条用例另有判据（见下）。
*/
Then('Elements 的详情面板换成那条接口，外层地址也跟着换', async ({ page }) => {
  await expect(root(page).locator('h1'), '接口详情没渲染出来').toContainText(
    '新建订单',
  );
  await expect(page).toHaveURL(/\/stoplight-demo#\/operations\/createOrder$/);
});

/**
地址里那一段指哪条接口，框里的正文区就摆哪条接口。

这一句**不复用**上一条：那一条是「先打开这一页再点下去」的判据。整页直达时 Elements 从地址指的
那一条往下铺，框里的标题直接就是那条接口的 summary（实测），所以这里按直达那一份钉。
*/
Then('Elements 框里摆的是地址里那条接口', async ({ page }) => {
  await expect(
    root(page).locator('h1'),
    '框里的正文区没摆出地址里那条接口：那一段没送进框里',
  ).toContainText('新建订单');
});

/**
左栏底部那条「Powered by Stoplight」，`stoplight-ui.css` 按「那一栏最后一条指向 stoplight.io
的链接」收掉。认的是它**是什么**，不是它排在第几颗 —— 实测这一格在 DOM 里、`offsetParent` 为空。
*/
Then('Elements 那条署名不出现', async ({ page }) => {
  const poweredBy = root(page).locator('a[href*="stoplight.io"]');
  expect(
    await poweredBy.count(),
    '框里找不到那条署名，选择器先失效了',
  ).toBeGreaterThan(0);
  await expect(poweredBy.first(), '那条署名还看得见').toBeHidden();
});

/**
「Try it」面板里那颗发送按钮，`stoplight-ui.css` 收的是 `.SendButtonHolder` 里第一颗 `button`。
这一格只在**接口详情页**出现（概览页上一颗都没有，实测 `querySelectorAll('.SendButtonHolder')`
为 0），所以这一步必须排在「点开新建订单那条接口」之后。

先钉这一格在 DOM 里认得出来，再钉那颗按钮不显眼 —— 选择器哪天匹配不上就静默通过，是最坏的一种绿。
*/
Then('「Try it」面板里那颗发送按钮不出现', async ({ page }) => {
  const holder = root(page).locator('.SendButtonHolder');
  await expect(holder, '框里没有「Try it」那一格，选择器先失效了').toHaveCount(
    1,
  );
  await expect(
    holder.locator('button').first(),
    '那颗发送按钮还看得见',
  ).toBeHidden();
});

/**
框内那一格：`.stoplight-root` 占满**那份文档**的整屏（那份文档没有 navbar，上沿就是 0），
而那份文档自己不滚 —— 长内容滚在 Elements 里面那一格，不在框的文档上。实测两者都是 660 = 视口高。
*/
Then('框里那一屏不留下自己的滚动条', async ({ page }) => {
  const box = await root(page).evaluate((el) => {
    const doc = el.ownerDocument;
    const view = doc.defaultView;
    const rect = el.getBoundingClientRect();
    return {
      gapToTop: Math.round(rect.top),
      gapToViewport: Math.round((view?.innerHeight ?? 0) - rect.bottom),
      overflow: Math.round(
        doc.documentElement.scrollHeight - (view?.innerHeight ?? 0),
      ),
    };
  });

  expect(
    Math.abs(box.gapToTop),
    `框里那一格的上沿没贴住那份文档的顶：差 ${box.gapToTop}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(box.gapToViewport),
    `框里那一格的下沿没贴住那份文档的底：差 ${box.gapToViewport}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    box.overflow,
    `框内那份文档自己能滚 ${box.overflow}px：这一层不该让它比一屏高`,
  ).toBeLessThanOrEqual(0);
});

/**
这一条量的是「隔离」这件事本身，也是这一层删掉构建期圈定之后**换了做法**的那一格：

- 外层文档里凡提到 `.sl-` 的规则都还带着 `.stoplight-root` 这个前缀 —— 站点的版式文件里
  只有本层那三条限定规则提到过它，Elements 那 2300 来条规则一条都不该在（改造前它们就在全站
  那一份里，靠 postcss 逐条加前缀）；
- 外层文档里没有任何一份表的地址是 Elements 那个产物（`assets/css/styles.min.<hash>.css`）；
- 外层文档里也没有 `.stoplight-root` 那一格。

漏回全站那一份的表现就是这三条里第一条红：站点每页都会 `<link>` 同一个文件，静态样式拦不住，
只能靠「它根本不在那个文件里」。理由与实测的漏法记在包 `docs/internals.md` 的「样式」一节。
*/
Then('外层文档里没有 Elements 的痕迹', async ({ page }) => {
  const state = await page.locator('html').evaluate((el) => {
    const doc = el.ownerDocument;
    const unscoped: string[] = [];

    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        // `@media` / `@supports` 这类容器没有 selectorText，往里走一层。
        const grouped = rule as CSSGroupingRule;
        if (grouped.cssRules) {
          walk(grouped.cssRules);
          continue;
        }
        const selector = (rule as CSSStyleRule).selectorText ?? '';
        if (
          selector.includes('.sl-') &&
          !selector.includes('.stoplight-root')
        ) {
          unscoped.push(selector);
        }
      }
    };

    for (const sheet of doc.styleSheets) {
      try {
        if (sheet.cssRules) {
          walk(sheet.cssRules);
        }
      } catch {
        // 跨源样式表读不到规则，跳过（本仓没有这种表）。
      }
    }

    return {
      unscoped,
      elementsSheet: [...doc.styleSheets].some((sheet) =>
        /styles\.min\.[0-9a-f]+\.css$/.test(sheet.href ?? ''),
      ),
      rootCount: doc.querySelectorAll('.stoplight-root').length,
    };
  });

  expect(
    state.unscoped.slice(0, 5),
    `这些 .sl- 选择器不在 .stoplight-root 里，说明 Elements 的表漏进了外层：${state.unscoped
      .slice(0, 5)
      .join('、')}`,
  ).toEqual([]);
  expect(
    state.elementsSheet,
    '外层文档里挂了 Elements 那份样式表那个产物',
  ).toBe(false);
  expect(state.rootCount, '外层文档里出现了 `.stoplight-root` 那一格').toBe(0);
});

/**
与上一条配对的一句：Elements 那份表**确实**只挂在框内那一份文档上 —— 认它的产物地址，
再认它的规模（两千来条规则，站点那一份只有五百来条）。少了这一句，上一条可以靠「两边都没加载」
蒙对。
*/
Then('Elements 那份样式表只挂在框里', async ({ page }) => {
  const sheets = await frameDoc(page)
    .locator('html')
    .evaluate((el) =>
      [...el.ownerDocument.styleSheets].map((sheet) => ({
        href: sheet.href ?? '',
        rules: (() => {
          try {
            return sheet.cssRules?.length ?? 0;
          } catch {
            return -1;
          }
        })(),
      })),
    );

  const elements = sheets.filter((sheet) =>
    /styles\.min\.[0-9a-f]+\.css$/.test(sheet.href),
  );
  expect(
    elements,
    `框里没挂上 Elements 那份表：${JSON.stringify(sheets)}`,
  ).toHaveLength(1);
  expect(
    elements[0]?.rules,
    '框里那份表规则数不对，像是被空文件顶替了',
  ).toBeGreaterThan(1000);
});

/**
**外层**那一份文档：站点自己的壳（navbar 那颗按钮、`<html>` 本身）在命中页与主页上必须一模一样。
量法与它为什么要等过渡落定，见 `../helpers.mts` 的 `siteStyles`。主页是**整页重新加载**去的。
*/
Then('站点自己的那几处样式不被 Elements 改写', async ({ page }) => {
  const onStoplightPage = await siteStyles(page);

  await page.goto('/');
  const onHome = await siteStyles(page);

  expect(
    onStoplightPage,
    `stoplight 页上的站点样式与主页不一样：${JSON.stringify(onStoplightPage)}`,
  ).toEqual(onHome);
});

/**
## 亮暗模式跟站点走

Elements 那套配色（`@stoplight/mosaic`）自带亮暗模式：判据是它自己存在 localStorage 里那份存档
（`mosaic-theme`，默认 `light`），再往 `<html>` 上写 `data-theme` —— 和站点那条属性**同名**。
它的暗色表就挂在 `[data-theme=dark]` 上，所以这一层不需要像 `theme-redoc` 那样改写谁的选择器：
把站点这一头的模式随消息送进框内、写在同一条属性上就够了（本包 `theme/StoplightPage` 交给
框内工厂 `theme/theme-iframe/lib/api-frame-view.tsx` 的那条 `modeAttribute`，
`COLOR_MODE_ATTRIBUTE` 就定义在 `stoplight-ui.tsx`）。

多出来的一格是**同名**：框内那份文档自己也有一份 `data-theme`（Docusaurus 的内联脚本按
localStorage 写的、没人维护），Elements 那份存档也想写它。实测两头都不构成冲突 ——
存档里写着 `light` 时，站点送进来的 `dark` 照样落定，点接口之后也没被拧回去。

量的那一格是框内那份文档 `<html>` 上的两处读数（`frameModeSignal`）：这一层的 `<html>` 底色
是站点那条规则给的，`--canvas-l` 那个变量才是 Elements 自己的调色板。

这一组三句与另两层同形（句子形状见 `redoc.steps.mts`、`scalar.steps.mts`）：先钉操作系统换不了
这一页，切成暗色后钉消息落点翻过去了，最后单独钉这一页的暗色不是 Elements 自己那份存档选的。
这一层少一句：另两层在系统深色、站点亮色时各钉一条「那一格收的是站点这一头的亮色」，量的是
只有本层那条消息会写的东西（redoc 的 `data-redoc-mode`、scalar 的 `<body>` 类名）。这一层的落点
是 `data-theme`，而框内那份文档的 SSR 里就有一条内联脚本无条件写它（`theme` 那格取不到时按
`light` 落，实测产物里那句就是 `document.documentElement.setAttribute("data-theme",t||"light")`）
—— 亮色时两份写手给出同一个值，钉不出是谁写的，所以这一层只在暗色那一句上做对照。
*/
Then('Elements 的配色不跟操作系统走', async ({ page }) => {
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

Then('Elements 那一格也收到站点送进来的暗色', async ({ page }) => {
  // 开关跨过 iframe 的边界：外层那条消息送到了，框内那份文档的 `<html data-theme>` 也是 dark。
  await expect(frameDoc(page).locator('html')).toHaveAttribute(
    'data-theme',
    'dark',
  );
});

/**
同一个 `<html data-theme>` 上有两个想写它的名字：站点这一头送进来的那一个，和 Elements 自己存在
localStorage 里那份存档（`mosaic-theme`，默认 `light`）。这一句钉落定的是站点这一头。
（哪天 Elements 把存档同步成站点这一头的值，这一句会红 —— 那时把它删掉，别改成比相等。）
*/
Then('暗色不是 Elements 自己那份存档选的', async ({ page }) => {
  const stored = await frameDoc(page)
    .locator('body')
    .evaluate(() => localStorage.getItem('mosaic-theme') ?? '');
  expect(
    stored,
    `框里那份存档已经不是默认的亮色了（${stored}）：这一句的对比不成立了`,
  ).toContain('light');
});

Then('站点自己的那几处样式在暗色下也不被 Elements 改写', async ({ page }) => {
  const onStoplightPage = await siteStyles(page);

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(
    await siteStyles(page),
    `暗色下这一页的站点壳与主页不一样：${JSON.stringify(onStoplightPage)}`,
  ).toEqual(onStoplightPage);
});

Then('这一页直接渲染 Elements', async ({ page }) => {
  await expect(page.locator('.stoplight-root')).toBeVisible();
  await expect(page.locator('.stoplight-root')).toContainText(
    '主题覆盖演示 API',
  );
});

/**
地址里缺 `src`（或写成解析不成 http(s) 的东西）时这一格什么都不摆。这一页是条公开地址，
任何人都能直接打开它，所以按「什么都不摆」钉死。
*/
Then('Elements 那一格不出现', async ({ page }) => {
  await expect(page.locator('.stoplight-root')).toHaveCount(0);
});
