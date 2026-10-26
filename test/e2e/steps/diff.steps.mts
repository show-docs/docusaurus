import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

/**
本层那一格：组件把说明行与视图一起套在自己这个节点里，所以「有没有这一格」与
「这一格里有什么」都从它往下问，不跟正文里恰好写了什么文件名争。
视图内部只按厂商样式表里给出的名字认（`.diff-tailwindcss-wrapper` 与那两种 `data-state`）。
*/
const diffBlock = (page: Page): Locator => page.locator('[data-diff-view]');

const diffView = (page: Page): Locator =>
  diffBlock(page).locator('.diff-tailwindcss-wrapper');

// 差异视图是 `DocItem` 的前一个兄弟节点，正文外壳从它下面才开始。这一格连同它自己
// 那份按需加载的渲染代码都在懒 chunk 里，所以先等它出现，再比两者的位置。
Then('差异视图落在正文上方', async ({ page }) => {
  const view = diffView(page);

  await expect(view, '示例页没渲染出差异视图').toBeVisible();

  const [viewBox, articleBox] = [
    await diffBlock(page).boundingBox(),
    await page.locator('article').boundingBox(),
  ];

  expect(viewBox, '差异视图没落位').not.toBeNull();
  expect(articleBox, '正文外壳没渲染').not.toBeNull();
  expect(viewBox!.y + viewBox!.height).toBeLessThanOrEqual(articleBox!.y);
});

// 比的是哪两份内容由说明行给出；这里只认那份文件名，不断言具体改了哪几行 ——
// 右边是磁盘上此刻这一份，这一页改一行、或下一笔动到它的提交都会变，钉住它等于给仓库钉一个会自己过期的期望。
Then('视图上写明对比的是哪一份文件，改动行与段落都在', async ({ page }) => {
  await expect(
    diffBlock(page).locator('code'),
    '说明行没写明对比的是哪一份文件',
  ).toHaveText('packages/README.md');
  await expect(
    diffView(page).locator('[data-state="diff"]'),
    '差异视图里没有改动行',
  ).not.toHaveCount(0);
  await expect(
    diffView(page).locator('[data-state="hunk"]'),
    '差异视图里没有段落分隔',
  ).not.toHaveCount(0);
});

Then('正文那一格照常渲染在这一页', async ({ page }) => {
  await expect(
    page.locator('article .theme-doc-markdown'),
    '命中页的正文没照常渲染',
  ).toContainText('差异视图示例');
});

Then('差异视图换成暗色配色', async ({ page }) => {
  // 组件把站点的亮暗值原样交给厂商那份视图，配色由它根节点上 `data-theme` 那个值决定
  await expect(diffView(page)).toHaveAttribute('data-theme', 'dark');
});

Then('这一页没有差异视图', async ({ page }) => {
  await expect(diffBlock(page), '没写 diff 的页面被加了这一格').toHaveCount(0);
});

/**
## 另一种来源：`diff: {old: 旧, new: 新}` 比的是磁盘上那两份文件

这一块与上面那几行判的是同一格视图，只差**说明行**与**正文**里的字：来源不再是「这份文件的
上一个版本与此刻这一份」，而是那两份文件本身，所以说明行给的是两个名字，正文也不该跟着少一行。
这一页在仓库里，但那条来源根本不读 git 历史 —— 用例因此不能靠「换个提交就变红」来钉，
钉的是那两个键点名的两份（`old → new`）与它们之间确实有的改动行。
*/
Given('我打开两份文件对照示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/packages/theme-diff/docs/diff-pair-demo');
});

Then('说明行写明比的是哪两份文件', async ({ page }) => {
  await expect(
    diffBlock(page).locator('code'),
    '说明行没写明比的是哪两份文件',
  ).toHaveText(
    '../../../static/openapi-redoc.yaml → ../../../static/openapi-scalar.yaml',
  );
});

Then('对照这一页的视图里列出改动的行', async ({ page }) => {
  await expect(
    diffView(page).locator('[data-state="diff"]'),
    '两份文件对照的视图里没有改动行',
  ).not.toHaveCount(0);
});

Then('对照这一页的正文照常渲染', async ({ page }) => {
  await expect(
    page.locator('article .theme-doc-markdown'),
    '对照页的正文没照常渲染',
  ).toContainText('两份文件对照示例');
});
