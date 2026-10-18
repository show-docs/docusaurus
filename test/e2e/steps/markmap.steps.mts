import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

Given('我打开 markmap 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/markmap-demo');
});

// 那条四层链只属于主页：站点里只有 `docs/intro.md` 写了 `<DocCardList />`。
// 「只在 intro 页」在浏览器里也要成立，不只在看构建产物。
Then('这一页不渲染卡片列表，整页没有主题包裹标记', async ({ page }) => {
  await expect(
    page.locator('[data-site-wrapper], [data-theme-wrapper]'),
    '文档页上冒出了主题包裹标记',
  ).toHaveCount(0);
});

// 只建好 SVG 不算工作：节点画出来了才算。
Then('导图已经画出来，节点和工具条都在', async ({ page }) => {
  const mind = page.locator('svg.markmap');
  await expect(mind, 'frontmatter 的 markmap: true 没换出导图').toBeVisible();
  await expect(
    mind.locator('g.markmap-node').first(),
    '导图里没有节点',
  ).toBeVisible();
  await expect(page.locator('.mm-toolbar')).toBeVisible();
});

// 「导图在上」是这一层的行为口径，位置要真的在正文之上。
Then('导图落在正文标题的上方', async ({ page }) => {
  const [mindBox, headingBox] = [
    await page.locator('svg.markmap').boundingBox(),
    await page.locator('article h1').boundingBox(),
  ];
  expect(mindBox, '导图 SVG 没有落位').not.toBeNull();
  expect(headingBox, '正文标题没渲染').not.toBeNull();
  expect(mindBox!.y + mindBox!.height).toBeLessThanOrEqual(headingBox!.y);
});

// 原文没被吃掉（这一层是「前一个兄弟节点」，不是替换）。
// 范围收到 `article`：导图的 foreignObject 里也有同一句话的文字，整页找会撞上两个。
Then('原文那几行照常在场', async ({ page }) => {
  await expect(
    page.locator('article').getByText('本文件的 frontmatter 写了'),
    '原文段落不见了',
  ).toBeVisible();
});
