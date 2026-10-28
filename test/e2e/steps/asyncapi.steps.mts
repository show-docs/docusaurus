import { expect } from '@playwright/test';
import type { FrameLocator, Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { layerFrame, layerFrameDoc, watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

/**
## AsyncAPI 走 `aas3:`、OpenAPI 走 `oas3:`

`aas3:` 给的是**一个地址**，本层不判断它指向的是哪一份文档 —— 判据在渲染器那边（按文档根上
那个 `openapi` / `asyncapi` 字段分派）。这一份 feature 钉的就是这件事：给一份 **AsyncAPI 3.0.0**
文档，`theme-redoc` 与 `theme-scalar` 两层照样在框里把它渲染出来。

两层各有一条示例页（`packages/theme-redoc/docs/redoc-asyncapi-demo.md` 与
`packages/theme-scalar/docs/scalar-asyncapi-demo.md`），各取自己那份夹具
（`static/asyncapi-redoc.yaml` / `static/asyncapi-scalar.yaml`）。与 OpenAPI 那一族同样的形状：
命中页整页交给一个框，渲染器整个跑在框内那份文档里（`/redoc-view` / `/scalar-view`）。

**地址与形状三处都换了**，所以这一份不抄 OpenAPI 那几条句子：

- 框的 `src`：那份 spec 地址从 `/openapi-<层名>.yaml` 换成 `/asyncapi-<层名>.yaml`；
- 框里那份文档：通道 / 操作 / 消息，不是路径 / 操作 / 响应；
- hash 段：Redoc 是 `#/channels/<通道>`（**有**前导斜杠，与 OpenAPI 那一族同形），Scalar 是
  `#channel/<通道>`（**没有**前导斜杠，与它自己那一族同形）。

「这一页没有文档正文外壳」「浏览器里没有运行期错误」那几句与层无关，直接用 `common.steps.mts`
里那一份。

**收掉的那几处不是空话** —— 复用 OpenAPI 那一族那几句之前，先用默认配置各渲染一次那份
AsyncAPI 文档，确认那些东西在 AsyncAPI 那一套里**确实存在**，否则「看不见」是元素本来就没有，
钉了也证明不了 CSS 或配置起了作用。实测（默认配置下）：

- Redoc：`[data-testid="color-mode-switcher"]` 1 个、那条 Redocly 署名 1 个、
  `[data-testid="page-actions"]` 3 个、`Sidebar/SidebarActions` 1 个 —— 都摆着，所以
  `display: none` 那几条在 AsyncAPI 这一页上是真的在压东西；
- Redoc 的下载格是 `[data-testid="panel-download-asyncapi-description"]`（OpenAPI 那一版是
  `panel-download-openapi-description`），所以判据用**前缀**认；
- Scalar：那条 powered-by 署名在左栏底部 1 格（`div:has(> a[href^="https://scalar.com/?utm_source=powered-by"])`），
  下载是 1 颗 `.download-container` + 2 颗 `.download-button`（无障碍标签「下载 AsyncAPI 文档（JSON）」
  与「下载 AsyncAPI 文档（YAML）」）。
*/
type AsyncApiLayer = 'redoc' | 'scalar';

const asyncApiLayers: Record<
  AsyncApiLayer,
  {
    /** 示例页的地址（包 `docs/` 下那一页）。 */
    demoUrl: string;
    /** 夹具在站点根下的地址（`static/` 复制过去的那一份）。 */
    spec: string;
    /** 框内那条路由。 */
    route: string;
    /** 文档标题：钉「框里真取到了那份文档」。 */
    title: string;
    /** 左栏里那条通道的 href。 */
    channelHref: string;
  }
> = {
  redoc: {
    demoUrl: '/theme-redoc/docs/redoc-asyncapi-demo',
    spec: '/asyncapi-redoc.yaml',
    route: '/redoc-view',
    title: 'Redoc 演示事件 API',
    channelHref: '#/channels/ordercreated',
  },
  scalar: {
    demoUrl: '/theme-scalar/docs/scalar-asyncapi-demo',
    spec: '/asyncapi-scalar.yaml',
    route: '/scalar-view',
    title: 'Scalar 演示事件 API',
    channelHref: '#channel/ordercreated',
  },
};

/** 框内那份文档的框（按层名认，与 `../helpers.mts` 里那几条同一条口径）。 */
const frameDoc = (page: Page, layer: AsyncApiLayer): FrameLocator =>
  layerFrameDoc(page, layer);

/** Redoc 那一层的布局根；Scalar 那一层认的是厂商自己那两格类名。 */
const redocRoot = (page: Page): Locator =>
  frameDoc(page, 'redoc').locator('.redoc-root');

const redocMenu = (page: Page): Locator =>
  redocRoot(page).locator('.menu-content');

const scalarRoot = (page: Page): Locator =>
  frameDoc(page, 'scalar').locator('.scalar-app.scalar-api-reference');

const scalarMenu = (page: Page): Locator => scalarRoot(page).locator('aside');

Given('我打开 redoc 的 AsyncAPI 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto(asyncApiLayers.redoc.demoUrl);
});

Given('我打开 scalar 的 AsyncAPI 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto(asyncApiLayers.scalar.demoUrl);
});

