import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

/**
本层那一格的认法：一块 `aria-label` 写着「…字数」的 `<section>`。

名字由组件自己写在 `aria-label` 上，不赌 DOM 深浅，也不认产物里带哈希的类名。
*/
const statsBlock = (page: Page, title: string): ReturnType<Page['getByRole']> =>
  page.getByRole('region', { exact: true, name: title });

/** 某一块的整段文本（标题、范围那一行、四栏明细，连成一串）。 */
const blockText = async (page: Page, title: string): Promise<string> =>
  (await statsBlock(page, title).textContent()) ?? '';

/** 明细里某一格：项目名按整句匹配，免得「标题数」撞上「一级标题数」。 */
const metricOf = async (
  page: Page,
  title: string,
  metric: string,
): Promise<number> => {
  const row = statsBlock(page, title)
    .locator('tr')
    .filter({
      has: page.getByRole('rowheader', { exact: true, name: metric }),
    });
  const value = await row.getByRole('cell').textContent();

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
词数与页数都写得出来、且都大于 0。

**不断言具体数字**：本站的内容根每加一页文档，总数就变。这一格要钉的是「配置期算出来的数走到了
静态 HTML」—— 数在客户端没有第二次请求，首屏文本里就得有它。
*/
Then(
  /^「([^」]+)」那一块写明总词数与页数$/,
  async ({ page }, title: string) => {
    expect(
      await metricOf(page, title, '词数'),
      '词数是 0：生成模块没进浏览器',
    ).toBeGreaterThan(0);
    expect(
      await metricOf(page, title, '文件数量'),
      '页数是 0：清单里一份文档都没数到',
    ).toBeGreaterThan(0);
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

// 本文件夹那一块数的是示例页所在的那一个目录；目录里还有同级的另一份文档，所以页数大于 1。
Then(
  /^「本文件夹字数」那一块写明 "([^"]+)" 与页数$/,
  async ({ page }, folder: string) => {
    const text = await blockText(page, '本文件夹字数');

    expect(text, `块里没写所在文件夹：${text}`).toContain(folder);
    expect(
      await metricOf(page, '本文件夹字数', '文件数量'),
      `本文件夹那一块的页数不大于 1：${text}`,
    ).toBeGreaterThan(1);
  },
);

// 全站那一块把两份实例都列出来：这正是「退回全站」与「只挑自己那一格」的分界。
// 两只共用一个版本时「内容根」「版本」各写一遍 —— 逐组抄会读成「内容根 A · 版本 Next、内容根 B · 版本 Next」。
Then('「全站字数」那一块列出两个内容根', async ({ page }) => {
  const text = await blockText(page, '全站字数');

  for (const instance of INSTANCES) {
    expect(text, `全站那一块没列 ${instance}：${text}`).toContain(instance);
  }

  expect(
    text.match(/内容根/g)?.length ?? 0,
    `「内容根」逐组抄了一遍：${text}`,
  ).toBe(1);
});

/**
明细里的数必须彼此自洽：两类文字加起来等于词数，字符数另有其一格。

这几条都是生成模块里同一格数据的几种读法：只要某一段是页面里现算的，或者某个范围挑错了格，
至少有一条对不上。字符数只钉「大于 0」，它的口径单独在单测里钉。
*/
Then(/^「([^」]+)」那一块的明细彼此自洽$/, async ({ page }, title: string) => {
  const text = await blockText(page, title);

  await expect(
    statsBlock(page, title).getByRole('table').first(),
    '明细没有渲染',
  ).toBeVisible();
  expect(
    (await metricOf(page, title, '中日韩文字')) +
      (await metricOf(page, title, '其余文字')),
    `两类文字加起来不等于词数：${text}`,
  ).toBe(await metricOf(page, title, '词数'));
  expect(
    await metricOf(page, title, '字符数'),
    `字符数为 0：${text}`,
  ).toBeGreaterThan(0);
});

// 本页这一格的页数是 1：明细里那一行必须与「这一块只数这一页」对上。
Then('「本页字数」那一块的明细只有这一页', async ({ page }) => {
  const text = await blockText(page, '本页字数');

  await expect(
    statsBlock(page, '本页字数').getByRole('table').first(),
    '明细没有渲染',
  ).toBeVisible();
  expect(
    await metricOf(page, '本页字数', '文件数量'),
    `本页的文件数量不是 1：${text}`,
  ).toBe(1);
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
    words.push(await metricOf(page, title, '词数'));
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
    page.getByRole('region', {
      name: /^(本页|本文件夹|内容根|全站)字数$/,
    }),
    '没写指令的页面被加了这一格',
  ).toHaveCount(0);
});
