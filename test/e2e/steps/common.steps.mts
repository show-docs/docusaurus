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
