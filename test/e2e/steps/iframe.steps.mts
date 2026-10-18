import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

Given('我打开 iframe 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/iframe-demo');
});

Then('页面上有一个 iframe', async ({ page }) => {
  await expect(
    page.locator('iframe'),
    'iframe 没出现 —— 这一层只在构建产物里嵌（开发模式给的是链接）',
  ).toBeVisible();
});

// `iframe: /markmap-demo` 的值以 `/` 开头，按站点 origin 补成绝对地址。
// 读的是 DOM 的 `src` **属性**（浏览器给的绝对形式）：HTML 里写的那一格构建期是
// frontmatter 的原值、激活后才是补完的地址，跟着时序飘。
Then('它指向本站的 markmap 示例页', async ({ page }) => {
  const src = await page
    .locator('iframe')
    .evaluate((el: HTMLIFrameElement) => el.src);
  expect(new URL(src).pathname).toBe('/markmap-demo');
  expect(new URL(src).origin).toBe(new URL(page.url()).origin);
});

// 嵌进来的那页自己也是命中页：它的内容要真的在 frame 里渲染出来，
// 只证明「有个 iframe」证明不了目标页可达。
Then('被嵌的那一页在框里真的渲染出来', async ({ page }) => {
  const inner = page.locator('iframe').contentFrame();
  await expect(
    inner.locator('article h1'),
    '被嵌页面没渲染出标题',
  ).toContainText('主题覆盖验证');
  await expect(inner.locator('svg.markmap')).toBeVisible();
});

Then('外层文档的外壳照旧，面包屑指回本页', async ({ page }) => {
  await expect(
    page.locator('.breadcrumbs__item').last(),
    '面包屑没指回本页，说明外层不是文档页',
  ).toContainText('iframe 示例');
});

// 正文区真的被换掉了：官方给正文的那一格（`div.markdown`）不在页面上，
// 本页 markdown 的正文因此一行都不剩。
Then('正文区确实被换掉了', async ({ page }) => {
  await expect(page.locator('article .markdown'), '正文区没被换掉').toHaveCount(
    0,
  );
});
