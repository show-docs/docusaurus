import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

/** 这一层留下的只有一个 iframe，两句都从它出发。 */
const frame = (page: Page): Locator => page.locator('iframe');

/** 读 DOM 的 `src` **属性**：浏览器给的是绝对形式。HTML 里写的那一格构建期是 frontmatter
的原值、激活后才是补完的地址，跟着时序飘，所以只能在浏览器里读属性。 */
const frameSrc = (page: Page): Promise<string> =>
  frame(page).evaluate((el: HTMLIFrameElement) => el.src);

Given('我打开 iframe 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/packages/theme-iframe/docs/iframe-demo');
});

// 句子里不写 `?path=`：playwright-bdd 把步骤文本当 Cucumber 表达式解析，`?` 在那里是量词。
Given('我打开 iframe 示例页并带上 path 参数', async ({ page }) => {
  watchPageErrors(page);
  await page.goto(
    '/packages/theme-iframe/docs/iframe-demo?path=/packages/theme-markmap/docs/markmap-demo',
  );
});

Then('页面上有一个 iframe', async ({ page }) => {
  await expect(frame(page), 'iframe 没出现').toBeVisible();
});

// 整页交给外部框以后，`<iframe>` 的 `title` 是这一页在辅助技术里唯一的名字。
// 页面写了 `frontMatter.title` 时用的就是它（注册表那条「其他文档」只兜底）。
Then('框的无障碍标题用的是页面自己的标题', async ({ page }) => {
  await expect(
    frame(page).first(),
    'iframe 的 title 应取页面 frontMatter.title',
  ).toHaveAttribute('title', 'iframe 示例');
});

// `packages/theme-iframe/docs/iframe-demo.md` 的 frontmatter 现在写的是 `iframe: /404`：值以 `/` 开头，
// 按当前站点 origin 补成绝对地址，所以嵌进来的是本站自己那页 —— 离线也能看。
Then('它指向本站 404 那一页', async ({ page }) => {
  const src = await frameSrc(page);
  expect(new URL(src).pathname).toBe('/404');
  expect(new URL(src).origin).toBe(new URL(page.url()).origin);
});

// 嵌进来的那页自己也要真的渲染出来：只证明「有个 iframe」证明不了目标页可达。
// 这一页是站点的未找到页，所以框里的标题是它自己那句。
Then('被嵌的那一页在框里真的渲染出来', async ({ page }) => {
  const inner = frame(page).contentFrame();
  await expect(inner.locator('h1'), '被嵌页面没渲染出标题').toContainText(
    'Page Not Found',
  );
  await expect(
    inner.locator('.navbar'),
    '被嵌页面没渲染出自己的壳',
  ).toBeVisible();
});

/**
theme-iframe 那份共用版式（`components/api-frame.css`）定的口径：
`.api-frame` 的 `height: calc(100vh - var(--ifm-navbar-height))`，
所以那一格的上沿贴着 navbar 的下沿、下沿贴着视口的下沿，各留 1px 容差。

下沿那一句钉的是 `height` 这条公式没退回 iframe 默认的 150px：这一层不给容器定高，
高度只由视口算，所以「默认 150px」和「扣掉了不该扣的那一档」都会让下沿离开视口下沿。
*/
Then('iframe 占满 navbar 以下那一屏', async ({ page }) => {
  const box = await frame(page).evaluate((el: HTMLIFrameElement) => {
    const { innerHeight } = el.ownerDocument.defaultView ?? { innerHeight: 0 };
    const rect = el.getBoundingClientRect();
    return {
      gapToNavbar: Math.round(
        rect.top -
          (el.ownerDocument.querySelector('.navbar')?.getBoundingClientRect()
            .bottom ?? 0),
      ),
      gapToViewport: Math.round(innerHeight - rect.bottom),
    };
  });

  expect(
    Math.abs(box.gapToNavbar),
    `iframe 的上沿没贴住 navbar：差 ${box.gapToNavbar}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(box.gapToViewport),
    `iframe 的下沿没贴住视口：差 ${box.gapToViewport}px`,
  ).toBeLessThanOrEqual(1);
});

// 整幅让位那一条：`components/api-frame.css` 里的 `.container:has(iframe)`。
Then('承载它的容器不留内边距', async ({ page }) => {
  const container = page.locator('.container:has(iframe)');
  await expect(container, 'iframe 没落在 `.container` 里').toHaveCount(1);
  await expect(container).toHaveCSS('padding', '0px');
});

// 换掉的是 `DocItem`，不是整张文档页：navbar 属于外面那层，照旧在。
Then('外层站点的壳还在，navbar 照旧', async ({ page }) => {
  await expect(page.locator('.navbar'), '站点那层 navbar 没了').toBeVisible();
});

// 这一页 markdown 的正文一行都不剩。`locator` 不跨 frame，所以这里量的 `h1`
// 只有外层文档的，框里那句「Page Not Found」不算。
Then('本页 markdown 的正文一行都不剩', async ({ page }) => {
  await expect(page.locator('h1'), '本页标题还在页面上').toHaveCount(0);
  await expect(page.locator('.markdown'), '本页正文还在页面上').toHaveCount(0);
});

Then('它指向本站的 markmap 示例页', async ({ page }) => {
  const src = await frameSrc(page);
  expect(new URL(src).pathname).toBe(
    '/packages/theme-markmap/docs/markmap-demo',
  );
  expect(new URL(src).origin).toBe(new URL(page.url()).origin);
});

// `?path=` 那一层解析（`getURL` 的第 2 步）：在 `iframe:` 那个地址之下再解一次。
// 顺带跨验一层：框里那页命中的是 `theme-markmap`，导图真画出来才说明换的目标可达。
Then('被嵌的那一页在框里画出导图', async ({ page }) => {
  const inner = frame(page).contentFrame();
  await expect(inner.locator('article h1')).toContainText('主题覆盖验证');
  await expect(inner.locator('svg.markmap')).toBeVisible();
});
