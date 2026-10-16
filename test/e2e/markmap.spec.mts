import { expect, test } from '@playwright/test';

import { watchPageErrors } from './helpers.mts';

test('theme-markmap：命中页的导图渲染在正文上方，原文照常', async ({
  page,
}) => {
  const errors = watchPageErrors(page);

  await page.goto('/markmap-demo');

  const mind = page.locator('svg.markmap');
  await expect(mind, 'frontmatter 的 markmap: true 没换出导图').toBeVisible();
  // 只建好 SVG 不算工作：节点画出来了才算。
  await expect(
    mind.locator('g.markmap-node').first(),
    '导图里没有节点',
  ).toBeVisible();
  await expect(page.locator('.mm-toolbar')).toBeVisible();

  // 「导图在上」是这一层的行为口径，位置要真的在正文之上。
  const [mindBox, headingBox] = [
    await mind.boundingBox(),
    await page.locator('article h1').boundingBox(),
  ];
  expect(mindBox, '导图 SVG 没有落位').not.toBeNull();
  expect(headingBox, '正文标题没渲染').not.toBeNull();
  expect(mindBox!.y + mindBox!.height).toBeLessThanOrEqual(headingBox!.y);

  // 原文没被吃掉：正文照常（这一层是「前一个兄弟节点」，不是替换）。
  // 范围收到 `article`：导图的 foreignObject 里也有同一句话的文字，整页找会撞上两个。
  await expect(
    page.locator('article').getByText('本文件的 frontmatter 写了'),
    '原文段落不见了',
  ).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
