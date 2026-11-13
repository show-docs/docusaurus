import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Then } = createBdd();

// 「这一页没有主题包裹标记」那句是共用的（见 common.steps.mts）：那条四层链只该在解析器包
// 那份示例页上出现，别处一个标记都不该有。

// 只建好 SVG 不算工作：节点画出来了才算。1.x 的节点组没有类名，认 `data-key="node:<id>"`；
// `data-node-id` 边上那条连线组也有，不能拿它当节点。
Then('导图已经画出来，节点和工具条都在', async ({ page }) => {
  const mind = page.locator('svg.markmap');
  await expect(mind, 'frontmatter 的 markmap 没换出导图').toBeVisible();
  await expect(
    mind.locator('g[data-key^="node:"]').first(),
    '导图里没有节点',
  ).toBeVisible();
  await expect(page.locator('.markmap-toolbar')).toBeVisible();
});

// 1.x 的工具条只有缩放 / 适配 / 展开与折叠层级，没有「切换暗色」那一颗 —— 配色由站点的
// useColorMode 经 colorScheme 选项驱动，不留给工具条一个会打架的开关。
Then('工具条里没有暗色按钮', async ({ page }) => {
  const bar = page.locator('.markmap-toolbar');

  await expect(bar.locator('button').first()).toBeVisible();
  await expect(bar.locator('button[aria-label*="dark" i]')).toHaveCount(0);
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
// 范围收到 `article`：导图里也有同一句话的文字，整页找会撞上两个。
Then('原文那几行照常在场', async ({ page }) => {
  await expect(
    page.locator('article').getByText('本文件的 frontmatter 写了'),
    '原文段落不见了',
  ).toBeVisible();
});

// 链接的新标签页由 1.x 的渲染器补（`<a href=… target="_blank">`），本层不再改 mdast。
Then('导图里的链接开新标签', async ({ page }) => {
  const links = page.locator('svg.markmap a[target="_blank"]');

  await expect(links, '导图里没有带动新标签页的链接').toHaveCount(1);
  await expect(links.first()).toHaveAttribute('href', /example\.com/u);
});

/**
配色由站点的开关驱动：`colorScheme` 选项跟着 `useColorMode()`，令牌是 `--mm-*`。
工具条不再有暗色按钮，所以这里只量导图自己的令牌在切暗色后真的翻了。
*/
Then('导图的配色跟着站点的开关走', async ({ page }) => {
  const mind = page.locator('svg.markmap');
  const read = (): Promise<string> =>
    mind.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.getPropertyValue('--mm-bg').trim()}|${style.getPropertyValue('--mm-text').trim()}`;
    });

  // 令牌已经落地（不是两个空串）才谈得上「翻没翻」。
  await expect.poll(read).not.toBe('|');
  const light = await read();

  await page
    .locator('.navbar button.clean-btn:not(.navbar__toggle)')
    .first()
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(read).not.toBe(light);
});
