import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, Then } = createBdd();

/** 仓库根：本文件在 `test/e2e/steps/` 下，往上三层。不靠 cwd，从哪儿跑都对。 */
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/**
## 站点按包组织：顶层页 = 本包 README，子页 = 本包 `docs/`

这一族用例钉的是「页面地址 == 文件在仓库里的路径」这层对应关系（做法见根 `README.md` 与
`sidebars.mts`）。上面那些层用例句子里的「示例页」是 `viewLayers` 那张表注册的，这里两句
问的是包自己的那一格，跟示例页不是一码事，所以单独写。
*/

/** `theme-scalar` 那一格：地址就是 `/theme/theme-scalar/`，尾巴上没有 `README`。 */
Given('我打开 theme-scalar 那一格的顶层页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/theme/theme-scalar/');
});

/**
顶层页的正文取自本包 `README.md`：这一页的 `<h1>` 就是这个包的 package name，
不是某个手写的页面标题。
*/
Then('这一页的正文就是这个包的 README', async ({ page }) => {
  await expect(page).toHaveURL(/\/theme\/theme-scalar\/$/);
  await expect(page.locator('article h1').first()).toHaveText(
    '@show-docs/docusaurus-theme-scalar',
  );
});

/**
那一格侧栏里的子页 = 本包 `docs/` 目录里的那两份（示例页 + 维护者文档）。
判的是「这一格下挂的子页正好是这些」，用前缀选择器数一遍，多一页少一页都会红。
*/
Then('scalar 那一格的子页是示例页与维护者文档那两份', async ({ page }) => {
  // 判的是左侧那一格的子页清单：`.theme-doc-sidebar-menu` 只此一份（实测），而正文底下那条
  // 上一页/下一页也是 `<a href="/theme/theme-scalar/docs/…">`，光按 `nav` 选会把它们数进来。
  const subpages = page.locator(
    '.theme-doc-sidebar-menu a[href^="/theme/theme-scalar/docs/"]',
  );
  await expect(
    subpages.filter({ hasText: 'Scalar 示例' }).first(),
    '子页里少了示例页',
  ).toBeVisible();
  await expect(
    subpages.filter({ hasText: 'theme-scalar 维护者文档' }).first(),
    '子页里少了维护者文档',
  ).toBeVisible();
  await expect(subpages, '子页不止那两份').toHaveCount(2);
});

/**
`demo/` 下那三层假主题（theme-a/b/c）只服务于链式覆盖的夹具，不占站点的一格 ——
`sidebars.mts` 扫的是 `plugins/` 与 `theme/`，压根没有 `demo/`。这一句钉「别忘了排除它」，
哪天有人往清单里加上 `demo`，这里立刻红。
*/
Then('这一格里没有 demo 那三层假主题', async ({ page }) => {
  await expect(
    page.locator('nav a[href^="/demo"]'),
    'demo/ 那三层不该进侧边栏',
  ).toHaveCount(0);
});

/**
子页地址那一串 == 那份文件在仓库里的路径：`/theme/theme-markmap/docs/markmap-demo` 就该是
`theme/theme-markmap/docs/markmap-demo.md`。内容根挪到仓库根之后这件事才成立，所以它值得钉住 ——
文件名后缀按站点收的那几种（`md` / `mdx` / `dbml`）试，一个都不在就是地址与文件脱了。
*/
Then('地址栏那一串就是这个文件在仓库里的路径', async ({ page }) => {
  const withoutLeadingSlash = new URL(page.url()).pathname
    .replace(/^\//, '')
    .replace(/\/$/, '');
  const found = ['md', 'mdx', 'dbml'].map((ext) =>
    path.join(repoRoot, `${withoutLeadingSlash}.${ext}`),
  );
  const exists = found.map((file) => fs.existsSync(file));
  expect(
    exists.some(Boolean),
    `地址 /${withoutLeadingSlash} 在仓库里对不上任何一份文档源（试过 ${found.join('、')}）`,
  ).toBe(true);
});

/**
上一格 = 本包的 README 那一页。

`.breadcrumbs__link` 在这一页有三处命中（实测）：主页、本包那一格，再加**这一页自己** —— 面包屑
末尾那一截也是同一个类名，只是不带 `href`。所以数的是带 `href` 的那两截，末尾那一截单独按文字判。
*/
Then('面包屑的上一格是 theme-markmap 的 README', async ({ page }) => {
  const links = page.locator('.breadcrumbs__link[href]');
  await expect(
    links,
    '面包屑该是「主页 → theme-markmap 那一格」两截',
  ).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('href', '/');
  await expect(links.nth(1)).toHaveAttribute('href', '/theme/theme-markmap/');
});
