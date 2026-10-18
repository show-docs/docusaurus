import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

const operationIds = ['listOrders', 'createOrder', 'getOrder'];

/** Stoplight 渲染器的根，也是它那份样式的作用范围。 */
const root = (page: Page): Locator => page.locator('.stoplight-root');

Given('我打开 stoplight 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/stoplight-demo');
});

// 取的是 `static/openapi.yaml`（产物里的 `/openapi.yaml`）：文档标题先证明它真取到了。
Then('OpenAPI 渲染器接管了这一页，读的是本站那份 yaml', async ({ page }) => {
  await expect(
    root(page),
    '`.stoplight-root` 没出现：`oas3:` 那一步没命中或浏览器端没渲染',
  ).toBeVisible();
  await expect(root(page).locator('h1')).toContainText('主题覆盖演示 API');
});

// 三个接口在左栏 `orders` 分组下面，而这一组**默认折叠**（折叠时链接根本不在 DOM 里），
// 所以先点开它，再逐个确认。
When('我展开左栏的 orders 分组', async ({ page }) => {
  await root(page)
    .locator('div.sl-cursor-pointer')
    .filter({ hasText: /^orders$/ })
    .click();
});

Then('三个接口都在导航里', async ({ page }) => {
  for (const operationId of operationIds) {
    await expect(
      root(page).locator(`a[href="#/operations/${operationId}"]`),
      `API 导航里少了「${operationId}」`,
    ).toBeVisible();
  }
});

When('我点开新建订单那条接口', async ({ page }) => {
  await root(page).locator('a[href="#/operations/createOrder"]').click();
});

// hash 路由跳过去，详情面板的标题（`h1`）换成这条接口的 summary ——
// 到这一步才算真的渲染了文档内容，光有导航链接不能证明。概览页上这个 `h1` 是 API 标题，
// 所以这里是对同一个元素换了内容。
Then('地址跳到那条接口，标题换成它的名字', async ({ page }) => {
  await expect(page).toHaveURL(/#\/operations\/createOrder$/);
  await expect(root(page).locator('h1'), '接口详情没渲染出来').toContainText(
    '新建订单',
  );
});

// 圈样式这一格：`@stoplight/elements` 的表是全局选择器，入口的 postcss 那一步把每条
// 都放进 `.stoplight-root`。判据直接问浏览器里的样式表：凡是提到 `.sl-` 的选择器都必须
// 带着这个前缀。
// DOM 元素从外面递进来（取的是 `el.ownerDocument`，不写裸的 `document`）：`evaluate` 的回调
// 是在浏览器里跑的独立函数，闭不到 Node 侧的名字 —— 漏了就是一处只在浏览器里炸的引用。
Then('Stoplight 的样式都圈在自己的容器里', async ({ page }) => {
  const leaked = await page.locator('html').evaluate((el) => {
    const bad: string[] = [];

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
          bad.push(selector);
        }
      }
    };

    for (const sheet of el.ownerDocument.styleSheets) {
      try {
        if (sheet.cssRules) {
          walk(sheet.cssRules);
        }
      } catch {
        // 跨源样式表读不到规则，跳过（本仓没有这种表）。
      }
    }

    return bad;
  });

  expect(
    leaked.slice(0, 5),
    `这些 .sl- 选择器没被圈进 .stoplight-root：${leaked.slice(0, 5).join('、')}`,
  ).toEqual([]);
});
