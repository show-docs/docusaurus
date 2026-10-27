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
## 这一层的判据分两份文档量

命中页（`/theme-redoc/docs/redoc-demo`）里只有一个 iframe，Redoc 整个跑在框内那份文档（本包那条插件路由
`/redoc-view`）上。所以每条判据都得指名站在哪一份文档里量：

- 外层：`page.locator(...)` —— 这一份里**不该**有任何 Redoc 的东西（边界由浏览器给，
  本层不再做样式圈定，口径见包 `docs/internals.md` 的「样式」一节）；
- 框内：`frameDoc(page)` —— 它是那一份文档的**框**（`Locator#contentFrame()` 交回 `FrameLocator`，
  只给 `locator()` 不给你 `evaluate()`），后面的选择器都从它往下找；要跑脚本就先取它下面的
  `html` 那一颗，回调里再拿 `el.ownerDocument`。

同源，所以两边都能直接读 DOM 与 CSSOM，不需要往测试里塞第二层通道。

「打开哪一页」「框的 `src` 指向哪儿」那五句在三条层之间只差一个层名，实现收在
`common.steps.mts`（句子按层名捕获、地址由层名算）；这里只留 Redoc 这一头独有的句子。

Redoc 的路由走 hash：左栏那些链接由它自己拼成 `#/orders/…`；`operationId` 被小写进地址
（`createOrder` → `createorder`），下面的 href 按浏览器里真的那串写。href 不带路径前缀，
是因为组件里 `basePath` 用的是默认值 `/`（口径记在 `packages/theme-redoc/docs/internals.md`）。

每条都限定在 `.menu-content` 里：正文面板上也有指向同一个接口的锚（标签标题旁那个
「link to orders」），不限定就会命中两处，Playwright 的严格模式直接报错。
*/
const frameDoc = (page: Page): FrameLocator => layerFrameDoc(page, 'redoc');

const menu = (page: Page): Locator =>
  frameDoc(page).locator('.redoc-root .menu-content');

const root = (page: Page): Locator => frameDoc(page).locator('.redoc-root');

const menuHref = (name: string): string => `#/orders/${name}`;

/**
整页加载一条**别人转发过来的接口地址**：`#/orders/createorder` 这段是框里点了接口之后
由 postMessage 送进外层地址栏的。这一条用例钉的是它在静态产物里也打得开，而且是 **HTTP 200**
—— 页面本身是 `build/theme-redoc/docs/redoc-demo/index.html` 那一份，hash 段不参与取文件，托管侧不用认识它。
（换成按路径的路由就是 404，取舍见包 README 的「已知限制」一节。）
*/
Given('我直达 redoc 那条接口的地址', async ({ page }) => {
  watchPageErrors(page);
  const response = await page.goto(
    `${layerDemoUrl('redoc')}#/orders/createorder`,
  );
  expect(response?.status(), '这条地址没被当成真页面来回').toBe(200);
});

// 取的是 `static/openapi-redoc.yaml`（产物里的 `/openapi-redoc.yaml`）：文档标题先证明框里真取到了。
Then('Redoc 在框里接管了这一屏，读的是本站那份 yaml', async ({ page }) => {
  await expect(
    root(page),
    '框里没有 `.redoc-root`：`redoc:` 那一步没命中，或框内那份文档没渲染',
  ).toBeVisible();
  await expect(root(page), '框里左栏没有 API 标题：spec 没取到').toContainText(
    'Redoc 演示 API',
  );
});

// Redoc 按地址里那一段判「当前在哪一格」，认不出时就渲染**它自己那份 404**：
// 左栏、搜索框、样式全在，页面看着完全正常，中间写着 No page at this address，
// 控制台一个字都不报（地址里那一段对不上时就是这么静默，实测过）。所以这一条单独钉。
Then('Redoc 自己的 404 没有出现', async ({ page }) => {
  await expect(
    root(page).locator('.not-found-page'),
    'Redoc 没匹配到当前地址：那一段没送进框里',
  ).toHaveCount(0);
});

// 三个接口挂在 `orders` 分组下面，分组默认折叠（折叠时接口链接不在 DOM 里），先点开。
When('我点开 Redoc 左栏里的 orders 分组', async ({ page }) => {
  await menu(page).locator('a[href="#/orders"]').click();
});

