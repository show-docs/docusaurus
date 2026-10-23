import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { When, Then } = createBdd();

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

// 页签 = `@dbml/core` 那四个固定格式 + 站点在 `docusaurus.config.mjs` 里配的那一条模板页；
// 这一格由 loader 生成 `<Tabs>` / `<TabItem>`，不是平铺的代码块。
Then('导出区有固定四个格式加站点那一条模板页', async ({ page }) => {
  const labels = ['DBML', 'MySQL', 'PostgreSQL', 'JSON', '表清单'];

  await expect(page.getByRole('tab')).toHaveCount(labels.length);

  for (const label of labels) {
    await expect(
      page.getByRole('tab', { name: label, exact: true }),
      `导出区里没有「${label}」页签`,
    ).toBeVisible();
  }
});

When('我点开「表清单」那一页签', async ({ page }) => {
  await page.getByRole('tab', { name: '表清单' }).click();
});

// 面板里那两行是站点自己那份 `erd/table-names.mjs` 算出来的，本包不参与内容。
Then('面板里是站点那份生成器落出来的表清单', async ({ page }) => {
  await expect(
    page.locator('[role="tabpanel"]:visible'),
    '「表清单」页签里不是站点那份生成器的产出',
  ).toContainText('users：4 列');
});

/**
这一层不藏标题：`.dbml` 页的 `<h1>` 与别的文档页同一个来源 —— 文件头上那份 `title:`。
loader 曾经往产物里多写一段 `hide_title: true`，把这一格按掉了（现在没有那一段了）。
*/
Then('那一页的标题照常渲染成页头的 h1', async ({ page }) => {
  await expect(page.locator('article h1').first()).toHaveText(
    '数据库关系图示例',
  );
});
