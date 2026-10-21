import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

Given('我打开 ERD 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/erd-demo');
});

// 关系图画在浏览器里：`erdiagram` 把项目、枚举、表与图例都变成 X6 节点，
// `ref` 变成边。表节点落在虚拟渲染的视口之外时 DOM 里根本不会有它，
// 所以这四句同时钉住「图画出来了」与「缩放后全部表都在画布里」。
Then('关系图里表、枚举与连线都在', async ({ page }) => {
  const nodes = page.locator('.x6-node');

  for (const name of ['erd_demo', 'order_status', 'users', 'orders']) {
    await expect(
      nodes.filter({ hasText: name }).first(),
      `关系图里没有 ${name} 这个节点`,
    ).toBeVisible();
  }

  await expect(
    page.locator('.x6-edge'),
    '关系图里没有 users → orders 的连线',
  ).toHaveCount(1);
});

// 关系图是 `DocItem` 的前一个兄弟节点，正文外壳从它下面才开始。
Then('关系图落在正文上方', async ({ page }) => {
  const [chartBox, articleBox] = [
    await page.locator('.x6-graph').boundingBox(),
    await page.locator('article').boundingBox(),
  ];

  expect(chartBox, '关系图没有落位').not.toBeNull();
  expect(articleBox, '正文外壳没渲染').not.toBeNull();
  expect(chartBox!.y + chartBox!.height).toBeLessThanOrEqual(articleBox!.y);
});

// 六个导出块由 loader 生成 `<Tabs>` / `<TabItem>`，不是六个平铺的代码块。
Then('导出区有六个页签', async ({ page }) => {
  const labels = [
    'DBML',
    'MySQL',
    'PostgreSQL',
    'JSON',
    'JSON Schema',
    'Spring Data JPA',
  ];

  await expect(page.getByRole('tab')).toHaveCount(labels.length);

  for (const label of labels) {
    await expect(
      page.getByRole('tab', { name: label, exact: true }),
      `导出区里没有「${label}」页签`,
    ).toBeVisible();
  }
});

When('我点开 Spring Data JPA 那一页签', async ({ page }) => {
  await page.getByRole('tab', { name: 'Spring Data JPA' }).click();
});

Then('面板里是生成的 Java 代码', async ({ page }) => {
  await expect(
    page.locator('[role="tabpanel"]:visible'),
    'Spring Data JPA 页签里不是生成的实体类',
  ).toContainText('@Entity');
});
