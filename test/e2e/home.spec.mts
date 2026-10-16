import { expect, test } from '@playwright/test';

import { watchPageErrors } from './helpers.mts';

test('主页：卡片列表通向每个主题的示例页', async ({ page }) => {
  const errors = watchPageErrors(page);

  await page.goto('/');

  // 卡片由 `@theme/DocCardList` 按侧边栏自动给，所以这里钉的是「每张卡真能点进对应页」，
  // 不钉清单本身（清单口径的产地在 docs/intro.md 与 test/plugin.test.mts）。
  for (const href of ['/markmap-demo', '/iframe-demo', '/stoplight-demo']) {
    await expect(
      page.locator(`a.theme-doc-card-container[href="${href}"]`),
      `主页该有一张指向 ${href} 的卡片`,
    ).toBeVisible();
  }

  // 卡片那行说明取自各页 frontmatter 的 `description:`
  await expect(
    page.getByText('frontmatter 写 oas3: <URL>，整页交给 OpenAPI 渲染器。'),
  ).toBeVisible();

  // 点一张卡真的到得了那一页。点的是卡片本身：`getByRole('link', …)` 在同屏上会有三处
  // 命中（侧边栏、卡片、正文里的链接），Playwright 的严格模式因此直接报错。
  await page
    .locator('a.theme-doc-card-container[href="/markmap-demo"]')
    .click();
  await expect(page).toHaveURL(/\/markmap-demo$/);

  expect(errors, errors.join('\n')).toEqual([]);
});
