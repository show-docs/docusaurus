import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

// 卡片由 `@theme/DocCardList` 按侧边栏自动给，所以这里钉的是「每张卡真能点进对应页」，
// 不钉清单本身（清单口径的产地在 docs/intro.md 与 test/plugin.test.mts）。
const demoHrefs = ['/markmap-demo', '/iframe-demo', '/stoplight-demo'];

/**
主页正文里那条链：站点层加 demo 那三层主题，从外到内 `src/theme > theme-c > theme-b > theme-a`，
最里面才是官方那张卡片列表。选择器按「直接子元素」串起来，所以嵌套关系本身是被验的一环。
*/
const cardChain = (page: Page): Locator =>
  page.locator(
    'div[data-site-wrapper="src/theme"] >' +
      ' div[data-theme-wrapper="theme-c"] >' +
      ' div[data-theme-wrapper="theme-b"] >' +
      ' div[data-theme-wrapper="theme-a"]',
  );

Given('我打开主页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/');
});

Then('卡片列表被套进四层主题的链里', async ({ page }) => {
  const chain = cardChain(page);
  await expect(chain, '卡片列表没被套进四层主题的链里').toHaveCount(1);
  await expect(
    chain.locator('a.theme-doc-card-container').first(),
    '链的最里面没有卡片',
  ).toBeVisible();
});

Then(
  '链里有三张分别指向 markmap、iframe、stoplight 示例页的卡片',
  async ({ page }) => {
    for (const href of demoHrefs) {
      await expect(
        cardChain(page).locator(`a.theme-doc-card-container[href="${href}"]`),
        `主页该有一张指向 ${href} 的卡片`,
      ).toBeVisible();
    }
  },
);

// 卡片那行说明取自各页 frontmatter 的 `description:`
Then(
  '卡片上那行说明取自示例页 frontmatter 的 description',
  async ({ page }) => {
    await expect(
      page.getByText('frontmatter 写 oas3: <URL>，整页交给 OpenAPI 渲染器。'),
    ).toBeVisible();
  },
);

// 点的是卡片本身：`getByRole('link', …)` 在同屏上会有三处命中（侧边栏、卡片、正文里的链接），
// Playwright 的严格模式因此直接报错。
When('我点开指向 markmap 示例页的那张卡片', async ({ page }) => {
  await page
    .locator('a.theme-doc-card-container[href="/markmap-demo"]')
    .click();
});

Then('我落在 markmap 示例页上', async ({ page }) => {
  await expect(page).toHaveURL(/\/markmap-demo$/);
});