Then('三个接口都在 Redoc 的左栏里', async ({ page }) => {
  for (const name of ['listorders', 'createorder', 'getorder']) {
    await expect(
      menu(page).locator(`a[href="${menuHref(name)}"]`),
      `API 导航里少了「${name}」`,
    ).toBeVisible();
  }
});

When('我点开 Redoc 左栏里的新建订单那条接口', async ({ page }) => {
  await menu(page)
    .locator(`a[href="${menuHref('createorder')}"]`)
    .click();
});

/**
接口详情换到那条接口，**外层**地址栏里那一段也跟着换。

后半句量的就是框内 → 外层那一条 postMessage：框里点一条接口走的是 `history.pushState`，
它不触发 `hashchange`，外层只能听 Redoc 的路由自己报（`redoc-ui.tsx` 里那个 `LocationMirror`）。
这一句红了通常就是那条通道断了，而不是 Redoc 没渲染。

这份四条清单只适用于「先打开这一页再点下去」，整页直达那条用例另有判据（见下）。
*/
Then('Redoc 的详情面板换成那条接口，外层地址也跟着换', async ({ page }) => {
  await expect(
    root(page).locator('h1, h2'),
    '接口详情没渲染出来',
  ).toContainText(['Redoc 演示 API (1.0.0)', 'orders', '列出订单', '新建订单']);
  await expect(page).toHaveURL(
    /\/theme-redoc\/docs\/redoc-demo#\/orders\/createorder$/,
  );
});

/**
地址里那一段指哪条接口，框里的正文区就摆哪条接口。

这一句**不复用**上一条：那一条是「先打开这一页再点下去」的判据，四条标题都在。整页直达时
Redoc 从地址指的那一格往下铺，实测 DOM 里只有「列出订单」「新建订单」这两个 `h2`，
API 标题与分组那两条不在 —— 那是它自己的路由行为，不是本层丢了内容，所以这里按直达那一份
清单钉。
*/
Then('Redoc 框里摆的是地址里那条接口', async ({ page }) => {
  await expect(
    root(page).locator('h1, h2'),
    '框里的正文区没摆出地址里那条接口：那一段没送进框里',
  ).toContainText(['列出订单', '新建订单']);
});

