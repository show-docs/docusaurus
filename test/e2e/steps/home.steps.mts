import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

// 卡片由 `@theme/DocCardList` 按侧边栏自动给，所以这里钉的是「每张卡真能点进对应那一格」，
// 不钉清单本身（清单口径的产地在 `sidebars.mts` 与 test/plugin.test.mts）。
// 一格的顶层页就是那个包自己的 `README.md`，所以这些地址等于仓库里的目录路径。
const packageHrefs = [
  '/plugins/plugin-prev-layer-resolver/',
  '/theme/theme-copy-button/',
  '/theme/theme-diff/',
  '/theme/theme-erd/',
  '/theme/theme-iframe/',
  '/theme/theme-markmap/',
  '/theme/theme-redoc/',
  '/theme/theme-scalar/',
  '/theme/theme-stoplight/',
  '/theme/theme-viewer/',
];

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
  '链里有十张卡片，一格一个包：解析器插件那一份加九个主题包各自的顶层页',
  async ({ page }) => {
    for (const href of packageHrefs) {
      await expect(
        cardChain(page).locator(`a.theme-doc-card-container[href="${href}"]`),
        `主页该有一张指向 ${href} 的卡片`,
      ).toBeVisible();
    }
  },
);

// 卡片上那行说明取自本包 package.json 的 `description`（`sidebars.mts` 读的就是这一格）。
// 这句话改了那个包的 description 就要跟着改，两处是同一件事的两个写法，不是两份独立的判据。
Then('卡片上那行说明取自本包 package.json 的 description', async ({ page }) => {
  await expect(
    page.getByText(
      'Md 的 frontmatter 写 oas3: <URL> 时把该页正文换成 Stoplight Elements 渲染的 OpenAPI 文档',
    ),
  ).toBeVisible();
});

// 点的是卡片本身：`getByRole('link', …)` 在同屏上会有三处命中（侧边栏、卡片、正文里的链接），
// Playwright 的严格模式因此直接报错。
When('我点开指向 theme-markmap 那一格的卡片', async ({ page }) => {
  await page
    .locator('a.theme-doc-card-container[href="/theme/theme-markmap/"]')
    .click();
});

Then(
  '我落在 theme-markmap 的顶层页上，那一页就是这个包的 README',
  async ({ page }) => {
    await expect(page).toHaveURL(/\/theme\/theme-markmap\/$/);
    // README 的第一个一级标题就是包名：这一页的正文确实是那份文件，不是空的索引格。
    await expect(
      page.locator('article h1').first(),
      '顶层页的正文应是本包 README 的第一个标题',
    ).toHaveText('@show-docs/docusaurus-theme-markmap');
  },
);
