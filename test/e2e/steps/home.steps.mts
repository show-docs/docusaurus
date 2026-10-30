import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

/** 仓库根：本文件在 `test/e2e/steps/` 下，往上三层。不靠 cwd，从哪儿跑都对。 */
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

// 卡片由 `@theme/DocCardList` 按侧边栏自动给，所以这里钉的是「每张卡真能点进对应那一格」，
// 不钉清单本身（清单口径的产地在 `sidebars.mts`）。
/**
「一格一个包」那一份清单是**扫出来的**，判据与侧栏文件同一句：包根下有 `README.md` 的那个目录占
一顶层格。`packages/` 那一份实例的 `routeBasePath` 是 `'/'`，所以地址就是 `/<目录名>/`；
`themes/` 那一份的是 `'/themes'`，地址多一段。手抄那版漏了 `theme-git-badge`，少一张卡照样绿 ——
这一格本来就是为「别忘了某个包」而存在的。
*/
const packageHrefs = fs
  .readdirSync(path.join(repoRoot, 'packages'), { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      fs.existsSync(path.join(repoRoot, 'packages', entry.name, 'README.md')),
  )
  .map((entry) => `/${entry.name}/`);

/** 另一棵内容根（`themes/`）那一份清单：同一句判据，地址带 `/themes` 那一段。 */
const themesHrefs = fs
  .readdirSync(path.join(repoRoot, 'themes'), { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      fs.existsSync(path.join(repoRoot, 'themes', entry.name, 'README.md')),
  )
  .map((entry) => `/themes/${entry.name}/`);

/**
主页正文里那条链：站点层加 `tools/` 那三层主题，从外到内 `src/theme > theme-c > theme-b > theme-a`，
最里面才是官方那张卡片列表。选择器按「直接子元素」串起来，所以嵌套关系本身是被验的一环。
*/
const cardChain = (page: Page): Locator =>
  page.locator(
    'div[data-site-wrapper="src/theme"] >' +
      ' div[data-theme-wrapper="theme-c"] >' +
      ' div[data-theme-wrapper="theme-b"] >' +
      ' div[data-theme-wrapper="theme-a"]',
  );

Given('我打开主页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/');
});

Then('卡片列表被套进四层主题的链里', async ({ page }) => {
  const chain = cardChain(page);
  await expect(chain, '卡片列表没被套进四层主题的链里').toHaveCount(1);
  await expect(
    chain.locator('a.theme-doc-card-container').first(),
    '链的最里面没有卡片',
  ).toBeVisible();
});

Then('链里一格一个包都有卡片，指向各包自己的顶层页', async ({ page }) => {
  for (const href of packageHrefs) {
    await expect(
      cardChain(page).locator(`a.theme-doc-card-container[href="${href}"]`),
      `主页该有一张指向 ${href} 的卡片`,
    ).toBeVisible();
  }
  // 总数也钉住：多一张少一张都红。头那一张是主页自己 —— 内容根的 `README` 就排在这份根级
  // 清单的头一格，`sidebars.mts` 里写得很明白。
  await expect(
    cardChain(page).locator('a.theme-doc-card-container'),
    `卡片应是「${packageHrefs.length} 个包 + 主页那一张」`,
  ).toHaveCount(packageHrefs.length + 1);
});

// 卡片上那行说明取自本包 package.json 的 `description`（`sidebars.mts` 读的就是这一格）。
// 这句话改了那个包的 description 就要跟着改，两处是同一件事的两个写法，不是两份独立的判据。
Then('卡片上那行说明取自本包 package.json 的 description', async ({ page }) => {
  await expect(
    page.getByText(
      'Md 的 frontmatter 写 stoplight: true（spec 地址由 oas3: / aas3: 给）时把该页正文换成 Stoplight Elements 渲染的 OpenAPI 文档',
    ),
  ).toBeVisible();
});

// 点的是卡片本身：`getByRole('link', …)` 在同屏上会有三处命中（侧边栏、卡片、正文里的链接），
// Playwright 的严格模式因此直接报错。
When('我点开指向 theme-markmap 那一格的卡片', async ({ page }) => {
  await page
    .locator('a.theme-doc-card-container[href="/theme-markmap/"]')
    .click();
});

