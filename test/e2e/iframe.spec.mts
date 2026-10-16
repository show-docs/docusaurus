import { expect, test } from '@playwright/test';

import { watchPageErrors } from './helpers.mts';

test('theme-iframe：命中页把正文区换成目标页面', async ({ page }) => {
  const errors = watchPageErrors(page);

  await page.goto('/iframe-demo');

  const frame = page.locator('iframe');
  await expect(
    frame,
    'iframe 没出现 —— 这一层只在构建产物里嵌（开发模式给的是链接）',
  ).toBeVisible();

  // `iframe: /markmap-demo` 的值以 `/` 开头，按站点 origin 补成绝对地址。
  // 读的是 DOM 的 `src` **属性**（浏览器给的绝对形式）：HTML 里写的那一格构建期是
  // frontmatter 的原值、激活后才是补完的地址，跟着时序飘。
  const src = await frame.evaluate((el: HTMLIFrameElement) => el.src);
  expect(new URL(src).pathname).toBe('/markmap-demo');
  expect(new URL(src).origin).toBe(new URL(page.url()).origin);

  // 嵌进来的那页自己也是命中页：它的内容要真的在 frame 里渲染出来，
  // 只证明「有个 iframe」证明不了目标页可达。
  const inner = frame.contentFrame();
  await expect(
    inner.locator('article h1'),
    '被嵌页面没渲染出标题',
  ).toContainText('主题覆盖验证');
  await expect(inner.locator('svg.markmap')).toBeVisible();

  // 外层页面的文档外壳照旧：面包屑的最后一段还是本页标题。
  await expect(
    page.locator('.breadcrumbs__item').last(),
    '面包屑没指回本页，说明外层不是文档页',
  ).toContainText('iframe 示例');

  // 正文区真的被换掉了：官方给正文的那一格（`div.markdown`）不在页面上，
  // 本页 markdown 的正文因此一行都不剩。
  await expect(page.locator('article .markdown'), '正文区没被换掉').toHaveCount(
    0,
  );

  expect(errors, errors.join('\n')).toEqual([]);
});
