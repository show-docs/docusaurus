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

这一族用例钉的是「页面地址 == 文件相对**它所属那棵内容根**的路径」这层对应关系（两棵根与各自的
`routeBasePath` 见根 `README.md`、`docusaurus.config.mjs` 与那两份侧栏文件）。上面那些层用例句子里
的「示例页」是 `viewLayers` 那张表注册的，这里两句问的是包自己的那一格，跟示例页不是一码事，
所以单独写。
*/

/** `theme-scalar` 那一格：地址就是 `/theme-scalar/`，尾巴上没有 `README`。 */
Given('我打开 theme-scalar 那一格的顶层页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/theme-scalar/');
});

/**
顶层页的正文取自本包 `README.md`：这一页的 `<h1>` 就是这个包的 package name，
不是某个手写的页面标题。
*/
Then('这一页的正文就是这个包的 README', async ({ page }) => {
  await expect(page).toHaveURL(/\/theme-scalar\/$/);
  await expect(page.locator('article h1').first()).toHaveText(
    '@show-docs/docusaurus-theme-scalar',
  );
});

/**
那一格侧栏里的子页 = 本包 `docs/` 目录里的那几页（示例页、AsyncAPI 那一版示例页、维护者文档）。
判的是「这一格下挂的子页正好是这些」，用前缀选择器数一遍，多一页少一页都会红。

清单**从磁盘那份目录算出来**，不手抄 —— 往 `docs/` 里再放一页（示例页、AsyncAPI 那一版…）时
这里跟着走，不必改这句；反过来，少挂一页或多挂一页都会红。

（句子里那个 `docs` 后面**不能带斜杠** —— 步骤文本是 Cucumber Expression，`/` 是「或」，
写成 `docs/ 目录` 会在生成用例时报 `Alternative may not be empty`。）
*/
Then('scalar 那一格的子页就是本包 docs 目录里那几页', async ({ page }) => {
  // 判的是左侧那一格的子页清单：`.theme-doc-sidebar-menu` 只此一份（实测），而正文底下那条
  // 上一页/下一页也是 `<a href="/theme-scalar/docs/…">`，光按 `nav` 选会把它们数进来。
  const subpages = page.locator(
    '.theme-doc-sidebar-menu a[href^="/theme-scalar/docs/"]',
  );

  const expected = fs
    .readdirSync(path.join(repoRoot, 'packages', 'theme-scalar', 'docs'))
    .filter((name) => /\.(?:md|mdx|dbml)$/.test(name))
    .map((name) => `/theme-scalar/docs/${name.replace(/\.[^.]+$/, '')}`)
    .toSorted((a, b) => a.localeCompare(b));

  for (const href of expected) {
    await expect(
      page.locator(`.theme-doc-sidebar-menu a[href="${href}"]`).first(),
      `子页里少了 ${href}`,
    ).toBeVisible();
  }
  await expect(subpages, '子页与本包 docs/ 目录里那几页对不上').toHaveCount(
    expected.length,
  );
});

/**
`tools/` 下那三层假主题（theme-a/b/c）只服务于链式覆盖的夹具，不占站点的一格 ——
`sidebars.mts` 扫的是 `packages/`，压根没有 `tools/`。这一句钉「别忘了排除它」，
哪天有人往清单里加上 `tools`，这里立刻红。
*/
Then('这一格里没有 tools 那三层假主题', async ({ page }) => {
  await expect(
    page.locator('nav a[href^="/tools"]'),
    'tools/ 那三层不该进侧边栏',
  ).toHaveCount(0);
});

/**
子页地址那一串 == 那份文件相对**它所属那棵内容根**的路径：`/theme-markmap/docs/markmap-demo`
就该是 `packages/theme-markmap/docs/markmap-demo.md`，`/themes/theme-viewer/docs/viewer-demo`
就该是 `themes/theme-viewer/docs/viewer-demo.md`。

两棵根的地址形状是**不对称**的，所以这里按「前缀 → 内容根」查一张小表，而不是把目录名拼回去：
`packages/` 那一份实例的 `routeBasePath` 是 `'/'`（地址里没有 `packages` 这一段），
`themes/` 那一份的是 `'/themes'`（地址里那一段和目录同名，纯属两棵根恰好同名，不是规律）。
文件名后缀按站点收的那几种（`md` / `mdx` / `dbml`）试，一个都不在就是地址与文件脱了。
*/
const DOCS_INSTANCES = [
  // 空前缀那条排在最后：`startsWith('')` 对任何地址都成立，先匹配就永远匹配错
  { prefix: 'themes/', contentRoot: 'themes' },
  { prefix: '', contentRoot: 'packages' },
] as const;

Then('地址栏那一串就是这份文件相对它所属内容根的路径', async ({ page }) => {
  const withoutLeadingSlash = new URL(page.url()).pathname
    .replace(/^\//, '')
    .replace(/\/$/, '');
  const instance = DOCS_INSTANCES.find(({ prefix }) =>
    withoutLeadingSlash.startsWith(prefix),
  )!;
  const relative = withoutLeadingSlash.slice(instance.prefix.length);
  const found = ['md', 'mdx', 'dbml'].map((ext) =>
    path.join(repoRoot, instance.contentRoot, `${relative}.${ext}`),
  );
  const exists = found.map((file) => fs.existsSync(file));
  expect(
    exists.some(Boolean),
    `地址 /${withoutLeadingSlash} 在 ${instance.contentRoot}/ 下对不上任何一份文档源（试过 ${found.join('、')}）`,
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
  await expect(links.nth(1)).toHaveAttribute('href', '/theme-markmap/');
});