Then(
  '我落在 theme-markmap 的顶层页上，那一页就是这个包的 README',
  async ({ page }) => {
    await expect(page).toHaveURL(/\/theme-markmap\/$/);
    // README 的第一个一级标题就是包名：这一页的正文确实是那份文件，不是空的索引格。
    await expect(
      page.locator('article h1').first(),
      '顶层页的正文应是本包 README 的第一个标题',
    ).toHaveText('@show-docs/docusaurus-theme-markmap');
  },
);

/**
主页正文里指向 `/themes/` 的那一条入口：按 `article` 里的链接点，避免与别处的同名 href 撞。
这一条不是一张卡片 —— `themes/` 不在 `packages/` 那份侧栏清单里，它是正文里手写的一条链接。
*/
When('我点开指向 themes 那一族的入口', async ({ page }) => {
  const entry = page.locator('article a[href="/themes/"]');
  await expect(
    entry,
    '主页正文该有一条指向 /themes/ 的入口：另一棵内容根没有入口，就等于站点里少一族',
  ).toHaveCount(1);
  await entry.click();
});

Then('我落在 themes 那一棵内容根的落地页', async ({ page }) => {
  // `themes/README.md` 不写 `slug:`：内容根的 README 天然拿 slug `/`，落在本实例的
  // routeBasePath 上，所以这一格就是 `/themes/`。
  await expect(page).toHaveURL(/\/themes\/$/);
});

Then(
  'themes 那一族每个包都有一张卡，指向各包自己的顶层页',
  async ({ page }) => {
    for (const href of themesHrefs) {
      await expect(
        page.locator(`a.theme-doc-card-container[href="${href}"]`),
        `/themes/ 该有一张指向 ${href} 的卡片`,
      ).toBeVisible();
    }
    // 总数同样钉住：头那一张是这一页自己（内容根的 README 排在这份根级清单的头一格）。
    await expect(
      page.locator('a.theme-doc-card-container'),
      `卡片应是「${themesHrefs.length} 个包 + 落地页那一张」`,
    ).toHaveCount(themesHrefs.length + 1);
  },
);

/**
navbar 那两格（`type: 'docSidebar'`）通向的正是两棵内容根各自的索引页：`/` 是
`packages/README.md`（`slug: /` 落在 `routeBasePath: '/'` 上），`/themes/` 是 `themes/README.md`
（内容根的 README 天然拿 slug `/`，落在它那一份实例的 `routeBasePath: '/themes'` 上）。
这两条地址是配置里那两份 docs 实例的事实，不是抄来的包清单 —— 新增一个包不会多出 navbar 的一格。
*/
Then('navbar 的两格分别通向两棵内容根的索引页', async ({ page }) => {
  const hrefs = await page
    .locator('nav.navbar a.navbar__link')
    .evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );
  expect(
    hrefs,
    `navbar 的格应是「/ 与 /themes/」，实读到 ${JSON.stringify(hrefs)}`,
  ).toEqual(['/', '/themes/']);
});

When(/^我点 navbar 里 "([^"]+)" 那一格$/, async ({ page }, label: string) => {
  // `exact` 不是多余的：`getByRole` 的 `name` 默认按**子串**匹配，「包」会同时命中「主题包」，
  // 严格模式就报错。
  await page
    .locator('nav.navbar')
    .getByRole('link', { name: label, exact: true })
    .click();
});

/**
「当前那一格」判的是官方那条 `navbar__link--active`（`DocSidebarNavbarItem` 按
`activeDoc.sidebar === sidebarId` 点亮）：所以这一句同时钉住「这一页归哪一份 docs 实例」——
两棵根的 docId 各自一套命名空间，都叫 `README`，归属判错就会亮到另一格上。
*/
Then(
  /^navbar 里只有 "([^"]+)" 那一格是当前$/,
  async ({ page }, label: string) => {
    const active = page.locator('nav.navbar a.navbar__link--active');
    await expect(
      active,
      `navbar 该只有一格是当前（${label}），实读到 ${await active.count()} 格`,
    ).toHaveCount(1);
    await expect(active).toHaveText(label);
  },
);
