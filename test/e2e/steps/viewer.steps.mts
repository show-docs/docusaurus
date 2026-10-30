import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { When, Then } = createBdd();

/** 正文里那几张图片：这一层判的就是它们，别的格（侧栏、页脚）不算。 */
const bodyImages = (page: Page) =>
  page.locator('article .theme-doc-markdown img');

/** 查看器自己的容器：viewerjs 第一次打开时才建，挂在 `<body>` 上；销毁就整格从 DOM 里消失。 */
const viewer = (page: Page) => page.locator('.viewer-container');

const viewerTitle = (page: Page) => viewer(page).locator('.viewer-title');

/** 画布上每次只摆一张（切图时 viewerjs 会先清掉 canvas 再放新的那张）。 */
const viewerImage = (page: Page) => viewer(page).locator('.viewer-canvas img');

/**
画布上这张就是正文第 `index` 张：站点把小 svg 内联成了 data URI，
所以这里比「同一份图片来源」，不认它写成 `/img/…` 还是 `data:…`。
*/
const expectSameImageAsInBody = async (page: Page, index: number) => {
  const source = await bodyImages(page).nth(index).getAttribute('src');

  expect(source, '正文里没有这张图').not.toBeNull();
  await expect(viewerImage(page)).toHaveAttribute('src', source ?? '');
};

Then('正文里的两张图片都在', async ({ page }) => {
  await expect(bodyImages(page), '示例页的正文该有两张图片').toHaveCount(2);
  await expect(bodyImages(page).first()).toBeVisible();
  await expect(bodyImages(page).nth(1)).toBeVisible();
});

When('我点开第一张图片', async ({ page }) => {
  const firstImage = bodyImages(page).first();

  // 查看器那一份代码是按需加载的：chunk 回来之前图片上没有监听，这一次点下去不会有反应。
  // 所以点一次就等容器建起来，等不到再点一次，最多三次 —— 不把「加载完了」交给时序运气。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await firstImage.click();

    const built = await viewer(page)
      .waitFor({ state: 'attached', timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (built) {
      return;
    }
  }

  throw new Error('点了三次都没打开图片查看器：viewerjs 那份代码没接到图片上');
});

Then('查看器打开，标题用的是这张图的说明', async ({ page }) => {
  await expect(viewer(page)).toBeVisible();
  // 「看得见」不能只靠 toBeVisible：它不看透明度。样式表被压缩器重排过的那一次，
  // 容器整层是 opacity: 0 的，用例全绿但页面上什么都没有。
  await expect(viewer(page), '查看器打开了但是透明的').toHaveCSS(
    'opacity',
    '1',
  );
  // viewerjs 在说明后面接上这张图的实际尺寸，所以这里连尺寸一起认下来。
  await expect(viewerTitle(page), '查看器标题没用这张图的说明').toHaveText(
    /^主题层栈：谁包着谁 \(\d+ × \d+\)$/,
  );
  await expect(viewerImage(page), '画布上不是正文第一张图').toHaveAttribute(
    'alt',
    '主题层栈：谁包着谁',
  );
  await expectSameImageAsInBody(page, 0);
});

When('我点查看器的下一张', async ({ page }) => {
  // `.viewer-next` 有两颗：工具条上那颗（这一层摆的就是它）和左右切换那一格（默认不显示）。
  await viewer(page).locator('.viewer-toolbar .viewer-next').click();
});

Then('图集切到第二张图', async ({ page }) => {
  await expect(viewerTitle(page), '图集没有切到第二张图').toHaveText(
    /^一份文档源到页面，中间经过哪几步 \(\d+ × \d+\)$/,
  );
  await expect(viewerImage(page), '画布上不是正文第二张图').toHaveAttribute(
    'alt',
    '一份文档源到页面，中间经过哪几步',
  );
  await expectSameImageAsInBody(page, 1);
});

When('我按 Esc 关掉查看器', async ({ page }) => {
  await page.keyboard.press('Escape');
});

Then('查看器收起', async ({ page }) => {
  await expect(viewer(page)).not.toBeVisible({ timeout: 5000 });
});

/**
换页走的是真点击，不是 `page.goto`：这一层自己销毁查看器、再在新页重接，只有客户端路由才走到那段。

换的那一页必须取**同一棵内容根**里的另一格：侧栏按实例给，示例页在 `themes/` 那一族，
`packages/` 里的 `theme-markmap` 在这一页的侧栏中不存在。

侧栏里**别的包那一格只露出顶层页那一条链接**（收着的 category 不渲染子项，实测），所以到示例页要两跳：
先点开那一格，它的子项才会出现在侧栏里。
*/
When('我从侧栏点开 theme-copy-button 那一格', async ({ page }) => {
  await page
    .locator('.theme-doc-sidebar-menu a[href="/themes/theme-copy-button/"]')
    .first()
    .click();
  await expect(page).toHaveURL(/\/themes\/theme-copy-button\/$/);
});

When('再点开它的复制按钮示例页', async ({ page }) => {
  await page
    .locator(
      '.theme-doc-sidebar-menu a[href="/themes/theme-copy-button/docs/copy-button-demo"]',
    )
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/themes\/theme-copy-button\/docs\/copy-button-demo$/,
  );
});

Then('这一页没有图片查看器', async ({ page }) => {
  // 这一页正文里没有图片，上一份查看器该随换页一起销毁（容器都不留在 DOM 里）。
  await expect(viewer(page)).toHaveCount(0);
  await expect(bodyImages(page)).toHaveCount(0);
});
