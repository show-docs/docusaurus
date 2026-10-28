import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

/**
四把键同写一页时，赢的那一把由注册表顺序定（`packages/theme-iframe/lib/api-frame-registry.ts`：
scalar → redoc → stoplight → iframe）。两份夹具页各钉一头：全写上验「第一个命中就换框」，
拿掉 scalar 验「判定真的在逐条走」。判据都按**页面上只有一个框**来量 —— 落败的键要是
还渲染出自己的框，数量这一句就红。
*/
const anyFrame = (page: Page): Locator => page.locator('iframe');

Given('我打开四把键同写的演示页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/theme-iframe/docs/frame-precedence-scalar');
});

Given('我打开不写 scalar 的三把键演示页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/theme-iframe/docs/frame-precedence-redoc');
});

Then('这一页只摆一个框，而且是 scalar 那一个', async ({ page }) => {
  await expect(
    anyFrame(page),
    '命中页不止一个框：落败的键也渲染了',
  ).toHaveCount(1);
  await expect(
    page.locator('iframe.scalar-frame'),
    '赢的框不是 scalar 那一个（注册表顺序失守？）',
  ).toHaveCount(1);
  await expect(page.locator('iframe.scalar-frame')).toHaveAttribute(
    'src',
    '/scalar-view/?src=%2Fopenapi-scalar.yaml',
  );
});

Then('这一页只摆一个框，而且是 redoc 那一个', async ({ page }) => {
  await expect(
    anyFrame(page),
    '命中页不止一个框：落败的键也渲染了',
  ).toHaveCount(1);
  await expect(
    page.locator('iframe.redoc-frame'),
    '赢的框不是 redoc 那一个（判定没有逐条走注册表？）',
  ).toHaveCount(1);
  await expect(page.locator('iframe.redoc-frame')).toHaveAttribute(
    'src',
    '/redoc-view/?src=%2Fopenapi-redoc.yaml',
  );
});
