import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Then } = createBdd();

/**
## 标签：画在文章末尾的页脚里

官方把文档的标签画在文章末尾的页脚里（`DocItem/Footer` 那一格）—— 站点层不再挪它，
也不再注入 git 标签，所以那一行芯片里只有页面自己写的标签。

这两句钉的就是那一格的位置：**标签在文章末尾那一格**（官方那条
`.theme-doc-footer-tags-row`），以及**标题那一格下面没有标签行**、页面上也没有第二处标签。

## 两条标题路径

正文里**有** h1 时，官方那个 remark 插件把它包进 `<header>`；
正文里**没有** h1 时，官方补一个合成标题，也在 `<header>` 里。
两句判据对两条路径一视同仁 —— 主页走第一条，`.dbml` 那一页走第二条。
*/

/** 标签的地址形如 `/tags/homepage`（官方按标签名 kebab 出来的那一格）。 */
const TAG_LINK = 'a[href^="/tags/"]';

/** 正文标题那一格：`<article>` 里那一个 `<header>`。 */
const TITLE_HEADER = 'article header';

/** 文章末尾那一行标签：官方 `DocItem/Footer` 画的那一格。 */
const FOOTER_TAGS_ROW = '.theme-doc-footer-tags-row';

Then('文章末尾的页脚里就是这一页的标签', async ({ page }) => {
  const row = page.locator(FOOTER_TAGS_ROW);
  await expect(row, '文章末尾的页脚里没有标签行').toHaveCount(1);

  const tags = row.locator(TAG_LINK);
  expect(await tags.count(), '页脚那一格里没有标签').toBeGreaterThan(0);
  await expect(tags.first(), '标签看不见').toBeVisible();
});

Then('标题下面没有标签行', async ({ page }) => {
  const header = page.locator(TITLE_HEADER);
  await expect(header, '正文里没有标题那一格').toHaveCount(1);
  await expect(header.locator(TAG_LINK), '标题那一格里还有标签').toHaveCount(0);

  // 页面上**每一处**标签都在文章末尾那一格里：没有第二处。
  const outside = await page
    .locator(TAG_LINK)
    .evaluateAll(
      (els) =>
        els.filter((el) => el.closest('.theme-doc-footer-tags-row') === null)
          .length,
    );
  expect(outside, '有标签画在文章末尾那一格之外').toBe(0);
});