/**
框内那一格：Redoc 的左栏占满**框内那份文档**的整屏（那份文档没有 navbar，上沿就是 0）。

`scrollTop` 那一句钉的是另一半：这一层不给容器定高，容器就不该变成滚动容器。曾经
「定高 + `overflow: hidden`」的那一版里，点接口（以及整页直达那条深链）滚走的是这一格而不是
文档 —— 实测 `scrollTop` 停在 502，左栏整条往上跑出可视区，上方只剩一片底色。现在滚动条长在
框内那份文档上，那一格仍然不该是自己滚的。
*/
Then('Redoc 左栏贴满那一份文档的一屏', async ({ page }) => {
  const box = await menu(page).evaluate((el) => {
    const view = el.ownerDocument.defaultView;
    const rect = el.getBoundingClientRect();
    return {
      gapToTop: Math.round(rect.top),
      gapToViewport: Math.round((view?.innerHeight ?? 0) - rect.bottom),
      rootScrollTop: el.closest('.redoc-root')?.scrollTop ?? -1,
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
  expect(
    box.rootScrollTop,
    'Redoc 那一格自己成了滚动容器（它不该有固定高度）',
  ).toBe(0);
});

/**
这一条量的是「隔离」这件事本身：外层那份文档里**没有任何** Redoc 的痕迹 ——
styled-components 那张运行期注入的 `<style>` 一张都没有（改造前它就在外层 `<head>` 里，
470 来条规则），`.redoc-root` 那一格也不存在，正文文字更不在外层文档里。

框内那一份文档里 Redoc 的样式往哪儿打，本层不再钉：曾经那两条判据（外溢只剩 `:root *`、
圈定没把 Redoc 自己的样式压掉）钉的是运行期圈定的效果，圈定随 iframe 改造一起删了 ——
Redoc 关在自己那份文档里，「不打到站点上」由浏览器给的文档边界负责，理由记在包 `docs/internals.md` 的「样式」一节。
*/
Then('外层文档里没有 Redoc 的痕迹', async ({ page }) => {
  const state = await page.locator('html').evaluate((el) => {
    const doc = el.ownerDocument;
    return {
      styledSheets: [...doc.styleSheets].filter(
        (sheet) =>
          (sheet.ownerNode as Element | null)?.hasAttribute(
            'data-styled-version',
          ) ?? false,
      ).length,
      redocRoot: doc.querySelectorAll('.redoc-root').length,
      hasSpecText: (doc.body.textContent ?? '').includes('Redoc 演示 API'),
    };
  });

  expect(state.styledSheets, '外层文档里出现了 styled-components 那张表').toBe(
    0,
  );
  expect(state.redocRoot, '外层文档里出现了 `.redoc-root` 那一格').toBe(0);
  expect(state.hasSpecText, '外层文档里有 Redoc 渲染出来的文字').toBe(false);
});

/**
这一条量的是**外层**那一份文档：站点自己的壳（navbar 那颗按钮、`<html>` 本身）在命中页与
主页上必须一模一样。改造之后外层根本没有 Redoc 的运行时样式表（上一条钉的就是这个），
所以这一句几乎是显然的 —— 留着是因为它按**值**比，不抄站点该有的值，哪天有人在站点这一侧
重新引一份 Redoc 的样式，它会红。

主页是**整页重新加载**去的。量法与它为什么要等过渡落定，记在 `../helpers.mts` 的 `siteStyles`。
*/

Then('站点自己的那几处样式不被 Redoc 改写', async ({ page }) => {
  const onRedocPage = await siteStyles(page);

  await page.goto('/');
  const onHome = await siteStyles(page);

  expect(
    onRedocPage,
    `redoc 页上的站点样式与主页不一样：${JSON.stringify(onRedocPage)}`,
  ).toEqual(onHome);
});

/**
Redoc 左栏底部那一排图标里有一颗它自己的亮暗切换按钮。本层把暗色表改挂在
`<html data-redoc-mode>`（值由站点的开关送进框内）上之后，点它只会改那份文档的 `<html>` 类名、
页面上没有任何反应 —— 一颗按了没反应的按钮，还跟 navbar 上那颗重复，所以 `redoc-ui.css`
把它收掉了。
这一条钉它确实看不见（元素还在 DOM 里，是 `display: none`，所以判据用可见性而不是数量）。
*/
Then('Redoc 自己那颗亮暗开关不出现', async ({ page }) => {
  await expect(
    root(page).locator('[data-testid="color-mode-switcher"]'),
    'Redoc 自己那颗亮暗切换按钮还看得见',
  ).toBeHidden();
});

/**
左栏底部那一格（`.menu-content` 最后那个 `div`）里并排两样东西：指向 redocly.com 的那条署名，
和「收起侧栏」那颗按钮（`[data-component-name="Sidebar/SidebarActions"]` 那一格）。
`redoc-ui.css` 收的是署名的那个 `span`，不是整格 —— 整格一起收会把收起侧栏那颗带走。
两句钉的是这一刀切得准不准：署名看不见，同一格里那颗按钮还在。
*/
Then('Redoc 那条署名不出现，同一格里的收起侧栏还在', async ({ page }) => {
  await expect(
    menu(page).locator('span:has(a[href^="https://redocly.com/"])'),
    '「API docs by Redocly」那条署名还看得见',
  ).toBeHidden();

  await expect(
    menu(page).locator('[data-component-name="Sidebar/SidebarActions"]'),
    '收署名时把同一格里的「收起侧栏」一起收掉了',
  ).toBeVisible();
});

/**
Redoc 在每个章节标题右边摆一整格操作按钮：「Copy」（把这一节的文档复制成 YAML 给大模型的那一颗）
加一个「More actions」下拉（Open in Claude / ChatGPT 两项在里面）。本层整格收掉 ——
代码块里那几颗「复制到剪贴板」不在这格里面，碰不到（口径与理由见包 `docs/internals.md`
的「收掉的四处 Redoc 自己的东西」一节）。
这一格是 `display: none` 收的，元素仍在 DOM 里，所以判据走可见性；先钉「DOM 里认得出这一格」
再钉「一格都不显眼」，免得选择器哪天匹配不上就静默通过。
*/
Then('章节标题旁那一整格操作按钮不出现', async ({ page }) => {
  const pageActions = root(page).locator('[data-testid="page-actions"]');

  expect(
    await pageActions.count(),
    '框里没有章节标题那一格操作按钮，选择器先失效了',
  ).toBeGreaterThan(0);
  await expect(
    root(page).locator('[data-testid="page-actions"]:visible'),
    '章节标题旁那一整格操作按钮还看得见',
  ).toHaveCount(0);
});

/**
Redoc 那一格「Download OpenAPI description」不出现。

与上面三条不同，这一处**走的是配置**（`redoc-ui.tsx` 里 `options.hideDownloadButtons: true`），
元素根本不在 DOM 里，所以判据按数量。本层没有传 `downloadUrls`，而 `redoc@3.0.1` 会拿它取 spec 的
那个地址自己补一条 —— 关掉之前实测框内右栏第一格就是
`[data-testid="panel-download-openapi-description"]`，里面一条链接指向 `/openapi-redoc.yaml`。

第二句是给第一句当对照：那一格没了之后，右栏第一格换成了 Servers。万一厂商哪天改了 testid，
第一句会静默通过，这一句不会。
*/
Then('Redoc 那份 spec 的下载那一格不出现', async ({ page }) => {
  await expect(
    root(page).locator('[data-testid="panel-download-openapi-description"]'),
    'Redoc 那一格下载还在（`hideDownloadButtons` 不是 true）',
  ).toHaveCount(0);

  await expect(
    root(page).locator('[data-testid^="panel-"]').first(),
    'Redoc 正文的第一格不是 Servers，上一句可能是选择器失效造成的假绿',
  ).toHaveAttribute('data-testid', 'panel-servers');
});

/**
与上一条配对的一句：代码块里那些复制按钮**不该**被一起收掉，所以这里钉它们还在。
认的是 Redoc 给那几颗自己的 `data-testid="copy-button"`（标题那颗没有这个标识）。
*/
Then('Redoc 代码块里的复制按钮还在', async ({ page }) => {
  const visibleCopies = root(page).locator(
    'button[data-testid="copy-button"]:visible',
  );

  expect(
    await visibleCopies.count(),
    '代码块里那几颗复制按钮不见了',
  ).toBeGreaterThan(0);
  await expect(visibleCopies.first()).toBeVisible();
});

/**
## 亮暗模式跟站点走，不跟操作系统走

Redoc 自带一套亮暗模式，判据是**操作系统**的偏好（`matchMedia('(prefers-color-scheme: dark)')`
加它自己那份 localStorage），然后把 `light` / `dark` 写进 `<html>` 的类名 —— 它那 60 来条暗色
规则全挂在 `:root.dark` 开头。站点自己另有一个开关（`<html data-theme>`），两处各切各的就会
打架：实测「站点亮色 + 操作系统深色」时这一页自己变暗，跟站点的开关无关。

本层在运行期把 `:root.dark` 改挂到 `:root[data-redoc-mode="dark"]`（`redoc-color-mode.ts`），
于是站点那个开关成为唯一的驱动。改造之后多出一格：那个开关写在**外层**文档的 `<html>` 上，
而配色在**框内**那份文档里 —— 这一格由共享那条 postMessage 通道接（`packages/theme-iframe/lib/`：
外层（theme-iframe 的 `api-frame.tsx`）送、框内那份工厂（`api-frame-view.tsx`，本包 `theme/RedocPage`
就是它造出的一页）收，收下来往自己 `<html>` 上写那条属性）。
框内那份文档不挂站点的 `ColorModeProvider`，站点那条 `data-theme` 在这里只是加载时内联脚本
写死的一份、没人维护，本层不读它。

「切成暗色」「做个记号」「配色跟着翻、文档没重新加载」这三步两层共用，句子与实现在
`common.steps.mts`；这里只留 Redoc 这一头特有的三句：系统深色时站点仍是亮色、暗色表换挂之后
类名与配色对不上、以及消息落点那条属性本身。量的那一格是**框内那份文档的 `<html>`**：
Redoc 那条 `:root { background-color: var(--bg-color) }` 现在原样落在 `<html>` 上（运行期圈定
删掉之前，这条真属性是被挪进 `.redoc-root` 的，那时量的是那一格）。暗色表换掉的正是
`--bg-color` 那组变量，所以同一个属性跟着翻 —— 这也是为什么这里不能改去量 `.redoc-root`：
那是本层包的一层壳，它自己没有底色。
*/
Then('Redoc 那一格收的是站点这一头的亮色，类名却写着深色', async ({ page }) => {
  // 框内那一格的亮暗由外层送进来（不是它自己读的），所以这一句钉的是那条消息确实到了、
  // 值是站点这一头的亮色。属性名与 `redoc-color-mode.ts` 里的 `COLOR_MODE_ATTRIBUTE` 同值。
  await expect(frameDoc(page).locator('html')).toHaveAttribute(
    'data-redoc-mode',
    'light',
  );
  // Redoc 自己那份按操作系统的判定确实跑过了：框内那份文档的 `<html>` 上带着它写的 `dark` 类。
  // 这一句是给下一条当前提 —— 类名在、配色却是亮的，才说明驱动配色的不是这个类名。
  // （哪天 Redoc 不再往 `<html>` 上写类名了，这一句会红，删掉即可。）
  await expect(frameDoc(page).locator('html')).toHaveClass(/\bdark\b/);
});

Then('Redoc 的配色不跟操作系统走', async ({ page }) => {
  const onDarkSystem = await frameModeSignal(page);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  const onLightSystem = await frameModeSignal(page);

  expect(
    onLightSystem,
    `操作系统的偏好换了，框里那一页的配色跟着换了（${onDarkSystem} → ${onLightSystem}）：` +
      '暗色表还挂在 Redoc 自己那个类名上',
  ).toBe(onDarkSystem);
});

Then('Redoc 那一格也收到站点送进来的暗色', async ({ page }) => {
  // 开关跨过 iframe 的边界：外层那条消息送到了，框内那份文档的 `<html data-redoc-mode>` 也是 dark。
  await expect(frameDoc(page).locator('html')).toHaveAttribute(
    'data-redoc-mode',
    'dark',
  );
});

/**
「站点这一侧不受影响」那一条是在亮色下量的，而改挂之后多出一格亮色碰不到的：站点一进暗色，
Redoc 那 330 条暗色变量连同一条 `color-scheme` 就一起落在**框内那份文档**的 `<html>` 上
（外层那份根本没这些规则）。这里量的还是外层：外层在暗色下的那几处站点属性必须与暗色下的主页
一样。同一批属性（含 `color-scheme`）在两个页面上各算一遍比相等 —— 实测这一页暗色的 `<html>`
是 `background-color: rgb(27, 27, 29)`、`color: rgb(227, 227, 227)`、`color-scheme: dark`，
主页暗色一字不差。
*/
Then('站点自己的那几处样式在暗色下也不被 Redoc 改写', async ({ page }) => {
  const onRedocPage = await siteStyles(page);

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(
    await siteStyles(page),
    `暗色下这一页的站点壳与主页不一样：${JSON.stringify(onRedocPage)}`,
  ).toEqual(onRedocPage);
});

Then('这一页直接渲染 Redoc', async ({ page }) => {
  await expect(page.locator('.redoc-root')).toBeVisible();
  await expect(page.locator('.redoc-root')).toContainText('Redoc 演示 API');
});

/**
地址里缺 `src`（或写成解析不成 http(s) 的东西）时这一格什么都不摆。

钉这一句是因为 Redoc 拿到空地址**不报错**，而是把它自己那份「No page at this address」摆在
正文区 —— 看着像渲染器坏了。这一页是条公开地址，任何人都能直接打开它，所以这一格要按
「什么都不摆」钉死。
*/
Then('Redoc 那一格不出现，它那份 404 也不出现', async ({ page }) => {
  await expect(page.locator('.redoc-root')).toHaveCount(0);
  await expect(page.locator('.not-found-page')).toHaveCount(0);
});
