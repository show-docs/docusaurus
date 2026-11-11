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
const statsBlock = (page: Page, title: string): ReturnType<Page['locator']> =>
  page.locator('.theme-admonition', { hasText: title });

/** 某一块的整段文本（标题、总数那一句、多版本时那几行，连成一串）。 */
const blockText = async (page: Page, title: string): Promise<string> =>
  (await statsBlock(page, title).textContent()) ?? '';

/** 块上那句总数里的词数与页数；句子形状由本层组件的模板定，数本身不断言。 */
const wordsOf = (text: string): number =>
  Number(/共\s*(\d+)\s*个词/.exec(text)?.[1]);

const pagesOf = (text: string): number =>
  Number(/来自\s*(\d+)\s*页/.exec(text)?.[1]);

/** 明细表里某一行右侧那一格：左边那一格按整句匹配，免得「标题数」撞上「一级标题数」。 */
const metricOf = async (
  page: Page,
  title: string,
  metric: string,
): Promise<number> => {
  const row = statsBlock(page, title)
    .locator('tr')
    .filter({
      has: page.getByRole('cell', { exact: true, name: metric }),
    });
  const value = await row.getByRole('cell').nth(1).textContent();

  return Number(value?.trim());
};

Given('我打开字数统计示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/theme-word-count/docs/word-count-demo');
});

/** 另一棵内容根（`themes`）的那一页：落地页正文里有一行 `:::word-count`。 */
Given('我打开主题包说明页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/themes/');
});

/**
总数与页数都写得出来、且都大于 0。

**不断言具体数字**：本站的内容根每加一页文档，总数就变。这一格要钉的是「配置期算出来的数走到了
静态 HTML」—— 数在客户端没有第二次请求，首屏文本里就得有它。
*/
Then(
  /^「([^」]+)」那一块写明总词数与页数$/,
  async ({ page }, title: string) => {
    const text = await blockText(page, title);
    const words = wordsOf(text);
    const pages = pagesOf(text);

    expect(words, `这一句里没有总词数：${text}`).toBeTruthy();
    expect(pages, `这一句里没有页数：${text}`).toBeTruthy();
    expect(words, '总词数是 0：生成模块没进浏览器').toBeGreaterThan(0);
    expect(pages, '页数是 0：清单里一份文档都没数到').toBeGreaterThan(0);
  },
);

/**
站点两份实例的 id。哪一页归哪一份由句子点名，实现不按地址猜：断言的是块上**只**出现它。

两份实例的数在配置期是同一份产物，页面按路由上下文只挑自己那一格。挑错的两种症状 —— 挑了
别的根、或者干脆退回全站合计 —— 都会让另一个 id 也出现在块里。
*/
const INSTANCES = ['default', 'themes'] as const;

