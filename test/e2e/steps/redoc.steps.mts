import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { watchPageErrors } from '../helpers.mts';

const { Given, When, Then } = createBdd();

/**
Redoc 的路由是**按路径**的（不是 hash），左栏那些链接由它自己按 `basePath` 拼出来，
所以这一页指的是 `/redoc-demo/…`。它把 `operationId` 小写进地址（`createOrder` →
`createorder`），下面的 href 按浏览器里真的那串写。

每条都限定在 `.menu-content` 里：正文面板上也有指向同一个接口的锚（标签标题旁那个
「link to orders」），不限定就会命中两处，Playwright 的严格模式直接报错。
*/
const menu = (page: Page): Locator => page.locator('.redoc-root .menu-content');

const menuHref = (name: string): string => `/redoc-demo/orders/${name}`;

/** Redoc 渲染的容器，也是本层挂上去的那一格。 */
const root = (page: Page): Locator => page.locator('.redoc-root');

Given('我打开 redoc 示例页', async ({ page }) => {
  watchPageErrors(page);
  await page.goto('/redoc-demo');
});

// 取的是 `static/openapi.yaml`（产物里的 `/openapi.yaml`）：文档标题先证明它真取到了。
Then('Redoc 接管了这一页，读的是本站那份 yaml', async ({ page }) => {
  await expect(
    root(page),
    '`.redoc-root` 没出现：`redoc:` 那一步没命中或浏览器端没渲染',
  ).toBeVisible();
  await expect(root(page), '左栏没有 API 标题：spec 没取到').toContainText(
    '主题覆盖演示 API',
  );
});

// Redoc 自带一个 BrowserRouter，按 `basePath` 判「当前地址属于哪一格」。basePath 给错时
// 它一个字都不报，而是把**自己那份 404** 摆在正文区（实测过：页面看着一切正常，
// 中间写着 No page at this address，控制台干净）。所以这一条单独钉。
Then('Redoc 自己的 404 没有出现', async ({ page }) => {
  await expect(
    root(page).locator('.not-found-page'),
    'Redoc 没匹配到当前地址：basePath 没跟上这一页的路径',
  ).toHaveCount(0);
});

// 三个接口挂在 `orders` 分组下面，分组默认折叠（折叠时接口链接不在 DOM 里），先点开。
When('我点开 Redoc 左栏的 orders 分组', async ({ page }) => {
  await menu(page).locator('a[href="/redoc-demo/orders"]').click();
});

Then('三个接口都在 Redoc 的左栏里', async ({ page }) => {
  for (const name of ['listorders', 'createorder', 'getorder']) {
    await expect(
      menu(page).locator(`a[href="${menuHref(name)}"]`),
      `API 导航里少了「${name}」`,
    ).toBeVisible();
  }
});

When('我点开 Redoc 左栏里新建订单那条接口', async ({ page }) => {
  await menu(page)
    .locator(`a[href="${menuHref('createorder')}"]`)
    .click();
});

// 地址换成那条接口的路径，详情面板的标题也跟着换 —— 到这一步才算真渲染了内容。
Then('详情面板换成那条接口', async ({ page }) => {
  await expect(page).toHaveURL(/\/redoc-demo\/orders\/createorder$/);
  await expect(
    root(page).locator('h1, h2'),
    '接口详情没渲染出来',
  ).toContainText([
    '主题覆盖演示 API (1.0.0)',
    'orders',
    '列出订单',
    '新建订单',
  ]);
});

// 整页交给 Redoc 时容器不留白：`redoc-ui.css` 那条 `.container:has(.redoc-root)`。
Then('正文容器在这一页让位', async ({ page }) => {
  const container = page.locator('.container:has(.redoc-root)');
  await expect(container, 'Redoc 没落在 `.container` 里').toHaveCount(1);
  await expect(container).toHaveCSS('padding', '0px');
});

/**
这一层**不做**构建期样式圈定：Redoc 的样式是 styled-components 在运行时插进 `<head>` 的，
PostCSS 那一遍拿不到那份文件（取舍记在 `theme/theme-redoc/README.md`）。

外溢不是猜的，是量的：把那张表的每条规则真的拿去问 DOM —— 命中的元素里有 **不在
`.redoc-root` 里** 的、并且改的是**真属性**（不是 `--*` 那种自定义变量），就算漏出去了。
`redoc@3.0.1` 在这一页量出来恰好三条：

- `:root` —— 往 `<html>` 上写背景色、文字色、字体；
- `:root *` —— 全局 `box-sizing: border-box`；
- `button` —— 裸标签选择器，会打到站点自己的 `<button class="clean-btn">`（navbar 上那个
  亮/暗切换）。

这三条就是「接受外溢」那一步的实际内容，所以这里钉的是**集合等于这三条**：将来 Redoc
再往全局多写一条（或改了名字），用例就红，文档得跟着改 —— 而不是让它静悄悄生效。
（离开这一页之后 styled-components 会回收这些规则，主页上的 `<html>` 与那个按钮实测照旧。）

DOM 元素从外面递进来（取的是 `el.ownerDocument`，不写裸的 `document`）：`evaluate` 的回调
是在浏览器里跑的独立函数，闭不到 Node 侧的名字 —— 漏了就是一处只在浏览器里炸的引用。
*/
Then('Redoc 外溢到站点元素的就是那三条', async ({ page }) => {
  const escaping = await page.locator('html').evaluate((el) => {
    const found: string[] = [];

    // `ownerNode` 的类型上还有 `ProcessingInstruction` 那一格（XML 样式处理指令），
    // 本仓的表都是 `<style>`，按元素取属性前先收窄。
    const sheet = [...el.ownerDocument.styleSheets].find(
      (s) =>
        (s.ownerNode as Element | null)?.hasAttribute('data-styled-version') ??
        false,
    );
    if (!sheet?.cssRules) {
      return ['浏览器里没找到 styled-components 注入的那张样式表'];
    }

    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        const grouped = rule as CSSGroupingRule;
        if (grouped.cssRules && !(rule as CSSStyleRule).selectorText) {
          // `@media` 这类容器：往里走。`@keyframes` 里的 from/to 没有选择器，不参与判型。
          if ((rule as unknown as { type?: number }).type !== 7) {
            walk(grouped.cssRules);
          }
          continue;
        }

        const styleRule = rule as CSSStyleRule;
        const selector = styleRule.selectorText;
        if (!selector || !styleRule.style) {
          continue;
        }

        let matched: Element[];
        try {
          matched = [...el.ownerDocument.querySelectorAll(selector)];
        } catch {
          found.push(`读不了的 selector：${selector}`);
          continue;
        }
        if (matched.every((node) => node.closest('.redoc-root'))) {
          continue;
        }

        const written: string[] = [];
        for (let i = 0; i < styleRule.style.length; i += 1) {
          const name = styleRule.style.item(i);
          if (name && !name.startsWith('--')) {
            written.push(name);
          }
        }
        if (written.length > 0) {
          found.push(selector);
        }
      }
    };

    try {
      walk(sheet.cssRules);
    } catch {
      // 跨源样式表读不到规则（本仓没有这种表）。
      return ['读不到 styled-components 那张表的规则'];
    }

    return [...new Set(found)];
  });

  // 按**集合**比，不按顺序：这一步要钉的是「漏出去的就是这三条」，多一条少一条都算红。
  expect(
    new Set(escaping),
    `外溢出去的选择不等于记下的那三条，实际是：${escaping.join('、')}`,
  ).toEqual(new Set([':root', ':root *', 'button']));
});
