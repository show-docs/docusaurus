import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

/**
本层那一格的认法：一条标题写着「内容根字数」的提示块。

认 `.theme-admonition` 而不是产物里那个 `admonition_xxxx` —— 官方那份组件的 CSS 类名带哈希，
`theme-admonition` 与 `alert` 才是稳定那一半。再按标题的这句话筛，就不必赌 DOM 深浅。
*/
const statsBlock = (page: Page): ReturnType<Page['locator']> =>
  page.locator('.theme-admonition', { hasText: '内容根字数' });

/** 那一块上的整段文本（标题、总数那一句、多版本时那几行，连成一串）。 */
const blockText = async (page: Page): Promise<string> =>
  (await statsBlock(page).textContent()) ?? '';

Given('我打开全站字数示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/theme-word-count/docs/word-count-demo');
});

/** 另一棵内容根（`themes`）的那一页：落地页自己写了 `wordCount: true`。 */
Given('我打开主题包说明页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/themes/');
});

/**
总数与页数都写得出来、且都大于 0。

**不断言具体数字**：本站的内容根每加一页文档，总数就变。这一格要钉的是「配置期算出来的数走到了
静态 HTML」—— 数在客户端没有第二次请求，首屏文本里就得有它。
*/
Then('统计那一格写明总词数与页数', async ({ page }) => {
  const text = await blockText(page);

  const words = /共\s*(\d+)\s*个词/.exec(text)?.[1];
  const pages = /来自\s*(\d+)\s*页/.exec(text)?.[1];

  expect(words, `这一句里没有总词数：${text}`).toBeTruthy();
  expect(pages, `这一句里没有页数：${text}`).toBeTruthy();
  expect(Number(words), '总词数是 0：生成模块没进浏览器').toBeGreaterThan(0);
  expect(Number(pages), '页数是 0：清单里一份文档都没数到').toBeGreaterThan(0);
});

/**
站点两份实例的 id。哪一页归哪一份由句子点名，实现不按地址猜：断言的是块上**只**出现它。

两份实例的数在配置期是同一份产物，页面按路由上下文只挑自己那一格。挑错的两种症状 —— 挑了
别的根、或者干脆退回全站合计 —— 都会让另一个 id 也出现在块里。
*/
const INSTANCES = ['default', 'themes'] as const;

Then(
  /^统计那一格只提 "([^"]+)" 这一个内容根$/,
  async ({ page }, instance: string) => {
    const text = await blockText(page);

    expect(INSTANCES, `句子里的实例「${instance}」不在清单里`).toContain(
      instance,
    );
    expect(text, `块里没写这一页所在的实例：${text}`).toContain(instance);
    const others = INSTANCES.filter((id) => id !== instance);
    for (const other of others) {
      expect(
        text,
        `这一页在 ${instance}，块里却提到了 ${other}：${text}`,
      ).not.toContain(other);
    }
  },
);

// 位置要真的在正文之上：这一层把统计摆在前面，正文仍交回官方那一份 `DocItem`。
// 取第一个 `article`：`/themes/` 那一页的卡片列表（`DocCardList`）里每张卡也是一个 `<article>`，
// 正文那一份在 DOM 里排在它们前面。
Then('统计那一格落在正文上方', async ({ page }) => {
  const [blockBox, articleBox] = [
    await statsBlock(page).boundingBox(),
    await page.locator('article').first().boundingBox(),
  ];

  expect(blockBox, '统计那一格没有落位').not.toBeNull();
  expect(articleBox, '正文没有渲染').not.toBeNull();
  expect(blockBox!.y + blockBox!.height).toBeLessThanOrEqual(articleBox!.y);
});

// 原文没被吃掉（不是替换）。
Then('正文那一段照常在场', async ({ page }) => {
  await expect(
    page.locator('article').getByText('这一页的 frontmatter 写了'),
    '正文段落不见了',
  ).toBeVisible();
});

// 另一棵内容根那一页用的是它自己的开场白：统计块同样只是加在前面。
Then('主题包说明的正文照常在场', async ({ page }) => {
  await expect(
    page.locator('article').getByText('这一族是功能层主题包'),
    '主题包说明的正文不见了',
  ).toBeVisible();
});

Then('这一页没有字数统计', async ({ page }) => {
  await expect(
    statsBlock(page),
    '没写 wordCount 的页面被加了这一格',
  ).toHaveCount(0);
});
