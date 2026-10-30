import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import {
  componentFrame,
  componentFrameUrl,
  layerRoot,
  watchPageErrors,
} from '../helpers.mts';

const { Given, Then } = createBdd();

/**
四把键同写一页时，赢的那一把由 component-page 那张规则表定 —— 各层在自己的 `loadContent()`
里交回组件与规则，表的顺序是**站点配置里那一列 `rules`**
（`docusaurus.config.mjs`：scalar → redoc → stoplight → iframe）。
两份夹具页各钉一头：全写上验「第一个命中就换框」，拿掉 scalar 验「判定真的在逐条走」。
两条都按**页面上只有一个框**来量 —— 落败的键要是还渲染出自己的框，数量这一句就红；
赢的是哪一层则按框里长出来的那棵渲染根量（四把键共用同一个框、同一条地址，`src` 里分不出层）。
*/
const anyFrame = (page: Page) => page.locator('iframe');

const precedenceDemoUrl = (fixture: 'scalar' | 'redoc') =>
  `/theme-component-page/docs/frame-precedence-${fixture}`;

Given('我打开四把键同写的演示页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto(precedenceDemoUrl('scalar'));
});

Given('我打开不写 scalar 的三把键演示页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto(precedenceDemoUrl('redoc'));
});

/**
四把键命中的是同一个框，所以「赢的是哪一层」只能问框里：赢的那一层的渲染根在，其余两层都不在。
*/
const expectOnlyLayerInFrame = async (
  page: Page,
  winner: 'scalar' | 'redoc',
) => {
  await expect(
    anyFrame(page),
    '命中页不止一个框：落败的键也渲染了',
  ).toHaveCount(1);
  await expect(componentFrame(page)).toHaveAttribute('src', componentFrameUrl);

  const losers = (['redoc', 'scalar', 'stoplight'] as const).filter(
    (layer) => layer !== winner,
  );
  await expect(
    layerRoot(page, winner),
    `框里长出来的不是 ${winner} 那一层的渲染根`,
  ).toBeVisible();
  for (const layer of losers) {
    await expect(
      layerRoot(page, layer),
      `框里同时长出了 ${layer} 那一层的渲染根（rules 那一列失守？）`,
    ).toHaveCount(0);
  }
};

Then('这一页只摆一个框，而且是 scalar 那一个', async ({ page }) => {
  await expectOnlyLayerInFrame(page, 'scalar');
});

Then('这一页只摆一个框，而且是 redoc 那一个', async ({ page }) => {
  await expectOnlyLayerInFrame(page, 'redoc');
});