/**
命中页放的就那一个 iframe，`src` 指向本包那条插件路由，参数里带的是**那份 AsyncAPI 文档**的
地址（编码成 `src` 参数）。与 OpenAPI 那一族同形，只是地址换了那份夹具。
*/
Then(
  '这一页放的是一个 iframe，指向 redoc 那条 AsyncAPI 页面',
  async ({ page }) => {
    const frame = layerFrame(page, 'redoc');
    await expect(frame, '命中页没有那一个 iframe').toHaveCount(1);
    await expect(frame).toHaveAttribute(
      'src',
      `${asyncApiLayers.redoc.route}?src=${encodeURIComponent(asyncApiLayers.redoc.spec)}`,
    );
  },
);

Then(
  '这一页放的是一个 iframe，指向 scalar 那条 AsyncAPI 页面',
  async ({ page }) => {
    const frame = layerFrame(page, 'scalar');
    await expect(frame, '命中页没有那一个 iframe').toHaveCount(1);
    await expect(frame).toHaveAttribute(
      'src',
      `${asyncApiLayers.scalar.route}?src=${encodeURIComponent(asyncApiLayers.scalar.spec)}`,
    );
  },
);

/**
框里真的把那份 AsyncAPI 文档渲染出来了：布局根在（`redoc:` / `scalar:` 那一步没命中，或框内那份
文档没渲染），且文档标题摆在正文里（spec 没取到）。

标题是**夹具里那个 `info.title`**：Redoc 那一版摆在概览那一格里，Scalar 那一版摆在左栏那颗
`h1` 上（与 OpenAPI 那一族的判据同一条路，认的仍是标题本身而不是某一颗具体的标签）。
*/
Then('Redoc 在框里渲染的是那份 AsyncAPI 文档', async ({ page }) => {
  await expect(
    redocRoot(page),
    '框里没有 `.redoc-root`：`redoc:` 那一步没命中，或框内那份文档没渲染',
  ).toBeVisible();
  await expect(
    redocRoot(page),
    '框里没有那份文档的标题：spec 没取到',
  ).toContainText(asyncApiLayers.redoc.title);
});

Then('Scalar 在框里渲染的是那份 AsyncAPI 文档', async ({ page }) => {
  await expect(
    scalarRoot(page),
    '框里没有 Scalar 的根格：`scalar:` 那一步没命中，或框内那份文档没渲染',
  ).toBeVisible();
  await expect(
    scalarRoot(page).locator('h1'),
    '框里左栏没有那份文档的标题：spec 没取到',
  ).toContainText(asyncApiLayers.scalar.title);
});

/**
左栏里那条通道在（AsyncAPI 那一套是「通道 / 操作 / 消息」，不是 OpenAPI 的「标签 / 方法 /
路径」）：Redoc 那一版是 `#/channels/<通道>`（**有**前导斜杠），Scalar 那一版是 `#channel/<通道>`
（**没有**前导斜杠 —— 与 Scalar 自己那一族同形，写错就是静默失灵）。

顺带钉住一件事：**同一条通道在两层里是同一个东西** —— 那一页的左栏里除了它再没有别的通道，
所以「按 href 找到的那一条」钉的就是夹具里那条 `orderCreated`。
*/
Then('Redoc 左栏里摆的是那条通道', async ({ page }) => {
  await expect(
    redocMenu(page).locator(`a[href="${asyncApiLayers.redoc.channelHref}"]`),
    'Redoc 左栏里没有那条通道',
  ).toBeVisible();
});

Then('Scalar 左栏里摆的是那条通道', async ({ page }) => {
  await expect(
    scalarMenu(page).locator(`a[href="${asyncApiLayers.scalar.channelHref}"]`),
    'Scalar 左栏里没有那条通道',
  ).toBeVisible();
});

