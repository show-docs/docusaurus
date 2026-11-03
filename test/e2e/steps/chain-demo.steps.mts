import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

/**
示例页正文里那条链：站点层加 `tools/` 那三层主题，从外到内 `src/theme > theme-c > theme-b >
theme-a`，最里面才是链底那份组件本体。选择器按「直接子元素」串起来，所以嵌套关系本身是被验的一环。
*/
const chain = (page: Page): Locator =>
  page.locator(
    'div[data-site-wrapper="src/theme"] >' +
      ' div[data-theme-wrapper="theme-c"] >' +
      ' div[data-theme-wrapper="theme-b"] >' +
      ' div[data-theme-wrapper="theme-a"]',
  );

/** 四层各自的角标：角标与本层的边框同色，肉眼一眼看得出 `[SITE]` 圈的是哪一道。 */
const MARKS = [
  { selector: 'div[data-site-wrapper="src/theme"]', mark: '[SITE]' },
  { selector: 'div[data-theme-wrapper="theme-c"]', mark: '[C]' },
  { selector: 'div[data-theme-wrapper="theme-b"]', mark: '[B]' },
  { selector: 'div[data-theme-wrapper="theme-a"]', mark: '[A]' },
];

Given('我打开链式覆盖示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/plugin-prev-layer-resolver/docs/chain-demo');
});

Then('那一格被套进四层主题的链里', async ({ page }) => {
  await expect(chain(page), '那一格没被套进四层主题的链里').toHaveCount(1);
});

Then('四层各自的角标都在', async ({ page }) => {
  for (const { selector, mark } of MARKS) {
    await expect(
      page.locator(`${selector} > span.mark`),
      `${selector} 那一层的角标该是 ${mark}`,
    ).toHaveText(mark);
  }
});

/**
链底那份组件本体（`theme-base` 那一层提供的 `ChainDemo`）真的在链的最里面，且**只有一份** ——
链上那四层各自包一层，落到本体上就停，所以「只有一份」与「它在最里面」一起钉住链底。
*/
Then('链底那份组件在最里面', async ({ page }) => {
  const base = chain(page).locator('.chain-base');
  await expect(base, '链底没有那份组件本体').toHaveCount(1);
  await expect(base, '链底那份组件本体看不见').toBeVisible();
});
