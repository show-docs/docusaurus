import { expect, test } from '@playwright/test';

import { watchPageErrors } from './helpers.mts';

test('theme-stoplight：命中页整页交给 OpenAPI 渲染器，样式不外溢', async ({
  page,
}) => {
  const errors = watchPageErrors(page);

  await page.goto('/stoplight-demo');

  const root = page.locator('.stoplight-root');
  await expect(
    root,
    '`.stoplight-root` 没出现：`oas3:` 那一步没命中或浏览器端没渲染',
  ).toBeVisible();

  // 取的是 `static/openapi.yaml`（产物里的 `/openapi.yaml`）：文档标题先证明它真取到了。
  await expect(root.locator('h1')).toContainText('主题覆盖演示 API');

  // 三个接口在左栏 `orders` 分组下面，而这一组**默认折叠**（折叠时链接根本不在 DOM 里），
  // 所以先点开它，再逐个确认。
  await root
    .locator('div.sl-cursor-pointer')
    .filter({ hasText: /^orders$/ })
    .click();
  for (const operationId of ['listOrders', 'createOrder', 'getOrder']) {
    await expect(
      root.locator(`a[href="#/operations/${operationId}"]`),
      `API 导航里少了「${operationId}」`,
    ).toBeVisible();
  }

  // 点一条接口：hash 路由跳过去，详情面板的标题（`h1`）换成这条接口的 summary ——
  // 到这一步才算真的渲染了文档内容，光有导航链接不能证明。概览页上这个 `h1` 是 API 标题，
  // 所以这里是对同一个元素换了内容。
  await root.locator('a[href="#/operations/createOrder"]').click();
  await expect(page).toHaveURL(/#\/operations\/createOrder$/);
  await expect(root.locator('h1'), '接口详情没渲染出来').toContainText(
    '新建订单',
  );

  // 命中时这一层**不包**下层 `DocItem`，所以这一页没有文档正文外壳。
  await expect(page.locator('article'), '整页没交给 Stoplight').toHaveCount(0);

  // 圈样式这一格：`@stoplight/elements` 的表是全局选择器，入口的 postcss 那一步把每条
  // 都放进 `.stoplight-root`。判据直接问浏览器里的样式表：凡是提到 `.sl-` 的选择器都必须
  // 带着这个前缀。
  // DOM 元素从外面递进来（取的是 `el.ownerDocument`，不写裸的 `document`）：`evaluate` 的回调
  // 是在浏览器里跑的独立函数，闭不到 Node 侧的名字 —— 漏了就是一处只在浏览器里炸的引用。
  const leaked = await page.locator('html').evaluate((el) => {
    const bad: string[] = [];

    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        // `@media` / `@supports` 这类容器没有 selectorText，往里走一层。
        const grouped = rule as CSSGroupingRule;
        if (grouped.cssRules) {
          walk(grouped.cssRules);
          continue;
        }
        const selector = (rule as CSSStyleRule).selectorText ?? '';
        if (
          selector.includes('.sl-') &&
          !selector.includes('.stoplight-root')
        ) {
          bad.push(selector);
        }
      }
    };

    for (const sheet of el.ownerDocument.styleSheets) {
      try {
        if (sheet.cssRules) {
          walk(sheet.cssRules);
        }
      } catch {
        // 跨源样式表读不到规则，跳过（本仓没有这种表）。
      }
    }

    return bad;
  });

  expect(
    leaked.slice(0, 5),
    `这些 .sl- 选择器没被圈进 .stoplight-root：${leaked.slice(0, 5).join('、')}`,
  ).toEqual([]);

  expect(errors, errors.join('\n')).toEqual([]);
});
