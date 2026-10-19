import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Then } = createBdd();

/**
每条用例的最后一句：这一路点下来，浏览器一个字都不该报。

监听器在「打开页面」那一步就装上了（见 ../helpers.mts），这里只是回收那份记录 ——
同一个 page 拿到的是同一只数组。
*/
Then('浏览器里没有运行期错误', async ({ page }) => {
  const errors = watchPageErrors(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

/**
命中整页替换那三层（`theme-iframe` 判 `iframe:`、`theme-stoplight` 判 `oas3:`、
`theme-redoc` 判 `redoc:`）时，本层**不包**下层 `DocItem`，所以那一页连文档正文外壳都没有。
三层判的是同一件事，句子就一份。
*/
Then('这一页没有文档正文外壳', async ({ page }) => {
  await expect(page.locator('article'), '整页没交给外部渲染器').toHaveCount(0);
});