/**
正文最前面那一格下载不出现。

这一格在 **AsyncAPI 那一套里同样存在** —— 用默认配置各渲染一次那份 AsyncAPI 文档，实测：
Redoc 那一版摆在正文第一格，testid 是 `panel-download-asyncapi-description`、标题是
「Download AsyncAPI description」（OpenAPI 那一版是 `panel-download-openapi-description`、
「Download OpenAPI description」）；Scalar 那一版是「下载 AsyncAPI 文档」，JSON 与 YAML 各一颗
（`.download-container` + 两颗 `.download-button`，无障碍标签「下载 AsyncAPI 文档（JSON）」与
「下载 AsyncAPI 文档（YAML）」）。所以本层那两条配置（Redoc 的 `hideDownloadButtons`、
Scalar 的 `documentDownloadType: 'none'`）对 AsyncAPI 文档**同样生效** —— 这一句钉的就是这一格。

两层的收法不同，判据也不同：

- Redoc：走配置，整格不生成，所以按**数量**判（testid 用**前缀**认，两种文档类型都收得住）；
  顺带钉正文第一格换成了 Servers（万一厂商哪天改了那个 testid，第一句会静默通过，这一句不会）；
- Scalar：走配置，那两颗按钮整格不生成，所以按**数量**判；无障碍标签按中英文两种都收
  （这一层把界面切成简体中文，那颗按钮的标签是「下载 AsyncAPI 文档（JSON）」）。
*/
Then('Redoc 那一格下载不出现', async ({ page }) => {
  await expect(
    redocRoot(page).locator('[data-testid^="panel-download"]'),
    'Redoc 正文最前面那一格下载还在（`hideDownloadButtons` 不是 true）',
  ).toHaveCount(0);

  await expect(
    redocRoot(page).locator('[data-testid^="panel-"]').first(),
    'Redoc 正文的第一格不是 Servers，上一句可能是选择器失效造成的假绿',
  ).toHaveAttribute('data-testid', 'panel-servers');
});

Then('Scalar 那一格下载不出现', async ({ page }) => {
  await expect(
    frameDoc(page, 'scalar').locator('.download-container, .download-button'),
    '框里出现了 Scalar 那一格下载（`documentDownloadType` 不是 none）',
  ).toHaveCount(0);

  await expect(
    frameDoc(page, 'scalar').locator(
      '[aria-label*="下载"], [aria-label*="Download"]',
    ),
    '框里还剩一颗按无障碍标签认得出的下载按钮',
  ).toHaveCount(0);
});

When('我点开 Redoc 左栏里的那条通道', async ({ page }) => {
  await redocMenu(page)
    .locator(`a[href="${asyncApiLayers.redoc.channelHref}"]`)
    .click();
});

When('我点开 Scalar 左栏里的那条通道', async ({ page }) => {
  await scalarMenu(page)
    .locator(`a[href="${asyncApiLayers.scalar.channelHref}"]`)
    .click();
});

/**
框内换了通道，**外层**地址栏里那一段也跟着换 —— 量的就是框内 → 外层那一条 postMessage。

Redoc 那一层是它自己的路由（`react-router`）报的，Scalar 那一层是配置里那个 `onSidebarClick`
报的（`scalar-ui.tsx`）。两串形状各按各的写：Redoc 的**有**前导斜杠、Scalar 的**没有**
（与 OpenAPI 那一族同一个规矩）。
*/
Then('Redoc 的详情面板换成那条通道，外层地址也跟着换', async ({ page }) => {
  const channelHeading = redocRoot(page).locator('h2', { hasText: '订单创建' });
  await expect(channelHeading, '通道详情没渲染出来').toBeVisible();
  await expect(channelHeading).toContainText('订单创建');
  await expect(page).toHaveURL(
    /\/theme-redoc\/docs\/redoc-asyncapi-demo#\/channels\/ordercreated$/,
  );
});

Then('Scalar 的详情面板换成那条通道，外层地址也跟着换', async ({ page }) => {
  const channelHeading = scalarRoot(page).locator('h2', {
    hasText: '订单创建',
  });
  await expect(channelHeading, '通道详情没渲染出来').toBeVisible();
  await expect(channelHeading).toContainText('订单创建');
  await expect(page).toHaveURL(
    /\/theme-scalar\/docs\/scalar-asyncapi-demo#channel\/ordercreated$/,
  );
});