Then(
  /^「([^」]+)」那一块只提 "([^"]+)" 这一个内容根$/,
  async ({ page }, title: string, instance: string) => {
    const text = await blockText(page, title);

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

// 位置要真的在指令那一处：示例页把指令写在开场那一段之后，块就得落在那段文字与下一个小标题
// 之间 —— 这才证明它是插在正文中间，而不是照旧挂在正文最前面。
// 取第一个 `article`：`/themes/` 那一页的卡片列表（`DocCardList`）里每张卡也是一个 `<article>`，
// 正文那一份在 DOM 里排在它们前面。
Then('统计那一格落在正文那一段之后', async ({ page }) => {
  const article = page.locator('article').first();
  const [introBox, blockBox, nextBox] = [
    await article.getByText('这一页的正文里有几行').boundingBox(),
    await statsBlock(page, '内容根字数').boundingBox(),
    await article
      .getByRole('heading', { name: '数的是哪些文件' })
      .boundingBox(),
  ];

  expect(introBox, '指令前面那一段没有渲染').not.toBeNull();
  expect(blockBox, '统计那一格没有落位').not.toBeNull();
  expect(nextBox, '指令后面的小标题没有渲染').not.toBeNull();
  expect(blockBox!.y).toBeGreaterThanOrEqual(introBox!.y + introBox!.height);
  expect(blockBox!.y + blockBox!.height).toBeLessThanOrEqual(nextBox!.y);
});

// 另一棵内容根那一页把指令写在「这一页自己的字数」那一节的开头：块要落在这个小标题之后、
// 它下面那一段之前。
Then('统计那一格落在「这一页自己的字数」那一节里', async ({ page }) => {
  const article = page.locator('article').first();
  const [headingBox, blockBox, introBox] = [
    await article
      .getByRole('heading', { name: '这一页自己的字数' })
      .boundingBox(),
    await statsBlock(page, '内容根字数').boundingBox(),
    await article.getByText('这一块数的是').boundingBox(),
  ];

  expect(headingBox, '指令所在那一节的小标题没有渲染').not.toBeNull();
  expect(blockBox, '统计那一格没有落位').not.toBeNull();
  expect(introBox, '指令后面那一段没有渲染').not.toBeNull();
  expect(blockBox!.y).toBeGreaterThanOrEqual(
    headingBox!.y + headingBox!.height,
  );
  expect(blockBox!.y + blockBox!.height).toBeLessThanOrEqual(introBox!.y);
});

// 原文没被吃掉（不是替换）。
Then('正文那一段照常在场', async ({ page }) => {
  await expect(
    page.locator('article').getByText('这一页的正文里有几行'),
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

// 本页那一块只有一句词数：页数对一页没有意义，组件不写「来自 1 页」。
Then('「本页字数」那一块只写词数，不写页数', async ({ page }) => {
  const text = await blockText(page, '本页字数');

  expect(wordsOf(text), `这一句里没有本页词数：${text}`).toBeGreaterThan(0);
  expect(text, `本页那一块不该写页数：${text}`).not.toContain('来自');
});

// 本文件夹那一块数的是示例页所在的那一个目录；目录里还有同级的另一份文档，所以页数大于 1。
Then(
  /^「本文件夹字数」那一块写明 "([^"]+)" 与页数$/,
  async ({ page }, folder: string) => {
    const text = await blockText(page, '本文件夹字数');

    expect(text, `块里没写所在文件夹：${text}`).toContain(folder);
    expect(
      pagesOf(text),
      `本文件夹那一块的页数不大于 1：${text}`,
    ).toBeGreaterThan(1);
  },
);

// 全站那一块把两份实例各列一行：这正是「退回全站」与「只挑自己那一格」的分界。
Then('「全站字数」那一块列出两个内容根', async ({ page }) => {
  const text = await blockText(page, '全站字数');

  for (const instance of INSTANCES) {
    expect(text, `全站那一块没列 ${instance}：${text}`).toContain(instance);
  }
});

/**
明细表与总数那一句必须自洽：文件数量对页数、词数对总数、两类文字加起来对词数。

这三条都是生成模块里同一格数据的两种读法：只要有一段是页面里现算的，或者某个范围挑错了格，
至少有一条对不上。字符数只钉「大于 0」，它的口径单独在单测里钉。
*/
Then(
  /^「([^」]+)」那一块的明细表与总数自洽$/,
  async ({ page }, title: string) => {
    const text = await blockText(page, title);
    const words = wordsOf(text);

    await expect(
      statsBlock(page, title).getByRole('table'),
      '明细表没有渲染',
    ).toBeVisible();
    expect(
      await metricOf(page, title, '文件数量'),
      `文件数量与页数那一句不一致：${text}`,
    ).toBe(pagesOf(text));
    expect(
      await metricOf(page, title, '词数'),
      `词数一行与总数那一句不一致：${text}`,
    ).toBe(words);
    expect(
      (await metricOf(page, title, '中日韩文字')) +
        (await metricOf(page, title, '其余文字')),
      `两类文字加起来不等于词数：${text}`,
    ).toBe(words);
    expect(
      await metricOf(page, title, '字符数'),
      `字符数为 0：${text}`,
    ).toBeGreaterThan(0);
  },
);

// 本页这一格的页数是 1：明细表里那一行必须与「这一块只数这一页」对上。
Then('「本页字数」那一块的明细表只有这一页', async ({ page }) => {
  const text = await blockText(page, '本页字数');

  await expect(
    statsBlock(page, '本页字数').getByRole('table'),
    '明细表没有渲染',
  ).toBeVisible();
  expect(
    await metricOf(page, '本页字数', '文件数量'),
    `本页的文件数量不是 1：${text}`,
  ).toBe(1);
  expect(
    await metricOf(page, '本页字数', '词数'),
    `词数一行与总数那一句不一致：${text}`,
  ).toBe(wordsOf(text));
});

/**
四个范围的数一层套一层：本页 ⊆ 本文件夹 ⊆ 内容根 ⊆ 全站。

只钉方向、不钉数字：这一页所在目录里还有另一份文档，内容根里还有别的包，全站里还有另一棵根，
所以四条都该是严格小于。数值如果反了，说明挑错了范围（例如 `folder` 只算了这一页）。
*/
Then('四块的词数按页、文件夹、内容根、全站依次变大', async ({ page }) => {
  const titles = [
    '本页字数',
    '本文件夹字数',
    '内容根字数',
    '全站字数',
  ] as const;
  const words: number[] = [];

  for (const title of titles) {
    words.push(wordsOf(await blockText(page, title)));
  }

  expect(
    words.every((count) => Number.isFinite(count) && count > 0),
    `四块里有一块没数出词：${words.join(' / ')}`,
  ).toBe(true);

  for (let index = 1; index < words.length; index += 1) {
    expect(
      words[index]!,
      `${titles[index]} 不大于 ${titles[index - 1]}：${words.join(' / ')}`,
    ).toBeGreaterThan(words[index - 1]!);
  }
});

Then('这一页没有字数统计', async ({ page }) => {
  await expect(
    page.locator('.theme-admonition'),
    '没写指令的页面被加了这一格',
  ).toHaveCount(0);
});
