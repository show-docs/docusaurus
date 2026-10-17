import { expect, test } from '@playwright/test';

import { watchPageErrors } from './helpers.mts';

test('主页：卡片列表通向每个主题的示例页', async ({ page }) => {
  const errors = watchPageErrors(page);

  await page.goto('/');

  // demo 那三层主题（theme-a/b/c）各自把上一层的 DocCardList 包起来，标记是一层套一层的
  // div，最里面才是官方那张卡片列表。站点只有这一页写 `<DocCardList />`，所以这条链
  // 只该在主页出现 —— 它在浏览器里真嵌套，才说明「链式覆盖」不只是产物里的字符串。
  const cardChain = page.locator(
    'div[data-theme-wrapper="theme-c"]' +
      ' > div[data-theme-wrapper="theme-b"]' +
      ' > div[data-theme-wrapper="theme-a"]',
  );
  await expect(cardChain, '卡片列表没被套进三层主题的链里').toHaveCount(1);
  await expect(
    cardChain.locator('a.theme-doc-card-container').first(),
    '链的最里面没有卡片',
  ).toBeVisible();

  // 卡片由 `@theme/DocCardList` 按侧边栏自动给，所以这里钉的是「每张卡真能点进对应页」，
  // 不钉清单本身（清单口径的产地在 docs/intro.md 与 test/plugin.test.mts）。
  for (const href of ['/markmap-demo', '/iframe-demo', '/stoplight-demo']) {
    await expect(
      cardChain.locator(`a.theme-doc-card-container[href="${href}"]`),
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
